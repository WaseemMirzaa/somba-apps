import type { EntityManager } from 'typeorm';
import { Order } from '../database/entities';

/**
 * Take the order's row lock inside the open transaction `m`: two requests for the same order queue up on it and the second one
 * re-reads what the first wrote. MySQL only (`SELECT … FOR UPDATE`); SQLite already serialises its writers.
 */
export async function lockOrder(m: EntityManager, orderId: string): Promise<void> {
  if (m.connection.options.type !== 'mysql') return;
  await m.createQueryBuilder().select('o.id').from(Order, 'o').where('o.id = :orderId', { orderId }).setLock('pessimistic_write').getRawOne();
}

/** Work that is waiting for, or holding, one order's turn in this process. */
const queues = new Map<string, Promise<unknown>>();

/**
 * Run `fn` alone for an order: an in-process queue per order (one API instance, see ARCHITECTURE.md) plus a transaction that
 * holds the order's row lock (`lockOrder`), so work from a second instance queues on the database instead. `fn` reads and
 * writes through the transaction's manager; announcements and emits belong AFTER this returns (after the commit). Do not call
 * it again for the same order from inside `fn`: the queue would wait for itself.
 */
export function withOrderLock<T>(manager: EntityManager, orderId: string, fn: (m: EntityManager) => Promise<T>): Promise<T> {
  return withOrderLocks(manager, [orderId], fn);
}

/**
 * The same for several orders at once (packing a group of orders): the turns are taken in sorted id order, in one transaction,
 * so two callers that name the same orders in any order can never wait for each other.
 */
export function withOrderLocks<T>(manager: EntityManager, orderIds: string[], fn: (m: EntityManager) => Promise<T>): Promise<T> {
  const ids = [...new Set(orderIds)].sort();
  const before = Promise.all(ids.map((id) => queues.get(id) ?? Promise.resolve()));
  const run = before.then(
    () => manager.transaction(async (m) => {
      for (const id of ids) await lockOrder(m, id);
      return fn(m);
    }),
    () => undefined as never,
  );
  // The queue entries never reject (the next in line starts whether this one worked or not) and clean themselves up.
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  for (const id of ids) queues.set(id, tail);
  void tail.then(() => {
    for (const id of ids) if (queues.get(id) === tail) queues.delete(id);
  });
  return run;
}
