import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { WarehouseOps1793200000004 } from './migrations/1793200000004-WarehouseOps';

/** The warehouse-operations migration runs on SQLite (tests, local dev) as on MySQL (production), and matches the entities. */
describe('WarehouseOps migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new WarehouseOps1793200000004()[dir](q);
    } finally {
      await q.release();
    }
  };
  const cols = async (db: DataSource, table: string) => (await db.query(`PRAGMA table_info("${table}")`)).map((c: { name: string }) => c.name).sort();

  it('creates both tables with the columns the entities use', async () => {
    await run('up');
    const sync = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await sync.initialize();
    try {
      for (const t of ['hub_ops_settings', 'aged_alerts']) expect(await cols(ds, t)).toEqual(await cols(sync, t));
    } finally {
      await sync.destroy();
    }
  });

  it('gives a settings row the documented defaults when only the warehouse is named', async () => {
    await run('up');
    await ds.query(`INSERT INTO "hub_ops_settings" ("hubId") VALUES ('h1')`);
    const [row] = await ds.query(`SELECT * FROM "hub_ops_settings"`);
    expect(row).toMatchObject({ hubId: 'h1', workStart: '08:00', workEnd: '18:00', workDays: '1,2,3,4,5,6', timezone: 'Africa/Kinshasa', batchSize: 20, autoAssign: 0, autoAssignRule: 'least_busy', agedLevel1Hours: 24, agedLevel2Hours: 48, agedLevel3Hours: 72, deliveryTargetHours: 24 });
  });

  it('allows one alert per parcel and level, which is what makes the job idempotent', async () => {
    await run('up');
    const ins = (id: string, level: number) => ds.query(`INSERT INTO "aged_alerts" ("id","taskId","level","ageHours") VALUES ('${id}','t1',${level},25)`);
    await ins('a', 1);
    await ins('b', 2);
    await expect(ins('c', 1)).rejects.toThrow(/UNIQUE/i);
    const idx = (await ds.query(`PRAGMA index_list("aged_alerts")`)) as { name: string; unique: number }[];
    expect(idx.find((i) => i.name === 'UQ_aged_alerts_task_level')?.unique).toBe(1);
  });

  it('can be reverted', async () => {
    await run('up');
    await run('down');
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name IN ('hub_ops_settings','aged_alerts')`)).toEqual([]);
  });
});
