import { MigrationInterface, QueryRunner, Table, TableCheck, TableColumnOptions, TableIndex } from 'typeorm';

/**
 * The warehouse stock ledger (WS-C): bins inside a warehouse, what each bin holds, and the ledger of every movement.
 *
 *   warehouse_bins    shelves / racks / floor spots per warehouse (`code` unique per warehouse)
 *   warehouse_stock   units of one product option in one bin; the database refuses a negative quantity
 *   warehouse_ledger  one line per receipt, bin move, cycle count and stock-out (who, when, qty, from/to bin, reason)
 *
 * It sits on top of parcel custody and changes nothing in it: `delivery_tasks`, `stock_movements` (the seller's catalogue
 * stock) and every existing column stay as they are. No data is invented: existing warehouses start with empty shelves.
 * Written with the QueryRunner table API (no raw MySQL), so it runs on MySQL in production and on SQLite in tests.
 * Reversible; running `up` twice is harmless.
 */
export class WarehouseStockLedger1793200000003 implements MigrationInterface {
  name = 'WarehouseStockLedger1793200000003';

  public async up(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    const created = (name: string): TableColumnOptions =>
      sqlite
        ? { name, type: 'datetime', isNullable: false, default: "datetime('now')" }
        : { name, type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' };
    const updated = (name: string): TableColumnOptions =>
      sqlite
        ? { name, type: 'datetime', isNullable: false, default: "datetime('now')" }
        : { name, type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)', onUpdate: 'CURRENT_TIMESTAMP(6)' };
    const id: TableColumnOptions = { name: 'id', type: 'varchar', length: '36', isPrimary: true };
    const idx = async (table: string, name: string, columns: string[], unique = false) => {
      if (!(await q.getTable(table))?.indices.some((i) => i.name === name)) await q.createIndex(table, new TableIndex({ name, columnNames: columns, isUnique: unique }));
    };

    if (!(await q.hasTable('warehouse_bins'))) {
      await q.createTable(
        new Table({
          name: 'warehouse_bins',
          columns: [
            id,
            { name: 'hubId', type: 'varchar', length: '36', isNullable: false },
            { name: 'code', type: 'varchar', length: '40', isNullable: false },
            { name: 'label', type: 'varchar', length: '120', isNullable: true },
            { name: 'active', type: 'boolean', isNullable: false, default: sqlite ? 1 : true },
            created('createdAt'),
          ],
        }),
        true,
      );
    }
    await idx('warehouse_bins', 'IDX_warehouse_bins_hub_code', ['hubId', 'code'], true);

    const stockIsNew = !(await q.hasTable('warehouse_stock'));
    if (stockIsNew) {
      await q.createTable(
        new Table({
          name: 'warehouse_stock',
          columns: [
            id,
            { name: 'hubId', type: 'varchar', length: '36', isNullable: false },
            { name: 'binId', type: 'varchar', length: '36', isNullable: false },
            { name: 'productId', type: 'varchar', length: '36', isNullable: false },
            { name: 'variant', type: 'varchar', length: '200', isNullable: false, default: "'Default'" },
            { name: 'qty', type: 'int', isNullable: false, default: 0 },
            updated('updatedAt'),
          ],
          checks: [new TableCheck({ name: 'CHK_warehouse_stock_qty', expression: 'qty >= 0' })],
        }),
        true,
      );
    }
    // The table API writes the CHECK on SQLite; the MySQL driver leaves it out, so MySQL (8.0.16+, which enforces it) gets it here.
    if (stockIsNew && q.connection.options.type === 'mysql') {
      await q.query('ALTER TABLE `warehouse_stock` ADD CONSTRAINT `CHK_warehouse_stock_qty` CHECK (`qty` >= 0)');
    }
    await idx('warehouse_stock', 'IDX_warehouse_stock_slot', ['hubId', 'binId', 'productId', 'variant'], true);
    await idx('warehouse_stock', 'IDX_warehouse_stock_product', ['hubId', 'productId']);

    if (!(await q.hasTable('warehouse_ledger'))) {
      await q.createTable(
        new Table({
          name: 'warehouse_ledger',
          columns: [
            id,
            { name: 'hubId', type: 'varchar', length: '36', isNullable: false },
            { name: 'productId', type: 'varchar', length: '36', isNullable: false },
            { name: 'variant', type: 'varchar', length: '200', isNullable: false, default: "'Default'" },
            { name: 'kind', type: 'varchar', length: '12', isNullable: false },
            { name: 'reason', type: 'varchar', length: '20', isNullable: false },
            { name: 'qty', type: 'int', isNullable: false },
            { name: 'delta', type: 'int', isNullable: false },
            { name: 'onHandAfter', type: 'int', isNullable: false },
            { name: 'fromBinId', type: 'varchar', length: '36', isNullable: true },
            { name: 'toBinId', type: 'varchar', length: '36', isNullable: true },
            { name: 'fromBinCode', type: 'varchar', length: '40', isNullable: true },
            { name: 'toBinCode', type: 'varchar', length: '40', isNullable: true },
            { name: 'expectedQty', type: 'int', isNullable: true },
            { name: 'countedQty', type: 'int', isNullable: true },
            { name: 'taskId', type: 'varchar', length: '36', isNullable: true },
            { name: 'orderId', type: 'varchar', length: '36', isNullable: true },
            { name: 'actorId', type: 'varchar', length: '36', isNullable: true },
            { name: 'actorName', type: 'varchar', length: '255', isNullable: true },
            { name: 'note', type: 'varchar', length: '200', isNullable: true },
            { name: 'clientRef', type: 'varchar', length: '100', isNullable: true },
            created('createdAt'),
          ],
        }),
        true,
      );
    }
    await idx('warehouse_ledger', 'IDX_warehouse_ledger_hub_created', ['hubId', 'createdAt']);
    await idx('warehouse_ledger', 'IDX_warehouse_ledger_product', ['hubId', 'productId', 'createdAt']);
    await idx('warehouse_ledger', 'IDX_warehouse_ledger_order', ['orderId']);
    await idx('warehouse_ledger', 'IDX_warehouse_ledger_task', ['taskId']);
    await idx('warehouse_ledger', 'IDX_warehouse_ledger_clientRef', ['clientRef'], true);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of ['warehouse_ledger', 'warehouse_stock', 'warehouse_bins']) await q.dropTable(t, true, true, true);
  }
}
