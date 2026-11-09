import { DataSource } from 'typeorm';
import { RefreshTokenRotation1793420000001 } from './migrations/1793420000001-RefreshTokenRotation';

/** The refresh-token table runs on SQLite (tests, local dev) as well as MySQL: it only uses the QueryRunner table API. */
describe('RefreshTokenRotation migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new RefreshTokenRotation1793420000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const exists = async () => ((await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'refresh_tokens'`)) as unknown[]).length === 1;

  it('creates the table with its columns and the user / family indexes, and is safe to run twice', async () => {
    await run('up');
    await run('up');
    const cols = (await ds.query(`PRAGMA table_info("refresh_tokens")`)).map((c: { name: string }) => c.name);
    expect(cols).toEqual(['id', 'userId', 'familyId', 'expiresAt', 'usedAt', 'replacedById', 'revokedAt', 'createdAt']);
    const idx = ((await ds.query(`PRAGMA index_list("refresh_tokens")`)) as { name: string }[]).map((i) => i.name);
    expect(idx).toEqual(expect.arrayContaining(['IDX_refresh_tokens_user', 'IDX_refresh_tokens_family']));
    await ds.query(`INSERT INTO refresh_tokens (id, userId, familyId, expiresAt) VALUES ('t1', 'u1', 'f1', '2026-12-01 00:00:00')`);
    expect(await ds.query(`SELECT usedAt, revokedAt, replacedById FROM refresh_tokens`)).toEqual([{ usedAt: null, revokedAt: null, replacedById: null }]);
  });

  it('down removes the table again', async () => {
    await run('up');
    await run('down');
    expect(await exists()).toBe(false);
  });
});
