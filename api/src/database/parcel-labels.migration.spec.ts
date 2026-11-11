import { DataSource } from 'typeorm';
import { ParcelLabelsAndScans1793470000001 } from './migrations/1793470000001-ParcelLabelsAndScans';

describe('ParcelLabelsAndScans migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE "orders" ("id" varchar PRIMARY KEY NOT NULL, "status" varchar NOT NULL)`);
    await ds.query(`CREATE TABLE "order_items" ("id" varchar PRIMARY KEY NOT NULL, "orderId" varchar NOT NULL, "productId" varchar NOT NULL, "sellerId" varchar, "fulfilment" varchar NOT NULL, "deliveredAt" datetime)`);
    await ds.query(`INSERT INTO orders VALUES ('o1','processing'), ('o2','delivered'), ('o3','cancelled'), ('o4','processing')`);
    await ds.query(
      `INSERT INTO order_items VALUES
        ('i1','o1','p1','s1','ready',NULL), ('i2','o1','p2','s1','ready',NULL), ('i3','o1','p3','s2','open',NULL),
        ('i4','o2','p1','s1','received','2026-01-01'), ('i5','o3','p1','s1','ready',NULL),
        ('i6','o4','p1','s3','received',NULL), ('i7','o4','p1','s4','cancelled',NULL), ('i8','o4','ext:9','s5','ready',NULL)`,
    );
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new ParcelLabelsAndScans1793470000001()[dir](q);
    } finally {
      await q.release();
    }
  };

  it('creates both tables with their unique indexes', async () => {
    await run('up');
    const cols = (await ds.query(`PRAGMA table_info("parcels")`)).map((c: { name: string }) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['id', 'code', 'orderId', 'sellerId', 'returnId', 'boxNo', 'boxCount', 'createdAt', 'voidedAt']));
    const scanCols = (await ds.query(`PRAGMA table_info("parcel_scans")`)).map((c: { name: string }) => c.name);
    expect(scanCols).toEqual(expect.arrayContaining(['parcelId', 'taskId', 'stage', 'actorId', 'actorRole', 'hubId', 'at', 'manual']));
    const idx = (await ds.query(`PRAGMA index_list("parcel_scans")`)) as { name: string; unique: number }[];
    expect(idx.find((i) => i.name === 'UQ_parcel_scans_parcel_task_stage')?.unique).toBe(1);
  });

  it('back-fills one parcel per seller package that is ready and not delivered or cancelled', async () => {
    await run('up');
    const rows = (await ds.query(`SELECT orderId, sellerId, boxNo, boxCount, code FROM parcels ORDER BY orderId`)) as { orderId: string; sellerId: string; boxNo: number; boxCount: number; code: string }[];
    expect(rows.map((r) => `${r.orderId}/${r.sellerId}`)).toEqual(['o1/s1', 'o4/s3']);
    for (const r of rows) {
      expect(r.boxNo).toBe(1);
      expect(r.boxCount).toBe(1);
      expect(r.code).toMatch(/^PKG-[2-9A-HJ-NP-Z]{8}$/);
    }
  });

  it('runs twice without duplicating anything, and the parcels reject a duplicate scan', async () => {
    await run('up');
    await run('up');
    expect(await ds.query(`SELECT COUNT(*) AS n FROM parcels`)).toEqual([{ n: 2 }]);
    const ins = () => ds.query(`INSERT INTO parcel_scans (id, parcelId, taskId, stage, actorRole, at) VALUES (lower(hex(randomblob(8))), 'p', 't', 'pickup', 'rider', '2026-01-01 08:00:00')`);
    await ins();
    await expect(ins()).rejects.toThrow(/UNIQUE/i);
  });

  it('can be reverted and applied again', async () => {
    await run('up');
    await run('down');
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('parcels','parcel_scans')`)).toEqual([]);
    await run('up');
    expect(await ds.query(`SELECT COUNT(*) AS n FROM parcels`)).toEqual([{ n: 2 }]);
  });
});
