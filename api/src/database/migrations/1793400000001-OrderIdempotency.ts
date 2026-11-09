import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/**
 * One tap = one order (audit C-01).
 *
 * - `orders.clientRequestId`: the checkout attempt's idempotency key the app sends (NULL for older apps and for every
 *   existing order). UNIQUE together with `customerId` (MySQL and SQLite both allow many NULLs under a unique index),
 *   so one attempt can never become two orders.
 * - `order_requests`: the claim a request takes BEFORE it does any work; its primary key (customer + key) is what lets
 *   exactly one of several concurrent requests with the same key place the order while the others wait for it.
 *
 * Nothing existing is changed or invented. Written with the QueryRunner table API (no raw MySQL), so it runs on MySQL
 * in production and on SQLite in tests. Reversible.
 */
export class OrderIdempotency1793400000001 implements MigrationInterface {
  name = 'OrderIdempotency1793400000001';

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('orders', 'clientRequestId'))) {
      await q.addColumn('orders', new TableColumn({ name: 'clientRequestId', type: 'varchar', length: '64', isNullable: true }));
    }
    const orders = await q.getTable('orders');
    if (!orders?.indices.some((i) => i.name === 'UQ_orders_customer_request')) {
      await q.createIndex('orders', new TableIndex({ name: 'UQ_orders_customer_request', columnNames: ['customerId', 'clientRequestId'], isUnique: true }));
    }
    if (!(await q.hasTable('order_requests'))) {
      await q.createTable(
        new Table({
          name: 'order_requests',
          columns: [
            { name: 'customerId', type: 'varchar', length: '36', isPrimary: true },
            { name: 'requestKey', type: 'varchar', length: '80', isPrimary: true },
            { name: 'orderId', type: 'varchar', length: '36', isNullable: false },
            { name: 'startedAt', type: 'datetime', isNullable: false },
            { name: 'finishedAt', type: 'datetime', isNullable: true },
            { name: 'outcome', type: 'varchar', length: '10', isNullable: true },
          ],
        }),
        true,
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.dropTable('order_requests', true);
    const orders = await q.getTable('orders');
    if (orders?.indices.some((i) => i.name === 'UQ_orders_customer_request')) await q.dropIndex('orders', 'UQ_orders_customer_request');
    if (await q.hasColumn('orders', 'clientRequestId')) await q.dropColumn('orders', 'clientRequestId');
  }
}
