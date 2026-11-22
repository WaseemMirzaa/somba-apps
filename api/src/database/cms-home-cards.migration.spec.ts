import { DataSource } from 'typeorm';
import { CmsHomeCards1793590000001 } from './migrations/1793590000001-CmsHomeCards';

describe('CmsHomeCards migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(
      `CREATE TABLE "cms_blocks" ("id" varchar PRIMARY KEY NOT NULL, "key" varchar NOT NULL, "title" varchar NOT NULL, "body" text NOT NULL, "type" varchar NOT NULL DEFAULT 'banner', "active" boolean NOT NULL DEFAULT 1, "updatedAt" datetime NOT NULL)`,
    );
    await ds.query(
      `INSERT INTO cms_blocks VALUES ('a','home-hero','t','b','banner',1,'2026-01-01'), ('b','promo-strip','t','b','strip',1,'2026-02-01')`,
    );
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new CmsHomeCards1793590000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const cols = async () => (await ds.query(`PRAGMA table_info("cms_blocks")`)).map((c: { name: string }) => c.name) as string[];

  it('adds the card columns, keeps the existing order and fixes the old strip type', async () => {
    await run('up');
    expect(await cols()).toEqual(expect.arrayContaining(['imageUrl', 'linkType', 'linkTarget', 'ctaText', 'ctaTextFr', 'sortOrder', 'startsAt', 'endsAt', 'colorKey']));
    const rows = (await ds.query(`SELECT key, type, sortOrder, imageUrl FROM cms_blocks ORDER BY sortOrder`)) as { key: string; type: string; sortOrder: number; imageUrl: string | null }[];
    expect(rows).toEqual([
      { key: 'home-hero', type: 'banner', sortOrder: 10, imageUrl: null },
      { key: 'promo-strip', type: 'banner', sortOrder: 20, imageUrl: null },
    ]);
  });

  it('runs twice without changing anything', async () => {
    await run('up');
    await ds.query(`UPDATE cms_blocks SET sortOrder = 5 WHERE id = 'b'`);
    await run('up');
    expect((await ds.query(`SELECT sortOrder FROM cms_blocks WHERE id = 'b'`))[0].sortOrder).toBe(5);
  });

  it('down drops the columns', async () => {
    await run('up');
    await run('down');
    const after = await cols();
    for (const c of ['imageUrl', 'linkType', 'linkTarget', 'ctaText', 'ctaTextFr', 'sortOrder', 'startsAt', 'endsAt', 'colorKey']) expect(after).not.toContain(c);
    expect(after).toContain('key');
  });
});
