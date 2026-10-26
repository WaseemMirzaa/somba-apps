import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataSource } from 'typeorm';

/**
 * SQLite (the local-dev database) has ONE connection, and TypeORM hands that same connection to every caller.
 * Two overlapping `manager.transaction()` calls therefore start "nested" transactions on it and trip over each
 * other: one gets `cannot start a transaction within a transaction`, another `Transaction is not started yet`, and
 * a rollback can undo the other's work. Two customers checking out at the same moment got a raw driver error
 * where MySQL (a pool, row locks) simply lets the contended row decide the winner.
 *
 * This makes the DataSource run top-level transactions one at a time, in arrival order. A transaction opened
 * from inside a running one (the same async flow, found with AsyncLocalStorage) is a nested one and goes straight
 * through, so a callback may still call `ds.transaction(...)` or another service that does. MySQL is untouched.
 *
 * Limits: it only orders transactions (plain queries from other requests still share the connection, which is
 * SQLite itself; production runs MySQL, see assert-production.ts), and a callback must not wait on a transaction
 * started outside its own async flow (that one would be queued behind it).
 */
export function serializeSqliteTransactions<T extends DataSource>(ds: T): T {
  if (ds.options.type !== 'better-sqlite3') return ds;

  type Run = (...args: unknown[]) => Promise<unknown>;
  const flow = new AsyncLocalStorage<{ open: boolean }>();
  let tail: Promise<void> = Promise.resolve();

  // Every repository and `ds.transaction()` go through this one manager (a transaction's own manager is separate).
  const manager = ds.manager;
  const original = manager.transaction.bind(manager) as unknown as Run;
  manager.transaction = (async (...args: unknown[]) => {
    if (flow.getStore()?.open) return original(...args);
    const before = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => (release = resolve));
    await before;
    const scope = { open: true };
    try {
      return await flow.run(scope, () => original(...args));
    } finally {
      scope.open = false;
      release();
    }
  }) as typeof manager.transaction;
  return ds;
}
