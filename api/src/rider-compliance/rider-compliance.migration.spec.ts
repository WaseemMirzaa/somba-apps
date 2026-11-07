import { DataSource } from 'typeorm';
import { ENTITIES } from '../database/entities';
import { RiderVehicleDocuments1793270000001 } from '../database/migrations/1793270000001-RiderVehicleDocuments';

/** The migration runs on SQLite (tests, local dev) as on MySQL (production), and matches the entities. */
describe('RiderVehicleDocuments migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new RiderVehicleDocuments1793270000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const cols = async (db: DataSource, table: string) => (await db.query(`PRAGMA table_info("${table}")`)).map((c: { name: string }) => c.name).sort();
  const indexes = async (db: DataSource, table: string) =>
    ((await db.query(`PRAGMA index_list("${table}")`)) as { name: string; unique: number }[]).filter((i) => !i.name.startsWith('sqlite_')).map((i) => `${i.name}:${i.unique}`).sort();

  it('creates both tables with the columns and indexes the entities use', async () => {
    await run('up');
    const sync = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await sync.initialize();
    try {
      for (const t of ['rider_vehicles', 'rider_documents']) {
        expect(await cols(ds, t)).toEqual(await cols(sync, t));
        expect(await indexes(ds, t)).toEqual(await indexes(sync, t));
      }
    } finally {
      await sync.destroy();
    }
  });

  it('allows one vehicle per rider and one document per file', async () => {
    await run('up');
    await ds.query(`INSERT INTO "rider_vehicles" ("id","riderId") VALUES ('v1','r1')`);
    await expect(ds.query(`INSERT INTO "rider_vehicles" ("id","riderId") VALUES ('v2','r1')`)).rejects.toThrow(/UNIQUE/i);
    const doc = (id: string, file: string) => ds.query(`INSERT INTO "rider_documents" ("id","riderId","type","fileId","mime") VALUES ('${id}','r1','other','${file}','image/png')`);
    await doc('d1', 'f1');
    await expect(doc('d2', 'f1')).rejects.toThrow(/UNIQUE/i);
    await doc('d3', 'f2');
    const [row] = await ds.query(`SELECT * FROM "rider_documents" WHERE id='d1'`);
    expect(row).toMatchObject({ status: 'pending', size: 0, reviewedAt: null });
  });

  it('is safe to run twice and reverses cleanly', async () => {
    await run('up');
    await run('up');
    await run('down');
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name IN ('rider_vehicles','rider_documents')`)).toEqual([]);
  });
});
