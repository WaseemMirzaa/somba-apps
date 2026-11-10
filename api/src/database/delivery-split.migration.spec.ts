import { DataSource } from 'typeorm';
import { DeliveryPrepSplitExpress1793450000001 } from './migrations/1793450000001-DeliveryPrepSplitExpress';

/** The prep / split / express columns: written with the QueryRunner API, so they run on SQLite (tests) as well as MySQL. */
describe('DeliveryPrepSplitExpress migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE products (id varchar PRIMARY KEY NOT NULL, deliveryDays integer NOT NULL DEFAULT 3)`);
    await ds.query(`CREATE TABLE sellers (id varchar PRIMARY KEY NOT NULL, handlingDays integer NOT NULL DEFAULT 0)`);
    await ds.query(`CREATE TABLE orders (id varchar PRIMARY KEY NOT NULL)`);
    await ds.query(`CREATE TABLE order_items (id varchar PRIMARY KEY NOT NULL)`);
    await ds.query(`CREATE TABLE delivery_tasks (id varchar PRIMARY KEY NOT NULL, kind varchar NOT NULL DEFAULT 'delivery', status varchar NOT NULL DEFAULT 'unassigned')`);
    for (const [id, days] of [['p0', 0], ['p1', 1], ['p2', 2], ['p3', 3], ['p4', 4], ['p30', 30]] as const) {
      await ds.query(`INSERT INTO products (id, deliveryDays) VALUES (?, ?)`, [id, days]);
    }
    await ds.query(`INSERT INTO sellers (id) VALUES ('s1')`);
    await ds.query(`INSERT INTO orders (id) VALUES ('o1')`);
    await ds.query(`INSERT INTO order_items (id) VALUES ('i1')`);
    await ds.query(`INSERT INTO delivery_tasks (id) VALUES ('t1')`);
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new DeliveryPrepSplitExpress1793450000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const cols = async (table: string) => ((await ds.query(`PRAGMA table_info("${table}")`)) as { name: string }[]).map((c) => c.name);
  const indexes = async () => ((await ds.query(`PRAGMA index_list("delivery_tasks")`)) as { name: string }[]).map((i) => i.name);

  it('backfills prepDays from the legacy delivery time: 1 -> 0, 4 -> 3, 30 -> 29 (never below 0)', async () => {
    await run('up');
    const rows = (await ds.query(`SELECT id, prepDays, deliveryDays FROM products ORDER BY deliveryDays`)) as { id: string; prepDays: number; deliveryDays: number }[];
    expect(Object.fromEntries(rows.map((r) => [r.id, r.prepDays]))).toEqual({ p0: 0, p1: 0, p2: 1, p3: 2, p4: 3, p30: 29 });
    // the legacy column is untouched
    expect(Object.fromEntries(rows.map((r) => [r.id, r.deliveryDays]))).toEqual({ p0: 0, p1: 1, p2: 2, p3: 3, p4: 4, p30: 30 });
  });

  it('adds every column with its default and leaves existing rows alone', async () => {
    await run('up');
    expect(await ds.query(`SELECT expressDelivery FROM sellers`)).toEqual([{ expressDelivery: 0 }]);
    expect(await ds.query(`SELECT deliveryMode FROM orders`)).toEqual([{ deliveryMode: 'standard' }]);
    expect(await ds.query(`SELECT deliveredAt, deliveryTaskId FROM order_items`)).toEqual([{ deliveredAt: null, deliveryTaskId: null }]);
    expect(await ds.query(`SELECT sellerIds FROM delivery_tasks`)).toEqual([{ sellerIds: null }]);
    // a product inserted later gets the new default preparation time
    await ds.query(`INSERT INTO products (id) VALUES ('new')`);
    expect(await ds.query(`SELECT prepDays FROM products WHERE id = 'new'`)).toEqual([{ prepDays: 2 }]);
    expect(await indexes()).toContain('IDX_delivery_tasks_kind_status');
  });

  it('is safe to run twice (the backfill does not run again)', async () => {
    await run('up');
    await ds.query(`UPDATE products SET prepDays = 7 WHERE id = 'p4'`);
    await run('up');
    expect(await ds.query(`SELECT prepDays FROM products WHERE id = 'p4'`)).toEqual([{ prepDays: 7 }]);
  });

  it('down removes every column and the index again', async () => {
    await run('up');
    await run('down');
    expect(await cols('products')).toEqual(['id', 'deliveryDays']);
    expect(await cols('sellers')).toEqual(['id', 'handlingDays']);
    expect(await cols('orders')).toEqual(['id']);
    expect(await cols('order_items')).toEqual(['id']);
    expect(await cols('delivery_tasks')).toEqual(['id', 'kind', 'status']);
    expect(await indexes()).not.toContain('IDX_delivery_tasks_kind_status');
    await run('down'); // safe twice
  });
});
