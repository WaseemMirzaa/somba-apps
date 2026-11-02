import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/**
 * The cash-on-delivery record (C-cod).
 *
 * `delivery_tasks` gets the record of the cash a rider collected (`codCollectedUsd`, `codCollectedAt`, `codCollectedById`)
 * and how much of it was handed in at the warehouse (`codHandedOverUsd`); `cod_handovers` is the ledger of those receipts.
 * Written with the QueryRunner table API (no raw MySQL), so it runs on MySQL in production and on SQLite in tests.
 *
 * Data: cash delivered before this record is NOT invented: those tasks keep a null collection, they never appear
 * in a rider's balance, and the warehouse count sheet still lists them under "expected".
 * Reversible.
 */
export class CodCashRecord1793100000001 implements MigrationInterface {
  name = 'CodCashRecord1793100000001';

  public async up(q: QueryRunner): Promise<void> {
    const add = async (name: string, spec: Partial<TableColumn>) => {
      if (!(await q.hasColumn('delivery_tasks', name))) await q.addColumn('delivery_tasks', new TableColumn({ name, ...spec } as TableColumn));
    };
    await add('codCollectedUsd', { type: 'double', isNullable: true });
    await add('codCollectedAt', { type: 'datetime', isNullable: true });
    await add('codCollectedById', { type: 'varchar', length: '36', isNullable: true });
    await add('codHandedOverUsd', { type: 'double', isNullable: false, default: 0 });

    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    await q.createTable(
      new Table({
        name: 'cod_handovers',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'riderId', type: 'varchar', length: '36', isNullable: false },
          { name: 'riderName', type: 'varchar', length: '255', isNullable: false },
          { name: 'hubId', type: 'varchar', length: '36', isNullable: true },
          { name: 'amountUsd', type: 'double', isNullable: false },
          { name: 'heldBeforeUsd', type: 'double', isNullable: false },
          { name: 'receivedById', type: 'varchar', length: '36', isNullable: false },
          { name: 'receivedByName', type: 'varchar', length: '255', isNullable: false },
          { name: 'receivedByRole', type: 'varchar', length: '40', isNullable: false },
          { name: 'note', type: 'varchar', length: '200', isNullable: true },
          { name: 'clientRef', type: 'varchar', length: '64', isNullable: true },
          sqlite
            ? { name: 'createdAt', type: 'datetime', isNullable: false, default: "datetime('now')" }
            : { name: 'createdAt', type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' },
        ],
      }),
      true,
    );
    await q.createIndex('cod_handovers', new TableIndex({ name: 'IDX_cod_handovers_riderId', columnNames: ['riderId'] }));
    await q.createIndex('cod_handovers', new TableIndex({ name: 'IDX_cod_handovers_hubId', columnNames: ['hubId'] }));
    await q.createIndex('cod_handovers', new TableIndex({ name: 'IDX_cod_handovers_clientRef', columnNames: ['clientRef'], isUnique: true }));
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.dropTable('cod_handovers', true, true, true);
    for (const name of ['codHandedOverUsd', 'codCollectedById', 'codCollectedAt', 'codCollectedUsd']) {
      if (await q.hasColumn('delivery_tasks', name)) await q.dropColumn('delivery_tasks', name);
    }
  }
}
