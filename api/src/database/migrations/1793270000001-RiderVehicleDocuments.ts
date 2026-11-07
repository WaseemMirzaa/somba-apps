import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Rider vehicle and compliance documents.
 *
 * - `rider_vehicles`: one row per rider (unique `riderId`): model, type, plate, colour, odometer, fuel, insurance valid until, last and
 *   next service. Dates are `YYYY-MM-DD` text, so a day never shifts with a time zone.
 * - `rider_documents`: a rider's licence / insurance / registration / ID / other, its private file id, an optional expiry date, a review
 *   status (pending, approved, rejected) with reviewer and reason. The document number is encrypted by the application (text column).
 *
 * `private_files.kind` is a free varchar(20): the new kind `rider_doc` needs no schema change.
 * Written with the QueryRunner table API (no raw MySQL), so it runs on MySQL in production and on SQLite in tests. Reversible.
 */
export class RiderVehicleDocuments1793270000001 implements MigrationInterface {
  name = 'RiderVehicleDocuments1793270000001';

  public async up(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    // CreateDate / UpdateDate columns: MySQL fills them itself (and keeps `updatedAt` current), exactly as the entities expect.
    const stamp = (name: string, onUpdate = false) =>
      sqlite
        ? { name, type: 'datetime', isNullable: false, default: "datetime('now')" }
        : { name, type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)', ...(onUpdate ? { onUpdate: 'CURRENT_TIMESTAMP(6)' } : {}) };

    if (!(await q.hasTable('rider_vehicles'))) {
      await q.createTable(
        new Table({
          name: 'rider_vehicles',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'riderId', type: 'varchar', length: '36', isNullable: false },
            { name: 'model', type: 'varchar', length: '80', isNullable: true },
            { name: 'type', type: 'varchar', length: '20', isNullable: true },
            { name: 'plate', type: 'varchar', length: '20', isNullable: true },
            { name: 'colour', type: 'varchar', length: '40', isNullable: true },
            { name: 'odometerKm', type: 'int', isNullable: true },
            { name: 'fuel', type: 'varchar', length: '20', isNullable: true },
            { name: 'insuranceValidUntil', type: 'varchar', length: '10', isNullable: true },
            { name: 'lastServiceOn', type: 'varchar', length: '10', isNullable: true },
            { name: 'nextServiceOn', type: 'varchar', length: '10', isNullable: true },
            { name: 'updatedById', type: 'varchar', length: '36', isNullable: true },
            { name: 'updatedByName', type: 'varchar', length: '100', isNullable: true },
            stamp('createdAt'),
            stamp('updatedAt', true),
          ],
        }),
        true,
      );
      await q.createIndex('rider_vehicles', new TableIndex({ name: 'UQ_rider_vehicles_rider', columnNames: ['riderId'], isUnique: true }));
    }

    if (!(await q.hasTable('rider_documents'))) {
      await q.createTable(
        new Table({
          name: 'rider_documents',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'riderId', type: 'varchar', length: '36', isNullable: false },
            { name: 'type', type: 'varchar', length: '30', isNullable: false },
            { name: 'number', type: 'text', isNullable: true },
            { name: 'expiresOn', type: 'varchar', length: '10', isNullable: true },
            { name: 'fileId', type: 'varchar', length: '36', isNullable: false },
            { name: 'mime', type: 'varchar', length: '40', isNullable: false },
            { name: 'size', type: 'int', isNullable: false, default: 0 },
            { name: 'status', type: 'varchar', length: '12', isNullable: false, default: "'pending'" },
            { name: 'reviewedById', type: 'varchar', length: '36', isNullable: true },
            { name: 'reviewedByName', type: 'varchar', length: '100', isNullable: true },
            { name: 'reviewedAt', type: 'datetime', isNullable: true },
            { name: 'rejectionReason', type: 'varchar', length: '300', isNullable: true },
            stamp('createdAt'),
            stamp('updatedAt', true),
          ],
        }),
        true,
      );
      await q.createIndex('rider_documents', new TableIndex({ name: 'IDX_rider_documents_rider', columnNames: ['riderId'] }));
      await q.createIndex('rider_documents', new TableIndex({ name: 'UQ_rider_documents_file', columnNames: ['fileId'], isUnique: true }));
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.dropTable('rider_documents', true, true, true);
    await q.dropTable('rider_vehicles', true, true, true);
  }
}
