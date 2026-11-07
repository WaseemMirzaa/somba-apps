import { DataSource } from 'typeorm';
import { RiderShifts1793300000001 } from './migrations/1793300000001-RiderShifts';

/** The rider-shifts migration runs on SQLite (tests, local dev) as well as MySQL: it only uses the QueryRunner table API. */
describe('RiderShifts migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new RiderShifts1793300000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const tables = async () => (await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'rider_shifts'`)) as unknown[];

  it('creates the table with its columns and a UNIQUE index on openRiderId', async () => {
    await run('up');
    const cols = (await ds.query(`PRAGMA table_info("rider_shifts")`)).map((c: { name: string }) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['id', 'riderId', 'hubId', 'openRiderId', 'startedAt', 'endedAt', 'breakMinutes', 'breakStartedAt', 'endReason', 'createdAt']));
    const idx = (await ds.query(`PRAGMA index_list("rider_shifts")`)) as { name: string; unique: number }[];
    expect(idx.find((i) => i.name === 'UQ_rider_shifts_openRiderId')?.unique).toBe(1);
    expect(idx.map((i) => i.name)).toEqual(expect.arrayContaining(['IDX_rider_shifts_rider_started', 'IDX_rider_shifts_hubId']));
  });

  it('allows many closed shifts (NULL openRiderId) but only one open shift per rider', async () => {
    await run('up');
    const ins = (id: string, open: string | null) =>
      ds.query(`INSERT INTO rider_shifts (id, riderId, openRiderId, startedAt) VALUES ('${id}', 'r1', ${open ? `'${open}'` : 'NULL'}, '2026-01-01 08:00:00')`);
    await ins('a', null);
    await ins('b', null);
    await ins('c', 'r1');
    await expect(ins('d', 'r1')).rejects.toThrow(/UNIQUE/i);
    expect(await ds.query(`SELECT breakMinutes FROM rider_shifts WHERE id = 'a'`)).toEqual([{ breakMinutes: 0 }]);
  });

  it('can be reverted', async () => {
    await run('up');
    await run('down');
    expect(await tables()).toEqual([]);
  });
});
