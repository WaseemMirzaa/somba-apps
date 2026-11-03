import { DataSource } from 'typeorm';
import { ENTITIES } from './entities';
import { WarehouseStockLedger1793200000003 } from './migrations/1793200000003-WarehouseStockLedger';

/**
 * The warehouse stock-ledger migration runs on SQLite (tests, local dev) as well as MySQL (production): it only uses the
 * QueryRunner table API. It must leave the same tables the entities describe, change nothing that already exists, and be
 * reversible.
 */
describe('WarehouseStockLedger migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    // The custody tables as the earlier migrations left them: the new tables must not touch them.
    await ds.query(`CREATE TABLE "delivery_tasks" ("id" varchar(36) PRIMARY KEY NOT NULL, "orderId" varchar NOT NULL, "status" varchar(20) NOT NULL DEFAULT ('unassigned'), "kind" varchar(24) NOT NULL DEFAULT ('delivery'))`);
    await ds.query(`INSERT INTO "delivery_tasks" ("id","orderId","status","kind") VALUES ('t1','o1','delivered','pickup'), ('t2','o2','assigned','delivery')`);
    await ds.query(`CREATE TABLE "stock_movements" ("id" varchar(36) PRIMARY KEY NOT NULL, "productId" varchar(36) NOT NULL, "delta" integer NOT NULL)`);
    await ds.query(`INSERT INTO "stock_movements" ("id","productId","delta") VALUES ('m1','p1',-2)`);
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new WarehouseStockLedger1793200000003()[dir](q);
    } finally {
      await q.release();
    }
  };
  const cols = async (t: string) => (await ds.query(`PRAGMA table_info("${t}")`)).map((c: { name: string }) => c.name).sort();
  const tables = async () => (await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'warehouse_%'`)).map((r: { name: string }) => r.name).sort();
  const indexes = async (t: string) => (await ds.query(`PRAGMA index_list("${t}")`)) as { name: string; unique: number }[];

  it('creates the three tables with their unique keys', async () => {
    await run('up');
    expect(await tables()).toEqual(['warehouse_bins', 'warehouse_ledger', 'warehouse_stock']);
    const bins = await indexes('warehouse_bins');
    expect(bins.find((i) => i.name === 'IDX_warehouse_bins_hub_code')?.unique).toBe(1);
    expect((await indexes('warehouse_stock')).find((i) => i.name === 'IDX_warehouse_stock_slot')?.unique).toBe(1);
    expect((await indexes('warehouse_ledger')).find((i) => i.name === 'IDX_warehouse_ledger_clientRef')?.unique).toBe(1);
  });

  it('leaves exactly the columns the entities declare (so MySQL, by migration, matches sync-built SQLite)', async () => {
    await run('up');
    const synced = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await synced.initialize();
    try {
      for (const t of ['warehouse_bins', 'warehouse_stock', 'warehouse_ledger']) {
        const want = (await synced.query(`PRAGMA table_info("${t}")`)).map((c: { name: string }) => c.name).sort();
        expect([t, await cols(t)]).toEqual([t, want]);
      }
    } finally {
      await synced.destroy();
    }
  });

  it('the database refuses a negative quantity and a repeated slot or request reference', async () => {
    await run('up');
    const stock = (qty: number, bin = 'b1') => ds.query(`INSERT INTO warehouse_stock (id, hubId, binId, productId, variant, qty) VALUES ('${Math.random()}', 'h1', '${bin}', 'p1', 'Default', ${qty})`);
    await expect(stock(-1)).rejects.toThrow(/CHECK|constraint/i);
    await stock(3);
    await expect(stock(1)).rejects.toThrow(/UNIQUE|constraint/i); // same hub, bin, product, option
    await stock(1, 'b2');
    await expect(ds.query(`UPDATE warehouse_stock SET qty = qty - 5 WHERE binId = 'b1'`)).rejects.toThrow(/CHECK|constraint/i);
    const line = (id: string, ref: string | null) =>
      ds.query(`INSERT INTO warehouse_ledger (id, hubId, productId, kind, reason, qty, delta, onHandAfter, clientRef) VALUES ('${id}', 'h1', 'p1', 'receive', 'manual_receipt', 1, 1, 1, ${ref ? `'${ref}'` : 'NULL'})`);
    await line('l1', 'r1');
    await expect(line('l2', 'r1')).rejects.toThrow(/UNIQUE|constraint/i);
    await line('l3', null);
    await line('l4', null); // lines without a reference never collide
    const row = (await ds.query(`SELECT variant, createdAt FROM warehouse_ledger WHERE id = 'l1'`))[0];
    expect(row.variant).toBe('Default');
    expect(row.createdAt).toBeTruthy();
  });

  it('does not touch the custody tables or the seller stock ledger', async () => {
    const before = [await ds.query(`SELECT * FROM delivery_tasks ORDER BY id`), await ds.query(`SELECT * FROM stock_movements`), await cols('delivery_tasks'), await cols('stock_movements')];
    await run('up');
    expect([await ds.query(`SELECT * FROM delivery_tasks ORDER BY id`), await ds.query(`SELECT * FROM stock_movements`), await cols('delivery_tasks'), await cols('stock_movements')]).toEqual(before);
  });

  it('can run twice without failing and can be reverted, leaving no trace', async () => {
    await run('up');
    await ds.query(`INSERT INTO warehouse_bins (id, hubId, code) VALUES ('b1', 'h1', 'A-01')`);
    await run('up'); // the tables exist: nothing is recreated, nothing is lost
    expect(await ds.query(`SELECT code FROM warehouse_bins`)).toEqual([{ code: 'A-01' }]);
    await run('down');
    expect(await tables()).toEqual([]);
    expect(await ds.query(`SELECT id FROM delivery_tasks`)).toHaveLength(2);
    await run('up'); // and it can be applied again after a revert
    expect(await tables()).toHaveLength(3);
  });

  it('is picked up by the migration CLI glob (named like the others, class name = name field)', () => {
    expect(new WarehouseStockLedger1793200000003().name).toBe('WarehouseStockLedger1793200000003');
  });
});
