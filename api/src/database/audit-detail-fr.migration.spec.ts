import { DataSource } from 'typeorm';
import { AuditLogDetailFr1793520000001 } from './migrations/1793520000001-AuditLogDetailFr';

describe('AuditLogDetailFr migration (SQLite)', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await ds.initialize();
    await ds.query(`CREATE TABLE "audit_logs" ("id" varchar PRIMARY KEY NOT NULL, "action" varchar NOT NULL, "detail" text)`);
    await ds.query(
      `INSERT INTO audit_logs VALUES ('a1','hub.updated','Entrepôt Limete'), ('a2','geo.removed','2 area(s)'), ('a3','geo.removed','2 area(s)'), ('a4','x',NULL),
        ('a5','payout.paid','PO-1 $40.00 ref ABC123')`,
    );
  });
  afterEach(async () => ds.destroy());

  const run = async (dir: 'up' | 'down') => {
    const q = ds.createQueryRunner();
    try {
      await new AuditLogDetailFr1793520000001()[dir](q);
    } finally {
      await q.release();
    }
  };
  const rows = async () => (await ds.query(`SELECT id, detailFr FROM audit_logs ORDER BY id`)) as { id: string; detailFr: string | null }[];

  it('adds the column and fills it from the English detail; data-only details stay null', async () => {
    await run('up');
    expect(await rows()).toEqual([
      { id: 'a1', detailFr: null },
      { id: 'a2', detailFr: '2 zones' },
      { id: 'a3', detailFr: '2 zones' },
      { id: 'a4', detailFr: null },
      { id: 'a5', detailFr: 'PO-1 40.00 $ réf. ABC123'.replace('40.00', '40,00') },
    ]);
  });

  it('runs twice without changing anything, and down drops the column', async () => {
    await run('up');
    const first = await rows();
    await run('up');
    expect(await rows()).toEqual(first);
    await run('down');
    const cols = (await ds.query(`PRAGMA table_info("audit_logs")`)).map((c: { name: string }) => c.name);
    expect(cols).not.toContain('detailFr');
    await run('down');
  });
});
