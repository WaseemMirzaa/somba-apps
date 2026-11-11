import { DataSource } from 'typeorm';
import { RemoveCashOnDelivery1793460000001 } from './migrations/1793460000001-RemoveCashOnDelivery';

/** The cash-on-delivery removal: written with the QueryRunner API, so it runs on SQLite (tests) as well as MySQL. */
describe('RemoveCashOnDelivery migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    // The tables as the earlier migrations left them.
    await ds.query(`CREATE TABLE "orders" ("id" varchar PRIMARY KEY NOT NULL, "paymentMethod" varchar(20) NOT NULL DEFAULT ('cod'), "totalUsd" float NOT NULL DEFAULT (0))`);
    await ds.query(
      `CREATE TABLE "delivery_tasks" ("id" varchar(36) PRIMARY KEY NOT NULL, "orderId" varchar NOT NULL, "status" varchar(20) NOT NULL DEFAULT ('unassigned'), "codAmountUsd" float NOT NULL DEFAULT (0), "codCollectedUsd" double, "codCollectedAt" datetime, "codCollectedById" varchar(36), "codHandedOverUsd" double NOT NULL DEFAULT (0))`,
    );
    await ds.query(
      `CREATE TABLE "cod_handovers" ("id" varchar(36) PRIMARY KEY NOT NULL, "riderId" varchar(36) NOT NULL, "riderName" varchar(255) NOT NULL, "hubId" varchar(36), "amountUsd" double NOT NULL, "heldBeforeUsd" double NOT NULL, "receivedById" varchar(36) NOT NULL, "receivedByName" varchar(255) NOT NULL, "receivedByRole" varchar(40) NOT NULL, "note" varchar(200), "clientRef" varchar(64), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`,
    );
    await ds.query(`CREATE UNIQUE INDEX "IDX_cod_handovers_clientRef" ON "cod_handovers" ("clientRef")`);
    await ds.query(`CREATE TABLE "settings" ("key" varchar PRIMARY KEY NOT NULL, "value" text NOT NULL)`);
    await ds.query(`CREATE TABLE "fraud_alerts" ("id" varchar PRIMARY KEY NOT NULL, "type" varchar NOT NULL, "customer" varchar NOT NULL)`);
    await ds.query(`INSERT INTO "orders" ("id","paymentMethod","totalUsd") VALUES ('o1','cod',40), ('o2','wallet',12)`);
    await ds.query(`INSERT INTO "delivery_tasks" ("id","orderId","codAmountUsd","codCollectedUsd","codHandedOverUsd") VALUES ('t1','o1',40,40,10), ('t2','o2',0,NULL,0)`);
    await ds.query(`INSERT INTO "settings" ("key","value") VALUES ('codEnabled','true'), ('codCapUsd','300'), ('fxRate','2850')`);
    await ds.query(`INSERT INTO "fraud_alerts" ("id","type","customer") VALUES ('a1','cod_risk','Awa'), ('a2','failed_payments','Ben')`);
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new RemoveCashOnDelivery1793460000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const columns = async (table: string) => ((await ds.query(`PRAGMA table_info("${table}")`)) as { name: string; dflt_value: string | null }[]);
  const names = async (table: string) => (await columns(table)).map((c) => c.name);

  it('drops the cash columns, the hand-over table, the cod settings and the cod fraud alerts, and keeps everything else', async () => {
    await run('up');
    expect(await names('delivery_tasks')).toEqual(['id', 'orderId', 'status']);
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cod_handovers'`)).toEqual([]);
    expect(await ds.query(`SELECT "key" FROM settings`)).toEqual([{ key: 'fxRate' }]);
    expect(await ds.query(`SELECT id FROM fraud_alerts`)).toEqual([{ id: 'a2' }]);
    expect(await ds.query(`SELECT id FROM delivery_tasks ORDER BY id`)).toEqual([{ id: 't1' }, { id: 't2' }]);
  });

  it('keeps orders.paymentMethod and the value of every existing order, and defaults it to wallet instead of cod', async () => {
    await run('up');
    expect((await columns('orders')).find((c) => c.name === 'paymentMethod')?.dflt_value).toMatch(/wallet/);
    expect(await ds.query(`SELECT id, paymentMethod, totalUsd FROM orders ORDER BY id`)).toEqual([
      { id: 'o1', paymentMethod: 'cod', totalUsd: 40 },
      { id: 'o2', paymentMethod: 'wallet', totalUsd: 12 },
    ]);
  });

  it('runs twice without changing anything the second time', async () => {
    await run('up');
    await run('up');
    expect(await names('delivery_tasks')).toEqual(['id', 'orderId', 'status']);
  });

  it('down puts the columns, the table, the default and the two settings back', async () => {
    await run('up');
    await run('down');
    expect(await names('delivery_tasks')).toEqual(expect.arrayContaining(['codAmountUsd', 'codCollectedUsd', 'codCollectedAt', 'codCollectedById', 'codHandedOverUsd']));
    const ledger = await names('cod_handovers');
    expect(ledger).toEqual(expect.arrayContaining(['id', 'riderId', 'amountUsd', 'heldBeforeUsd', 'receivedById', 'note', 'clientRef', 'createdAt']));
    const idx = (await ds.query(`PRAGMA index_list("cod_handovers")`)) as { name: string; unique: number }[];
    expect(idx.find((i) => i.name === 'IDX_cod_handovers_clientRef')?.unique).toBe(1);
    expect((await columns('orders')).find((c) => c.name === 'paymentMethod')?.dflt_value).toMatch(/cod/);
    expect(await ds.query(`SELECT "key", value FROM settings ORDER BY "key"`)).toEqual([
      { key: 'codCapUsd', value: '500' },
      { key: 'codEnabled', value: 'false' },
      { key: 'fxRate', value: '2850' },
    ]);
    expect(await ds.query(`SELECT codAmountUsd, codCollectedUsd, codHandedOverUsd FROM delivery_tasks ORDER BY id`)).toEqual([
      { codAmountUsd: 0, codCollectedUsd: null, codHandedOverUsd: 0 },
      { codAmountUsd: 0, codCollectedUsd: null, codHandedOverUsd: 0 },
    ]);
  });
});
