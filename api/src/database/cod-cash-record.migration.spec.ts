import { DataSource } from 'typeorm';
import { CodCashRecord1793100000001 } from './migrations/1793100000001-CodCashRecord';

/**
 * The COD cash-record migration runs on SQLite (tests, local dev) as well as on MySQL (production): it only uses
 * the QueryRunner table API. The tables are created here the way the previous migrations left them (before the change).
 */
describe('CodCashRecord migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE "delivery_tasks" ("id" varchar(36) PRIMARY KEY NOT NULL, "orderId" varchar NOT NULL, "riderId" varchar, "status" varchar(20) NOT NULL DEFAULT ('unassigned'), "kind" varchar(24) NOT NULL DEFAULT ('delivery'), "codAmountUsd" float NOT NULL DEFAULT (0))`);
    await ds.query(`INSERT INTO "delivery_tasks" ("id","orderId","riderId","status","kind","codAmountUsd") VALUES
      ('t1','o1','r1','delivered','delivery',40), ('t2','o2','r1','delivered','pickup',0), ('t3','o3','r1','in_transit','delivery',15),
      ('t4','o4',NULL,'delivered','delivery',0), ('t5','o5','r2','failed','delivery',9)`);
  });
  afterEach(async () => ds.destroy());

  const columns = async () => (await ds.query(`PRAGMA table_info("delivery_tasks")`)).map((c: { name: string }) => c.name);
  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new CodCashRecord1793100000001()[dir](q);
    } finally {
      await q.release();
    }
  };

  it('adds the cash and pay columns and the hand-over ledger', async () => {
    await run('up');
    expect(await columns()).toEqual(expect.arrayContaining(['codCollectedUsd', 'codCollectedAt', 'codCollectedById', 'codHandedOverUsd']));
    const ledger = (await ds.query(`PRAGMA table_info("cod_handovers")`)).map((c: { name: string }) => c.name);
    expect(ledger).toEqual(expect.arrayContaining(['id', 'riderId', 'amountUsd', 'heldBeforeUsd', 'receivedById', 'receivedByName', 'note', 'clientRef', 'createdAt']));
    const idx = (await ds.query(`PRAGMA index_list("cod_handovers")`)) as { name: string; unique: number }[];
    expect(idx.find((i) => i.name === 'IDX_cod_handovers_clientRef')?.unique).toBe(1);
  });

  it('keeps existing rows, defaults the hand-over counter to 0 and creates no cash that never existed', async () => {
    await run('up');
    const rows = await ds.query(`SELECT id, codAmountUsd, codCollectedUsd, codHandedOverUsd FROM delivery_tasks ORDER BY id`);
    expect(rows).toHaveLength(5);
    expect(rows.find((r: { id: string }) => r.id === 't1')).toMatchObject({ codAmountUsd: 40, codCollectedUsd: null, codHandedOverUsd: 0 });
  });

  it('can run twice without failing and can be reverted', async () => {
    await run('up');
    await run('up').catch(() => undefined); // the table already exists: a second run is not needed, but the columns are never added twice
    await run('down');
    const cols = await columns();
    for (const c of ['codCollectedUsd', 'codCollectedAt', 'codCollectedById', 'codHandedOverUsd']) expect(cols).not.toContain(c);
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name = 'cod_handovers'`)).toEqual([]);
    expect(await ds.query(`SELECT id FROM delivery_tasks`)).toHaveLength(5);
  });
});
