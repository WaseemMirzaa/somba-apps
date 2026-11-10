import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * The delivery model: delivery time = the seller's preparation + the platform's transit; a multi-seller order can deliver
 * the parcels that arrived; express delivery from a seller straight to a customer in the same commune.
 *
 * - `products.prepDays` (int, default 2): the seller's preparation time (0-30). Backfilled from the legacy `deliveryDays`:
 *   `deliveryDays - 1` (the platform's default transit is 1 day), never below 0, so 1 -> 0, 4 -> 3, 30 -> 29. A CASE rather
 *   than GREATEST, which SQLite lacks. `deliveryDays` itself stays and keeps being written.
 * - `sellers.expressDelivery` (boolean, default false): the store offers express delivery.
 * - `orders.deliveryMode` (varchar 16, default 'standard'): 'standard' | 'express', decided at checkout.
 * - `order_items.deliveredAt` / `deliveryTaskId` (NULL): when a line reached the customer, and by which leg.
 * - `delivery_tasks.sellerIds` (text, simple-json, NULL): the sellers a customer leg carries (NULL = a legacy leg carrying everything).
 *   MySQL `text` cannot have a default, which is why it is nullable.
 * - index `IDX_delivery_tasks_kind_status`: the sweeper looks legs up by kind and status.
 *
 * Nothing existing is changed. Written with the QueryRunner API (no raw MySQL DDL), so it runs on MySQL and on SQLite. Reversible.
 */
export class DeliveryPrepSplitExpress1793450000001 implements MigrationInterface {
  name = 'DeliveryPrepSplitExpress1793450000001';

  public async up(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';

    if (!(await q.hasColumn('products', 'prepDays'))) {
      await q.addColumn('products', new TableColumn({ name: 'prepDays', type: 'int', isNullable: false, default: 2 }));
      await q.query(this.q(sqlite, `UPDATE "products" SET "prepDays" = CASE WHEN "deliveryDays" > 1 THEN "deliveryDays" - 1 ELSE 0 END`));
    }
    if (!(await q.hasColumn('sellers', 'expressDelivery'))) {
      await q.addColumn('sellers', new TableColumn({ name: 'expressDelivery', type: 'boolean', isNullable: false, default: sqlite ? 0 : false }));
    }
    if (!(await q.hasColumn('orders', 'deliveryMode'))) {
      await q.addColumn('orders', new TableColumn({ name: 'deliveryMode', type: 'varchar', length: '16', isNullable: false, default: "'standard'" }));
    }
    if (!(await q.hasColumn('order_items', 'deliveredAt'))) {
      await q.addColumn('order_items', new TableColumn({ name: 'deliveredAt', type: 'datetime', isNullable: true }));
    }
    if (!(await q.hasColumn('order_items', 'deliveryTaskId'))) {
      await q.addColumn('order_items', new TableColumn({ name: 'deliveryTaskId', type: 'varchar', length: '36', isNullable: true }));
    }
    if (!(await q.hasColumn('delivery_tasks', 'sellerIds'))) {
      await q.addColumn('delivery_tasks', new TableColumn({ name: 'sellerIds', type: 'text', isNullable: true }));
    }
    const tasks = await q.getTable('delivery_tasks');
    if (!tasks?.indices.some((i) => i.name === 'IDX_delivery_tasks_kind_status')) {
      await q.createIndex('delivery_tasks', new TableIndex({ name: 'IDX_delivery_tasks_kind_status', columnNames: ['kind', 'status'] }));
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const tasks = await q.getTable('delivery_tasks');
    if (tasks?.indices.some((i) => i.name === 'IDX_delivery_tasks_kind_status')) await q.dropIndex('delivery_tasks', 'IDX_delivery_tasks_kind_status');
    for (const [table, column] of [
      ['delivery_tasks', 'sellerIds'],
      ['order_items', 'deliveryTaskId'],
      ['order_items', 'deliveredAt'],
      ['orders', 'deliveryMode'],
      ['sellers', 'expressDelivery'],
      ['products', 'prepDays'],
    ] as const) {
      if (await q.hasColumn(table, column)) await q.dropColumn(table, column);
    }
  }

  /** `"x"` identifiers for SQLite, backticks for MySQL. */
  private q(sqlite: boolean, sql: string): string {
    return sqlite ? sql : sql.replace(/"/g, '`');
  }
}
