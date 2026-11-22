import { DataSource } from 'typeorm';
import { VatAndFeePayer1793560000001 } from './migrations/1793560000001-VatAndFeePayer';

/** VAT + fee payer columns: QueryRunner API only, so it runs on SQLite (tests) as well as MySQL. */
describe('VatAndFeePayer migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    for (const t of ['categories', 'order_items', 'orders', 'payout_statement_lines']) await ds.query(`CREATE TABLE ${t} (id varchar PRIMARY KEY NOT NULL)`);
    for (const t of ['categories', 'order_items', 'orders', 'payout_statement_lines']) await ds.query(`INSERT INTO ${t} (id) VALUES ('a')`);
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new VatAndFeePayer1793560000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const cols = async (t: string) => ((await ds.query(`PRAGMA table_info("${t}")`)) as { name: string }[]).map((c) => c.name);

  it('adds the columns; old rows get 0 / customer and a category stays on the default (NULL)', async () => {
    await run('up');
    expect(await ds.query(`SELECT vatPct FROM categories`)).toEqual([{ vatPct: null }]);
    expect(await ds.query(`SELECT vatPct, vatUsd, sellerFeeUsd FROM order_items`)).toEqual([{ vatPct: 0, vatUsd: 0, sellerFeeUsd: 0 }]);
    expect(await ds.query(`SELECT vatUsd, deliveryFeePaidBy FROM orders`)).toEqual([{ vatUsd: 0, deliveryFeePaidBy: 'customer' }]);
    expect(await ds.query(`SELECT deliveryFeeUsd FROM payout_statement_lines`)).toEqual([{ deliveryFeeUsd: 0 }]);
  });

  it('keeps 0 as a real category rate and is safe to run twice without touching values', async () => {
    await run('up');
    await ds.query(`UPDATE categories SET vatPct = 0`);
    await ds.query(`UPDATE orders SET vatUsd = 1.6, deliveryFeePaidBy = 'seller'`);
    await run('up');
    expect(await ds.query(`SELECT vatPct FROM categories`)).toEqual([{ vatPct: 0 }]);
    expect(await ds.query(`SELECT vatUsd, deliveryFeePaidBy FROM orders`)).toEqual([{ vatUsd: 1.6, deliveryFeePaidBy: 'seller' }]);
  });

  it('down drops every column and is safe to run twice', async () => {
    await run('up');
    await run('down');
    await run('down');
    for (const t of ['categories', 'order_items', 'orders', 'payout_statement_lines']) expect(await cols(t)).toEqual(['id']);
  });
});
