import { DataSource } from 'typeorm';
import { OrderRefsKom1793570000001 } from './migrations/1793570000001-OrderRefsKom';
import { normalizeOrderRef } from '../common/order-ref';

const PREFIX_TABLES = ['orders', 'payments', 'payment_refunds', 'delivery_tasks', 'disputes', 'exchanges', 'replacements', 'warehouse_exceptions', 'payout_statement_lines'];

describe('OrderRefsKom migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE "orders" ("id" varchar PRIMARY KEY, "reference" varchar NOT NULL UNIQUE)`);
    for (const t of PREFIX_TABLES.filter((x) => x !== 'orders')) {
      await ds.query(`CREATE TABLE "${t}" ("id" varchar PRIMARY KEY, "orderReference" varchar)`);
    }
    await ds.query(`ALTER TABLE "payment_refunds" ADD COLUMN "memo" text`);
    await ds.query(`CREATE TABLE "notifications" ("id" varchar PRIMARY KEY, "title" varchar, "body" text)`);
    await ds.query(`CREATE TABLE "wallet_transactions" ("id" varchar PRIMARY KEY, "description" text)`);
    await ds.query(`CREATE TABLE "audit_logs" ("id" varchar PRIMARY KEY, "detail" text, "detailFr" text)`);
    await ds.query(`CREATE TABLE "translations" ("id" varchar PRIMARY KEY, "entityType" varchar, "entityId" varchar, "field" varchar, "value" text, "origin" varchar, "sourceLang" varchar, "sourceHash" varchar)`);

    for (const t of PREFIX_TABLES) {
      const col = t === 'orders' ? 'reference' : 'orderReference';
      await ds.query(`INSERT INTO "${t}" ("id","${col}") VALUES ('a','SOM-12345'), ('b','KOM-777'), ('c','OTHER-1')`);
    }
    await ds.query(`UPDATE "payment_refunds" SET memo = 'Refund of SOM-12345 and SOM-9 (SOMBA10, BLOSSOM-1)' WHERE id='a'`);
    await ds.query(`INSERT INTO notifications VALUES ('n1','Order SOM-12345','SOM-12345 is now delivered.'), ('n2','Hi','nothing')`);
    await ds.query(`INSERT INTO wallet_transactions VALUES ('w1','Refund for SOM-12345 (dispute)')`);
    await ds.query(`INSERT INTO audit_logs VALUES ('l1','SOM-12345 -> shipped','SOM-12345 -> expédiée')`);
    await ds.query(`INSERT INTO translations VALUES ('t1','notification','n1','body','SOM-12345 est livrée.','author','en',NULL), ('t2','product','p1','name','SOM-1 thing','author','en',NULL)`);
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new OrderRefsKom1793570000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const one = async (sql: string) => Object.values((await ds.query(sql))[0] as object)[0];

  it('renames every reference column, prefix only', async () => {
    await run('up');
    for (const t of PREFIX_TABLES) {
      const col = t === 'orders' ? 'reference' : 'orderReference';
      const rows = (await ds.query(`SELECT "${col}" AS r FROM "${t}" ORDER BY id`)).map((r: { r: string }) => r.r);
      expect(rows).toEqual(['KOM-12345', 'KOM-777', 'OTHER-1']);
    }
  });

  it('rewrites embedded references in text columns and notice translations, leaving look-alikes alone', async () => {
    await run('up');
    expect(await one(`SELECT memo FROM payment_refunds WHERE id='a'`)).toBe('Refund of KOM-12345 and KOM-9 (SOMBA10, BLOSSOM-1)');
    expect(await one(`SELECT title FROM notifications WHERE id='n1'`)).toBe('Order KOM-12345');
    expect(await one(`SELECT body FROM notifications WHERE id='n1'`)).toBe('KOM-12345 is now delivered.');
    expect(await one(`SELECT body FROM notifications WHERE id='n2'`)).toBe('nothing');
    expect(await one(`SELECT description FROM wallet_transactions`)).toBe('Refund for KOM-12345 (dispute)');
    expect(await one(`SELECT detail FROM audit_logs`)).toBe('KOM-12345 -> shipped');
    expect(await one(`SELECT detailFr FROM audit_logs`)).toBe('KOM-12345 -> expédiée');
    expect(await one(`SELECT value FROM translations WHERE id='t1'`)).toBe('KOM-12345 est livrée.');
    expect(await one(`SELECT value FROM translations WHERE id='t2'`)).toBe('SOM-1 thing'); // not a notice
  });

  it('is idempotent and down maps every KOM- back to SOM-', async () => {
    await run('up');
    const snap = async () => JSON.stringify([await ds.query(`SELECT * FROM orders ORDER BY id`), await ds.query(`SELECT * FROM notifications ORDER BY id`)]);
    const first = await snap();
    await run('up');
    expect(await snap()).toBe(first);
    await run('down');
    expect(await one(`SELECT reference FROM orders WHERE id='a'`)).toBe('SOM-12345');
    expect(await one(`SELECT reference FROM orders WHERE id='b'`)).toBe('SOM-777');
    expect(await one(`SELECT body FROM notifications WHERE id='n1'`)).toBe('SOM-12345 is now delivered.');
  });

  it('survives missing tables and columns', async () => {
    await ds.query(`DROP TABLE "fraud_alerts"`).catch(() => undefined);
    await ds.query(`DROP TABLE "wallet_transactions"`);
    await expect(run('up')).resolves.toBeUndefined();
  });
});

describe('normalizeOrderRef', () => {
  it('maps old references and nothing else', () => {
    expect(normalizeOrderRef('SOM-12345')).toBe('KOM-12345');
    expect(normalizeOrderRef('som-12')).toBe('KOM-12');
    expect(normalizeOrderRef('#som-12 and SOM-9')).toBe('#KOM-12 and KOM-9');
    expect(normalizeOrderRef('SOMBA10')).toBe('SOMBA10');
    expect(normalizeOrderRef('BLOSSOM-1')).toBe('BLOSSOM-1');
    expect(normalizeOrderRef('KOM-5')).toBe('KOM-5');
  });
});
