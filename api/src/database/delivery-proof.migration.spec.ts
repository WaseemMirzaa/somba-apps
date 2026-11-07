import { DataSource } from 'typeorm';
import { DeliveryProof1793300000001 } from './migrations/1793300000001-DeliveryProof';

/** The proof-of-delivery migration only uses the QueryRunner table API: it runs on SQLite (tests) as on MySQL (production). */
describe('DeliveryProof migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE "delivery_tasks" ("id" varchar(36) PRIMARY KEY NOT NULL, "status" varchar(20) NOT NULL)`);
    await ds.query(`INSERT INTO "delivery_tasks" ("id","status") VALUES ('t1','delivered'), ('t2','in_transit')`);
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new DeliveryProof1793300000001()[dir](q);
    } finally {
      await q.release();
    }
  };

  it('creates the table with a unique task index and touches nothing else', async () => {
    await run('up');
    const cols = (await ds.query(`PRAGMA table_info("delivery_proofs")`)).map((c: { name: string }) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['id', 'taskId', 'orderId', 'riderId', 'photoFile', 'photoMime', 'signatureFile', 'signatureMime', 'createdAt', 'updatedAt']));
    const idx = (await ds.query(`PRAGMA index_list("delivery_proofs")`)) as { name: string; unique: number }[];
    expect(idx.find((i) => i.name === 'IDX_delivery_proofs_taskId')?.unique).toBe(1);
    expect(await ds.query(`SELECT id FROM delivery_tasks`)).toHaveLength(2);
    const notNull = (await ds.query(`PRAGMA table_info("delivery_proofs")`)) as { name: string; notnull: number }[];
    expect(notNull.find((c) => c.name === 'photoFile')?.notnull).toBe(0);
    expect(notNull.find((c) => c.name === 'signatureFile')?.notnull).toBe(0);
  });

  it('can run twice and be reverted', async () => {
    await run('up');
    await run('up');
    await run('down');
    expect(await ds.query(`SELECT name FROM sqlite_master WHERE name = 'delivery_proofs'`)).toEqual([]);
    expect(await ds.query(`SELECT id FROM delivery_tasks`)).toHaveLength(2);
  });
});
