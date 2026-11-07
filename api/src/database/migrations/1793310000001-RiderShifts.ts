import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Rider shifts and attendance: one row per working shift (clock-in, clock-out, break minutes).
 *
 * `openRiderId` is the rider's id while the shift is open and NULL once it is closed; its UNIQUE index is what keeps a
 * rider to one open shift (C-shift-one-open): MySQL and SQLite both allow many NULLs under a unique index.
 * Written with the QueryRunner table API (no raw MySQL), so it runs on MySQL in production and on SQLite in tests.
 * No data is touched or invented: riders simply have no shifts until they clock in. Reversible.
 */
export class RiderShifts1793310000001 implements MigrationInterface {
  name = 'RiderShifts1793310000001';

  public async up(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    await q.createTable(
      new Table({
        name: 'rider_shifts',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'riderId', type: 'varchar', length: '36', isNullable: false },
          { name: 'hubId', type: 'varchar', length: '36', isNullable: true },
          { name: 'openRiderId', type: 'varchar', length: '36', isNullable: true },
          { name: 'startedAt', type: 'datetime', isNullable: false },
          { name: 'endedAt', type: 'datetime', isNullable: true },
          { name: 'breakMinutes', type: 'int', isNullable: false, default: 0 },
          { name: 'breakStartedAt', type: 'datetime', isNullable: true },
          { name: 'endReason', type: 'varchar', length: '12', isNullable: true },
          sqlite
            ? { name: 'createdAt', type: 'datetime', isNullable: false, default: "datetime('now')" }
            : { name: 'createdAt', type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' },
        ],
      }),
      true,
    );
    await q.createIndex('rider_shifts', new TableIndex({ name: 'IDX_rider_shifts_rider_started', columnNames: ['riderId', 'startedAt'] }));
    await q.createIndex('rider_shifts', new TableIndex({ name: 'IDX_rider_shifts_hubId', columnNames: ['hubId'] }));
    await q.createIndex('rider_shifts', new TableIndex({ name: 'UQ_rider_shifts_openRiderId', columnNames: ['openRiderId'], isUnique: true }));
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.dropTable('rider_shifts', true, true, true);
  }
}
