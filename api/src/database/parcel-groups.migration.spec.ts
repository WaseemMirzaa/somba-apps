import { DataSource } from 'typeorm';
import { ParcelGroups1793500000001 } from './migrations/1793500000001-ParcelGroups';

describe('ParcelGroups migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE "orders" ("id" varchar PRIMARY KEY NOT NULL, "customerId" varchar NOT NULL, "createdAt" datetime NOT NULL, "deliveryMode" varchar, "destinationHubId" varchar)`);
    await ds.query(`CREATE TABLE "parcels" ("id" varchar PRIMARY KEY NOT NULL, "code" varchar NOT NULL, "orderId" varchar NOT NULL, "sellerId" varchar, "returnId" varchar, "boxNo" int NOT NULL DEFAULT 1, "boxCount" int NOT NULL DEFAULT 1, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "voidedAt" datetime)`);
    await ds.query(`CREATE TABLE "parcel_scans" ("id" varchar PRIMARY KEY NOT NULL, "parcelId" varchar NOT NULL, "taskId" varchar NOT NULL, "stage" varchar NOT NULL)`);
    // 23:30 UTC on the 12th is already the 13th in Kinshasa.
    await ds.query(`INSERT INTO orders VALUES ('o1','c1','2026-11-12 23:30:00','standard','hD'), ('o2','c1','2026-11-12 08:00:00','express','hD'), ('o3','c2','2026-11-12 08:00:00','standard','hD'), ('o4','c3','2026-11-12 08:00:00','standard','hD'), ('o5','c3','2026-11-12 08:00:00','standard','hD')`);
    await ds.query(
      `INSERT INTO parcels (id, code, orderId, sellerId, returnId, boxNo, boxCount, createdAt, voidedAt) VALUES
        ('p1','PKG-AAAAAAA2','o1','s1',NULL,1,2,'2026-11-12 10:00:00',NULL), ('p2','PKG-AAAAAAA3','o1','s1',NULL,2,2,'2026-11-12 10:00:00',NULL),
        ('p3','PKG-AAAAAAA4','o2','s1',NULL,1,1,'2026-11-12 10:00:00','2026-11-12 11:00:00'), ('p4','PKG-AAAAAAA5','o2','s1',NULL,1,1,'2026-11-12 11:00:00',NULL),
        ('p5','PKG-AAAAAAA6','o3','s1',NULL,1,1,'2026-11-12 10:00:00',NULL), ('p6','PKG-AAAAAAA7','o3','s2',NULL,1,1,'2026-11-12 10:00:00',NULL),
        ('p7','PKG-AAAAAAA8','o4','s1',NULL,1,1,'2026-11-12 10:00:00',NULL), ('p8','PKG-AAAAAAA9','o4','s1',NULL,1,1,'2026-11-12 10:00:01',NULL),
        ('p9','PKG-AAAAAABA','o5','s1',NULL,1,1,'2026-11-12 10:00:00',NULL), ('p10','PKG-AAAAAABB','o5','s1',NULL,1,1,'2026-11-12 10:00:01',NULL),
        ('p11','PKG-AAAAAABC','o1',NULL,'ret1',1,1,'2026-11-12 12:00:00',NULL)`,
    );
    await ds.query(`INSERT INTO parcel_scans VALUES ('sc1','p10','t1','pickup')`);
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new ParcelGroups1793500000001()[dir](q);
    } finally {
      await q.release();
    }
  };

  it('creates both tables, the two columns and the unique indexes', async () => {
    await run('up');
    expect((await ds.query(`PRAGMA table_info("parcel_groups")`)).map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['id', 'sellerKey', 'customerId', 'dayKey', 'daySeq', 'addressKey', 'deliveryMode', 'originHubId', 'destinationHubId', 'groupKey', 'lockedAt', 'contentsRev']));
    expect((await ds.query(`PRAGMA table_info("parcels")`)).map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['groupId', 'liveSlot']));
    const unique = async (t: string) => ((await ds.query(`PRAGMA index_list("${t}")`)) as { name: string; unique: number }[]).filter((i) => i.unique).map((i) => i.name);
    expect(await unique('parcels')).toContain('UQ_parcels_live_slot');
    expect(await unique('parcel_groups')).toContain('UQ_parcel_groups_key_seq');
    expect(await unique('parcel_group_orders')).toContain('UQ_parcel_group_orders_order');
  });

  it('back-fills one group per order that has labels, points its parcels at it and keys the live slots', async () => {
    await run('up');
    const groups = (await ds.query(`SELECT g.*, (SELECT orderId FROM parcel_group_orders m WHERE m.groupId = g.id) AS orderId FROM parcel_groups g ORDER BY orderId`)) as Record<string, unknown>[];
    expect(groups.map((g) => g.orderId)).toEqual(['o1', 'o2', 'o3', 'o4', 'o5']);
    const by = (o: string) => groups.find((g) => g.orderId === o)!;
    expect(by('o1')).toMatchObject({ sellerKey: 's1', customerId: 'c1', dayKey: '2026-11-13', daySeq: 1, deliveryMode: 'standard', destinationHubId: 'hD' });
    expect(by('o2').deliveryMode).toBe('express');
    expect(by('o3').sellerKey).toBeNull(); // two sellers: its own group, never merged
    expect(String(by('o1').groupKey)).toMatch(/^[0-9a-f]{64}$/);
    expect(new Set(groups.map((g) => g.groupKey)).size).toBe(5);
    const p = (id: string) => ds.query(`SELECT groupId, liveSlot, voidedAt FROM parcels WHERE id = ?`, [id]).then((r) => r[0] as { groupId: string | null; liveSlot: string | null; voidedAt: string | null });
    expect((await p('p1')).groupId).toBe(by('o1').id);
    expect((await p('p1')).liveSlot).toBe(`${by('o1').id}:s1:1`);
    expect((await p('p2')).liveSlot).toBe(`${by('o1').id}:s1:2`);
    expect((await p('p3')).liveSlot).toBeNull(); // void: no slot
    expect((await p('p4')).liveSlot).toBe(`${by('o2').id}:s1:1`);
    expect((await p('p6')).liveSlot).toBe(`${by('o3').id}:s2:1`);
    expect((await p('p11')).groupId).toBeNull(); // a return parcel has no group
  });

  it('voids the later copy of a box the double-click race made twice (the scanned one, else the oldest, is kept)', async () => {
    await run('up');
    const live = async (id: string) => (await ds.query(`SELECT voidedAt, liveSlot FROM parcels WHERE id = ?`, [id]))[0] as { voidedAt: string | null; liveSlot: string | null };
    expect((await live('p7')).voidedAt).toBeNull(); // o4: oldest kept
    expect((await live('p8')).voidedAt).not.toBeNull();
    expect((await live('p8')).liveSlot).toBeNull();
    expect((await live('p10')).voidedAt).toBeNull(); // o5: the scanned copy is kept although it is the newer
    expect((await live('p9')).voidedAt).not.toBeNull();
  });

  it('refuses a second live box in a slot afterwards', async () => {
    await run('up');
    const slot = (await ds.query(`SELECT liveSlot FROM parcels WHERE id = 'p1'`))[0].liveSlot as string;
    await expect(ds.query(`INSERT INTO parcels (id, code, orderId, sellerId, boxNo, boxCount, liveSlot) VALUES ('px','PKG-AAAAAABD','o1','s1',1,2,?)`, [slot])).rejects.toThrow(/UNIQUE/);
  });

  it('runs twice without changing anything, and down removes it all', async () => {
    await run('up');
    const before = await ds.query(`SELECT COUNT(*) AS n FROM parcel_groups`);
    await run('up');
    expect(await ds.query(`SELECT COUNT(*) AS n FROM parcel_groups`)).toEqual(before);
    await run('down');
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name IN ('parcel_groups','parcel_group_orders')`)).toEqual([]);
    expect((await ds.query(`PRAGMA table_info("parcels")`)).map((c: { name: string }) => c.name)).not.toContain('liveSlot');
    expect(await ds.query(`SELECT COUNT(*) AS n FROM parcels`)).toEqual([{ n: 11 }]); // the boxes and their codes stay
  });
});
