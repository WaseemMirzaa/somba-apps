import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/**
 * The seller portal's read-only after-sale sections (docs/contracts/admin-controls.md §13).
 *
 * Up:
 *  - adds `sellers.afterSaleAccess` (nullable text, JSON `{ returns?, exchanges?, replacements?, express? }`, each true | false | null):
 *    the per-store override of the platform default; null / missing = follow the default;
 *  - creates `case_seller_messages`: the private seller <-> support thread of a return / exchange / replacement.
 *
 * QueryRunner API only (`hasColumn` / `hasTable`): the same on MySQL in production and SQLite in tests; a second run changes nothing.
 * Down drops both (the overrides and the threads cannot be restored).
 */
export class SellerAfterSaleView1793530000001 implements MigrationInterface {
  name = 'SellerAfterSaleView1793530000001';

  public async up(q: QueryRunner): Promise<void> {
    if ((await q.hasTable('sellers')) && !(await q.hasColumn('sellers', 'afterSaleAccess'))) {
      await q.addColumn('sellers', new TableColumn({ name: 'afterSaleAccess', type: 'text', isNullable: true }));
    }
    if (!(await q.hasTable('case_seller_messages'))) {
      const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
      const created = sqlite
        ? { name: 'createdAt', type: 'datetime', isNullable: false, default: "datetime('now')" }
        : { name: 'createdAt', type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' };
      await q.createTable(
        new Table({
          name: 'case_seller_messages',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'caseKind', type: 'varchar', length: '12', isNullable: false },
            { name: 'caseId', type: 'varchar', length: '36', isNullable: false },
            { name: 'sellerId', type: 'varchar', length: '36', isNullable: false },
            { name: 'authorId', type: 'varchar', length: '36', isNullable: true },
            { name: 'authorName', type: 'varchar', length: '120', isNullable: false, default: "''" },
            { name: 'authorSide', type: 'varchar', length: '10', isNullable: false },
            { name: 'text', type: 'text', isNullable: false },
            created,
            { name: 'readBySellerAt', type: 'datetime', isNullable: true },
            { name: 'readBySupportAt', type: 'datetime', isNullable: true },
          ],
        }),
        true,
      );
      await q.createIndex('case_seller_messages', new TableIndex({ name: 'IDX_case_seller_messages_case', columnNames: ['caseKind', 'caseId'] }));
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasTable('case_seller_messages')) await q.dropTable('case_seller_messages', true, true, true);
    if ((await q.hasTable('sellers')) && (await q.hasColumn('sellers', 'afterSaleAccess'))) await q.dropColumn('sellers', 'afterSaleAccess');
  }
}
