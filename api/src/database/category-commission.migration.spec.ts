import { DataSource } from 'typeorm';
import { CategoryCommission1793490000001 } from './migrations/1793490000001-CategoryCommission';

/** `categories.commissionPct`: written with the QueryRunner API, so it runs on SQLite (tests) as well as MySQL. */
describe('CategoryCommission migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE categories (id varchar PRIMARY KEY NOT NULL, name varchar NOT NULL)`);
    await ds.query(`INSERT INTO categories (id, name) VALUES ('c1', 'Phones')`);
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new CategoryCommission1793490000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const cols = async () => ((await ds.query(`PRAGMA table_info("categories")`)) as { name: string }[]).map((c) => c.name);

  it('adds a nullable column and leaves existing categories on the default (NULL, not 0)', async () => {
    await run('up');
    expect(await cols()).toContain('commissionPct');
    expect(await ds.query(`SELECT commissionPct FROM categories`)).toEqual([{ commissionPct: null }]);
  });

  it('keeps 0 as a real rate', async () => {
    await run('up');
    await ds.query(`UPDATE categories SET commissionPct = 0 WHERE id = 'c1'`);
    expect(await ds.query(`SELECT commissionPct FROM categories`)).toEqual([{ commissionPct: 0 }]);
  });

  it('is safe to run twice and does not touch a rate already set', async () => {
    await run('up');
    await ds.query(`UPDATE categories SET commissionPct = 7.5`);
    await run('up');
    expect(await ds.query(`SELECT commissionPct FROM categories`)).toEqual([{ commissionPct: 7.5 }]);
  });

  it('down drops the column and is safe to run twice', async () => {
    await run('up');
    await run('down');
    expect(await cols()).not.toContain('commissionPct');
    await run('down');
    expect(await cols()).toEqual(['id', 'name']);
  });
});
