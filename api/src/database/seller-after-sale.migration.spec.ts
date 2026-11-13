import { DataSource } from 'typeorm';
import { SellerAfterSaleView1793530000001 } from './migrations/1793530000001-SellerAfterSaleView';

describe('SellerAfterSaleView migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE "sellers" ("id" varchar PRIMARY KEY NOT NULL, "name" varchar NOT NULL)`);
    await ds.query(`INSERT INTO sellers VALUES ('s1','Store')`);
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new SellerAfterSaleView1793530000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const cols = async (t: string) => ((await ds.query(`PRAGMA table_info("${t}")`)) as { name: string }[]).map((c) => c.name);

  it('adds the override column (null for existing stores) and the thread table with its index', async () => {
    await run('up');
    expect(await cols('sellers')).toContain('afterSaleAccess');
    expect((await ds.query(`SELECT afterSaleAccess FROM sellers`))[0].afterSaleAccess).toBeNull();
    expect(await cols('case_seller_messages')).toEqual(expect.arrayContaining(['id', 'caseKind', 'caseId', 'sellerId', 'authorId', 'authorSide', 'text', 'createdAt', 'readBySellerAt', 'readBySupportAt']));
    const idx = (await ds.query(`PRAGMA index_list("case_seller_messages")`)) as { name: string }[];
    expect(idx.map((i) => i.name)).toContain('IDX_case_seller_messages_case');
    await ds.query(`INSERT INTO case_seller_messages (id, caseKind, caseId, sellerId, authorSide, text) VALUES ('m1','return','r1','s1','seller','hi')`);
    expect((await ds.query(`SELECT createdAt FROM case_seller_messages`))[0].createdAt).toBeTruthy();
  });

  it('runs twice without error and down removes both', async () => {
    await run('up');
    await run('up');
    await run('down');
    expect(await cols('sellers')).not.toContain('afterSaleAccess');
    expect((await ds.query(`SELECT name FROM sqlite_master WHERE name = 'case_seller_messages'`)).length).toBe(0);
    await run('down');
  });
});
