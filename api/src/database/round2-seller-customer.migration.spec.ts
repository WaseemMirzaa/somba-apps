import { DataSource } from 'typeorm';
import { SellerCustomerRound21793260000001 } from './migrations/1793260000001-SellerCustomerRound2';

/** The round-2 seller/customer migration runs on SQLite (tests, local dev) as well as MySQL: QueryRunner table API only. */
describe('SellerCustomerRound2 migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    for (const t of ['reviews', 'disputes', 'replacements', 'exchanges']) {
      await ds.query(`CREATE TABLE "${t}" ("id" varchar(36) PRIMARY KEY NOT NULL, "note" varchar)`);
      await ds.query(`INSERT INTO "${t}" ("id","note") VALUES ('a','kept')`);
    }
  });
  afterEach(async () => ds.destroy());

  const cols = async (t: string) => (await ds.query(`PRAGMA table_info("${t}")`)).map((c: { name: string }) => c.name);
  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new SellerCustomerRound21793260000001()[dir](q);
    } finally {
      await q.release();
    }
  };

  it('adds the review photos, the lapse marks and the follows table, keeping existing rows', async () => {
    await run('up');
    expect(await cols('reviews')).toContain('photos');
    for (const t of ['disputes', 'replacements', 'exchanges']) expect(await cols(t)).toContain('sellerLapsedAt');
    expect(await cols('store_follows')).toEqual(expect.arrayContaining(['id', 'userId', 'sellerId', 'createdAt']));
    const idx = (await ds.query(`PRAGMA index_list("store_follows")`)) as { name: string; unique: number }[];
    expect(idx.find((i) => i.name === 'IDX_store_follows_unique')?.unique).toBe(1);
    expect(await ds.query(`SELECT note, photos FROM reviews`)).toEqual([{ note: 'kept', photos: null }]);
  });

  it('one follow per customer and store', async () => {
    await run('up');
    await ds.query(`INSERT INTO store_follows (id,userId,sellerId) VALUES ('1','u','s')`);
    await expect(ds.query(`INSERT INTO store_follows (id,userId,sellerId) VALUES ('2','u','s')`)).rejects.toThrow();
  });

  it('is safe to run twice and reverts cleanly', async () => {
    await run('up');
    await run('up');
    await run('down');
    expect(await cols('reviews')).not.toContain('photos');
    expect(await cols('disputes')).not.toContain('sellerLapsedAt');
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name = 'store_follows'`)).toEqual([]);
  });
});
