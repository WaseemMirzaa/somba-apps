import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Warehouse operations (round 2, D): per-warehouse settings (`hub_ops_settings`: working hours, batch size,
 * auto-assignment, aged-parcel ages, delivery-time target) and the aged-parcel alert ledger (`aged_alerts`, unique per
 * task and level so the scheduled job is idempotent). QueryRunner table API only, so it runs on MySQL and SQLite.
 * A warehouse without a settings row keeps the defaults (nothing is backfilled). Reversible.
 */
export class WarehouseOps1793200000004 implements MigrationInterface {
  name = 'WarehouseOps1793200000004';

  public async up(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    const stamp = (name: string) =>
      sqlite
        ? { name, type: 'datetime', isNullable: false, default: "datetime('now')" }
        : { name, type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' };

    await q.createTable(
      new Table({
        name: 'hub_ops_settings',
        columns: [
          { name: 'hubId', type: 'varchar', length: '36', isPrimary: true },
          { name: 'workStart', type: 'varchar', length: '5', isNullable: false, default: "'08:00'" },
          { name: 'workEnd', type: 'varchar', length: '5', isNullable: false, default: "'18:00'" },
          { name: 'workDays', type: 'varchar', length: '20', isNullable: false, default: "'1,2,3,4,5,6'" },
          { name: 'timezone', type: 'varchar', length: '64', isNullable: false, default: "'Africa/Kinshasa'" },
          { name: 'batchSize', type: 'int', isNullable: false, default: 20 },
          { name: 'autoAssign', type: 'boolean', isNullable: false, default: sqlite ? 0 : false },
          { name: 'autoAssignRule', type: 'varchar', length: '20', isNullable: false, default: "'least_busy'" },
          { name: 'agedLevel1Hours', type: 'int', isNullable: false, default: 24 },
          { name: 'agedLevel2Hours', type: 'int', isNullable: false, default: 48 },
          { name: 'agedLevel3Hours', type: 'int', isNullable: false, default: 72 },
          { name: 'deliveryTargetHours', type: 'double', isNullable: false, default: 24 },
          { name: 'updatedById', type: 'varchar', length: '36', isNullable: true },
          { name: 'updatedByName', type: 'varchar', length: '100', isNullable: true },
          stamp('updatedAt'),
        ],
      }),
      true,
    );

    await q.createTable(
      new Table({
        name: 'aged_alerts',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'taskId', type: 'varchar', length: '36', isNullable: false },
          { name: 'hubId', type: 'varchar', length: '36', isNullable: true },
          { name: 'level', type: 'int', isNullable: false },
          { name: 'ageHours', type: 'double', isNullable: false },
          { name: 'notified', type: 'int', isNullable: false, default: 0 },
          stamp('createdAt'),
        ],
      }),
      true,
    );
    await q.createIndex('aged_alerts', new TableIndex({ name: 'UQ_aged_alerts_task_level', columnNames: ['taskId', 'level'], isUnique: true }));
    await q.createIndex('aged_alerts', new TableIndex({ name: 'IDX_aged_alerts_hubId', columnNames: ['hubId'] }));
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.dropTable('aged_alerts', true, true, true);
    await q.dropTable('hub_ops_settings', true, true, true);
  }
}
