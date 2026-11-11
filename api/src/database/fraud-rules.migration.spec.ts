import { DataSource } from 'typeorm';
import { FraudRulesStaff2fa1793210000001 } from './migrations/1793210000001-FraudRulesStaff2fa';

/** The fraud-rules migration runs on SQLite (tests, local dev) as well as MySQL: it only uses the QueryRunner API. */
describe('FraudRulesStaff2fa migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE "fraud_alerts" ("id" varchar(36) PRIMARY KEY NOT NULL, "type" varchar NOT NULL, "severity" varchar(10) NOT NULL DEFAULT ('medium'), "customer" varchar NOT NULL, "orderId" varchar, "score" integer NOT NULL DEFAULT (50), "status" varchar(12) NOT NULL DEFAULT ('open'), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await ds.query(`CREATE TABLE "settings" ("key" varchar PRIMARY KEY NOT NULL, "value" text NOT NULL, "updatedAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    await ds.query(`INSERT INTO "fraud_alerts" ("id","type","customer","orderId","score") VALUES ('a1','cod_risk','Awa','o1',80), ('a2','cod_risk','Ben','o2',60)`);
    await ds.query(`INSERT INTO "settings" ("key","value") VALUES ('fraudSharedAccounts','4'), ('fxRate','500')`);
  });
  afterEach(async () => ds.destroy());

  const cols = async (t: string) => (await ds.query(`PRAGMA table_info("${t}")`)).map((c: { name: string }) => c.name);
  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new FraudRulesStaff2fa1793210000001()[dir](q);
    } finally {
      await q.release();
    }
  };

  it('adds the alert columns, the signals table and the unique day key', async () => {
    await run('up');
    expect(await cols('fraud_alerts')).toEqual(expect.arrayContaining(['customerId', 'reason', 'reasonFr', 'dedupeKey']));
    expect(await cols('fraud_signals')).toEqual(expect.arrayContaining(['id', 'userId', 'kind', 'key', 'createdAt']));
    const idx = (await ds.query(`PRAGMA index_list("fraud_alerts")`)) as { name: string; unique: number }[];
    expect(idx.find((i) => i.name === 'IDX_fraud_alerts_dedupeKey')?.unique).toBe(1);
    await ds.query(`INSERT INTO "fraud_alerts" ("id","type","customer","dedupeKey") VALUES ('b1','failed_payments','Cy','failed_payments:u:2026-11-03')`);
    await expect(ds.query(`INSERT INTO "fraud_alerts" ("id","type","customer","dedupeKey") VALUES ('b2','failed_payments','Cy','failed_payments:u:2026-11-03')`)).rejects.toThrow(/UNIQUE/);
    // alerts without a key (per-order alerts) may repeat
    await ds.query(`INSERT INTO "fraud_alerts" ("id","type","customer") VALUES ('b3','cod_risk','Cy'), ('b4','cod_risk','Cy')`);
  });

  it('keeps existing alerts untouched (no invented reason or customer) and does not overwrite a setting that exists', async () => {
    await run('up');
    const old = await ds.query(`SELECT id, customerId, reason, dedupeKey, score FROM fraud_alerts WHERE id IN ('a1','a2') ORDER BY id`);
    expect(old).toEqual([
      { id: 'a1', customerId: null, reason: null, dedupeKey: null, score: 80 },
      { id: 'a2', customerId: null, reason: null, dedupeKey: null, score: 60 },
    ]);
    const settings = Object.fromEntries((await ds.query(`SELECT key, value FROM settings`)).map((r: { key: string; value: string }) => [r.key, r.value]));
    expect(settings).toMatchObject({ requireStaffTwoFactor: 'false', fraudFailedPayments24h: '5', fraudNewAccountOrders24h: '3', fraudNewAccountDays: '7', fraudReturnRatePct: '50', fraudSharedAccounts: '4', fxRate: '500' });
  });

  it('can be reverted, leaving the old alerts', async () => {
    await run('up');
    await run('down');
    expect(await cols('fraud_alerts')).toEqual(['id', 'type', 'severity', 'customer', 'orderId', 'score', 'status', 'createdAt']);
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name = 'fraud_signals'`)).toEqual([]);
    expect(await ds.query(`SELECT id FROM fraud_alerts`)).toHaveLength(2);
    expect(await ds.query(`SELECT key FROM settings`)).toEqual([{ key: 'fxRate' }]);
  });
});
