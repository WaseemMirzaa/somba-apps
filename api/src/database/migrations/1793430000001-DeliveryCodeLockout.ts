import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * RD-01 / A-13: attempt limit on the customer's 4-digit delivery code.
 *
 * - `delivery_tasks.codeFailures`: wrong codes typed since the last correct one (0 for every existing task).
 * - `delivery_tasks.codeLockedUntil`: the code step is locked until then (NULL = not locked).
 *
 * Counted in the database, not in memory, so the limit holds across restarts and several API processes. Nothing existing
 * is changed. Written with the QueryRunner column API (no raw MySQL), so it runs on MySQL and on SQLite. Reversible.
 */
export class DeliveryCodeLockout1793430000001 implements MigrationInterface {
  name = 'DeliveryCodeLockout1793430000001';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('delivery_tasks', 'codeFailures'))) {
      await q.addColumn('delivery_tasks', new TableColumn({ name: 'codeFailures', type: 'int', isNullable: false, default: 0 }));
    }
    if (!(await q.hasColumn('delivery_tasks', 'codeLockedUntil'))) {
      await q.addColumn('delivery_tasks', new TableColumn({ name: 'codeLockedUntil', type: 'datetime', isNullable: true }));
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasColumn('delivery_tasks', 'codeLockedUntil')) await q.dropColumn('delivery_tasks', 'codeLockedUntil');
    if (await q.hasColumn('delivery_tasks', 'codeFailures')) await q.dropColumn('delivery_tasks', 'codeFailures');
  }
}
