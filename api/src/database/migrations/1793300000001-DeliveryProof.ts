import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Proof of delivery: the rider's photo and the customer's signature for one delivery leg.
 *
 * `delivery_proofs` holds one row per task with the NAMES of the files kept in the private upload folder; the files are
 * never public. Nothing changes for existing tasks: a delivery without proof simply has no row.
 * Written with the QueryRunner table API (no raw MySQL), so it runs on MySQL in production and on SQLite in tests. Reversible.
 */
export class DeliveryProof1793300000001 implements MigrationInterface {
  name = 'DeliveryProof1793300000001';

  public async up(q: QueryRunner): Promise<void> {
    if (await q.hasTable('delivery_proofs')) return;
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    // `updatedAt` is an @UpdateDateColumn: MySQL keeps it current itself (ON UPDATE), as the entity expects.
    const stamp = (name: string, onUpdate = false) =>
      sqlite
        ? { name, type: 'datetime', isNullable: false, default: "datetime('now')" }
        : { name, type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)', ...(onUpdate ? { onUpdate: 'CURRENT_TIMESTAMP(6)' } : {}) };
    await q.createTable(
      new Table({
        name: 'delivery_proofs',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'taskId', type: 'varchar', length: '36', isNullable: false },
          { name: 'orderId', type: 'varchar', length: '36', isNullable: false },
          { name: 'riderId', type: 'varchar', length: '36', isNullable: false },
          { name: 'photoFile', type: 'varchar', length: '80', isNullable: true },
          { name: 'photoMime', type: 'varchar', length: '20', isNullable: true },
          { name: 'signatureFile', type: 'varchar', length: '80', isNullable: true },
          { name: 'signatureMime', type: 'varchar', length: '20', isNullable: true },
          stamp('createdAt'),
          stamp('updatedAt', true),
        ],
      }),
      true,
    );
    await q.createIndex('delivery_proofs', new TableIndex({ name: 'IDX_delivery_proofs_taskId', columnNames: ['taskId'], isUnique: true }));
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.dropTable('delivery_proofs', true, true, true);
  }
}
