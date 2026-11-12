import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';
import { auditDetailFr } from '../../common/audit-detail-fr';

/**
 * Audit-log details in French.
 *
 * Up: adds `audit_logs.detailFr` (nullable text) and fills it for the rows already written, from the English `detail` (one UPDATE per
 * distinct detail, so a log full of repeats costs few statements). A detail that is only data (a reference, a name) stays null: readers
 * show `detailFr ?? detail`. New rows get the column from the entity (`AuditLog.fillDetailFr`).
 *
 * Down: drops the column (the French is derived from `detail`, so nothing is lost).
 *
 * QueryRunner API only (`hasColumn` / `addColumn`): the same on MySQL in production and SQLite in tests; a second run changes nothing.
 */
export class AuditLogDetailFr1793520000001 implements MigrationInterface {
  name = 'AuditLogDetailFr1793520000001';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('audit_logs'))) return;
    if (!(await q.hasColumn('audit_logs', 'detailFr'))) {
      await q.addColumn('audit_logs', new TableColumn({ name: 'detailFr', type: 'text', isNullable: true }));
    }
    const rows: { detail: string }[] = await q.query('SELECT DISTINCT detail FROM audit_logs WHERE detail IS NOT NULL AND detailFr IS NULL');
    for (const { detail } of rows) {
      const fr = auditDetailFr(detail);
      if (fr) await q.query('UPDATE audit_logs SET detailFr = ? WHERE detail = ? AND detailFr IS NULL', [fr, detail]);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('audit_logs'))) return;
    if (await q.hasColumn('audit_logs', 'detailFr')) await q.dropColumn('audit_logs', 'detailFr');
  }
}
