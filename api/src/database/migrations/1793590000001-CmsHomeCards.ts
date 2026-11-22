import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Home-page cards from the CMS.
 *
 * Up: adds to `cms_blocks` the picture (`imageUrl`), the tap target (`linkType` + `linkTarget`), the button label in English and
 * French (`ctaText`, `ctaTextFr`), the carousel position (`sortOrder`, back-filled from the creation order of the existing
 * blocks), the schedule (`startsAt`, `endsAt`) and the fallback colour token (`colorKey`). Also turns the old seed type `strip`
 * (not a valid type; the app showed no such block) into `banner`.
 *
 * Down: drops the columns (the card data cannot be restored); the `strip` -> `banner` change stays. Each step checks what
 * exists first, so a second run changes nothing. QueryRunner API only: MySQL in production, SQLite in tests.
 */
export class CmsHomeCards1793590000001 implements MigrationInterface {
  name = 'CmsHomeCards1793590000001';

  private readonly columns: TableColumn[] = [
    new TableColumn({ name: 'imageUrl', type: 'varchar', length: '500', isNullable: true }),
    new TableColumn({ name: 'linkType', type: 'varchar', length: '16', isNullable: true }),
    new TableColumn({ name: 'linkTarget', type: 'varchar', length: '500', isNullable: true }),
    new TableColumn({ name: 'ctaText', type: 'varchar', length: '40', isNullable: true }),
    new TableColumn({ name: 'ctaTextFr', type: 'varchar', length: '40', isNullable: true }),
    new TableColumn({ name: 'sortOrder', type: 'int', isNullable: false, default: 0 }),
    new TableColumn({ name: 'startsAt', type: 'datetime', isNullable: true }),
    new TableColumn({ name: 'endsAt', type: 'datetime', isNullable: true }),
    new TableColumn({ name: 'colorKey', type: 'varchar', length: '24', isNullable: true }),
  ];

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('cms_blocks'))) return;
    const fresh = !(await q.hasColumn('cms_blocks', 'sortOrder'));
    for (const c of this.columns) if (!(await q.hasColumn('cms_blocks', c.name))) await q.addColumn('cms_blocks', new TableColumn({ ...c }));
    const e = (n: string) => q.connection.driver.escape(n);
    if (fresh) {
      // Keep today's order: the blocks as the admin list shows them (oldest first), 10 apart so one can slot between two.
      const rows = (await q.query(`SELECT ${e('id')} AS id FROM ${e('cms_blocks')} ORDER BY ${e('updatedAt')} ASC, ${e('id')} ASC`)) as { id: string }[];
      for (let i = 0; i < rows.length; i++) await q.query(`UPDATE ${e('cms_blocks')} SET ${e('sortOrder')} = ? WHERE ${e('id')} = ?`, [(i + 1) * 10, rows[i].id]);
    }
    await q.query(`UPDATE ${e('cms_blocks')} SET ${e('type')} = 'banner' WHERE ${e('type')} = 'strip'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('cms_blocks'))) return;
    for (const c of [...this.columns].reverse()) if (await q.hasColumn('cms_blocks', c.name)) await q.dropColumn('cms_blocks', c.name);
  }
}
