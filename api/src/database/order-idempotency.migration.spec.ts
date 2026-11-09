import { DataSource } from 'typeorm';
import { OrderIdempotency1793400000001 } from './migrations/1793400000001-OrderIdempotency';

/** The order-idempotency migration (C-01) runs on SQLite (tests, local dev) as well as MySQL: QueryRunner table API only. */
describe('OrderIdempotency migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE "orders" ("id" varchar(36) PRIMARY KEY NOT NULL, "customerId" varchar NOT NULL, "note" varchar)`);
    await ds.query(`INSERT INTO "orders" ("id","customerId","note") VALUES ('a','c1','kept'), ('b','c1','kept')`);
  });
  afterEach(async () => ds.destroy());

  const cols = async (t: string) => (await ds.query(`PRAGMA table_info("${t}")`)).map((c: { name: string }) => c.name);
  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new OrderIdempotency1793400000001()[dir](q);
    } finally {
      await q.release();
    }
  };

  it('adds the key column (existing orders keep NULL) and the claims table', async () => {
    await run('up');
    expect(await cols('orders')).toContain('clientRequestId');
    expect(await ds.query(`SELECT note, clientRequestId FROM orders ORDER BY id`)).toEqual([
      { note: 'kept', clientRequestId: null },
      { note: 'kept', clientRequestId: null },
    ]);
    expect(await cols('order_requests')).toEqual(['customerId', 'requestKey', 'orderId', 'startedAt', 'finishedAt', 'outcome']);
  });

  it('one order per customer and key; another customer may use the same key', async () => {
    await run('up');
    await ds.query(`UPDATE orders SET clientRequestId = 'k1' WHERE id = 'a'`);
    await expect(ds.query(`UPDATE orders SET clientRequestId = 'k1' WHERE id = 'b'`)).rejects.toThrow(/UNIQUE/i);
    await ds.query(`INSERT INTO orders (id, customerId, clientRequestId) VALUES ('c', 'c2', 'k1')`);
    await ds.query(`INSERT INTO order_requests (customerId, requestKey, orderId, startedAt) VALUES ('c1', 'k:k1', 'a', '2026-01-01 00:00:00')`);
    await expect(ds.query(`INSERT INTO order_requests (customerId, requestKey, orderId, startedAt) VALUES ('c1', 'k:k1', 'z', '2026-01-01 00:00:00')`)).rejects.toThrow(/UNIQUE/i);
  });

  it('runs twice without harm and can be reverted', async () => {
    await run('up');
    await run('up');
    await run('down');
    expect(await cols('orders')).not.toContain('clientRequestId');
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'order_requests'`)).toEqual([]);
    expect(await ds.query(`SELECT count(*) AS n FROM orders`)).toEqual([{ n: 2 }]);
  });
});
