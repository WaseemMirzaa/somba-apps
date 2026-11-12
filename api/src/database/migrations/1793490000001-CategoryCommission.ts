import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Per-category seller commission.
 *
 * Up: adds `categories.commissionPct` (float, NULL = "use the global default rate"). 0 is a real rate (a category the
 * platform takes nothing from), which is why "unset" is NULL and never 0. Existing categories stay NULL, so every order
 * keeps being charged the global `commissionPct` setting until an admin sets a rate on a category.
 *
 * QueryRunner API only (no raw MySQL), so it runs on MySQL in production and SQLite in tests; each step checks what
 * exists first, so a second run changes nothing. Down drops the column (the rates cannot be restored).
 */
export class CategoryCommission1793490000001 implements MigrationInterface {
  name = 'CategoryCommission1793490000001';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('categories', 'commissionPct'))) {
      await q.addColumn('categories', new TableColumn({ name: 'commissionPct', type: 'float', isNullable: true }));
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasColumn('categories', 'commissionPct')) await q.dropColumn('categories', 'commissionPct');
  }
}
