import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';
import { randomParcelCode } from '../../logistics/parcel-code';

/**
 * Parcel labels and scans.
 *
 * Up:
 *  - creates `parcels`: one row per physical box, with a KOMORIKO code (`PKG-` + 8 characters) that never changes from the seller
 *    to the customer (UNIQUE), the order, the seller (null for a parcel a customer sends back), the return case, `boxNo` of
 *    `boxCount`, and `voidedAt` for a label that was replaced;
 *  - creates `parcel_scans`: one row per scan of a parcel on a leg and stage (`pickup` / `dropoff`), UNIQUE per (parcel, leg,
 *    stage) so a repeated scan is idempotent;
 *  - back-fills one parcel (boxCount 1) for every seller package that is ready (or received) and not yet delivered or cancelled,
 *    so orders already in flight can be labelled and scanned.
 *
 * Written with the QueryRunner API (no raw MySQL), so it runs on MySQL in production and on SQLite in tests. Each step checks
 * what exists first, so a second run changes nothing. Down drops both tables (the scans and the labels cannot be restored).
 */
export class ParcelLabelsAndScans1793470000001 implements MigrationInterface {
  name = 'ParcelLabelsAndScans1793470000001';

  public async up(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    const created = sqlite
      ? { name: 'createdAt', type: 'datetime', isNullable: false, default: "datetime('now')" }
      : { name: 'createdAt', type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' };

    if (!(await q.hasTable('parcels'))) {
      await q.createTable(
        new Table({
          name: 'parcels',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'code', type: 'varchar', length: '16', isNullable: false },
            { name: 'orderId', type: 'varchar', length: '36', isNullable: false },
            { name: 'sellerId', type: 'varchar', length: '36', isNullable: true },
            { name: 'returnId', type: 'varchar', length: '36', isNullable: true },
            { name: 'boxNo', type: 'int', isNullable: false, default: 1 },
            { name: 'boxCount', type: 'int', isNullable: false, default: 1 },
            created,
            { name: 'voidedAt', type: 'datetime', isNullable: true },
          ],
        }),
        true,
      );
      await q.createIndex('parcels', new TableIndex({ name: 'UQ_parcels_code', columnNames: ['code'], isUnique: true }));
      await q.createIndex('parcels', new TableIndex({ name: 'IDX_parcels_orderId', columnNames: ['orderId'] }));
      await q.createIndex('parcels', new TableIndex({ name: 'IDX_parcels_returnId', columnNames: ['returnId'] }));
    }

    if (!(await q.hasTable('parcel_scans'))) {
      await q.createTable(
        new Table({
          name: 'parcel_scans',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'parcelId', type: 'varchar', length: '36', isNullable: false },
            { name: 'taskId', type: 'varchar', length: '36', isNullable: false },
            { name: 'stage', type: 'varchar', length: '8', isNullable: false },
            { name: 'actorId', type: 'varchar', length: '36', isNullable: true },
            { name: 'actorRole', type: 'varchar', length: '40', isNullable: false },
            { name: 'hubId', type: 'varchar', length: '36', isNullable: true },
            { name: 'at', type: 'datetime', isNullable: false },
            { name: 'manual', type: 'boolean', isNullable: false, default: sqlite ? 0 : false },
            { name: 'reason', type: 'varchar', length: '200', isNullable: true },
          ],
        }),
        true,
      );
      await q.createIndex('parcel_scans', new TableIndex({ name: 'UQ_parcel_scans_parcel_task_stage', columnNames: ['parcelId', 'taskId', 'stage'], isUnique: true }));
      await q.createIndex('parcel_scans', new TableIndex({ name: 'IDX_parcel_scans_taskId', columnNames: ['taskId'] }));
    }

    await this.backfill(q);
  }

  /** One parcel per seller package in flight: lines ready or received, not delivered, not cancelled, of an order still alive. */
  private async backfill(q: QueryRunner): Promise<void> {
    const e = (n: string) => q.connection.driver.escape(n);
    if (!(await q.hasTable('order_items')) || !(await q.hasTable('orders'))) return;
    const packages = (await q.query(
      `SELECT DISTINCT i.${e('orderId')} AS orderId, i.${e('sellerId')} AS sellerId FROM ${e('order_items')} i
         INNER JOIN ${e('orders')} o ON o.${e('id')} = i.${e('orderId')}
         WHERE i.${e('fulfilment')} IN ('ready', 'received') AND i.${e('deliveredAt')} IS NULL AND i.${e('sellerId')} IS NOT NULL
           AND i.${e('productId')} NOT LIKE 'ext:%' AND o.${e('status')} NOT IN ('cancelled', 'returned', 'delivered')`,
    )) as { orderId: string; sellerId: string }[];
    if (!packages.length) return;
    const taken = new Set<string>(((await q.query(`SELECT ${e('code')} AS code FROM ${e('parcels')}`)) as { code: string }[]).map((r) => r.code));
    const has = new Set<string>(((await q.query(`SELECT ${e('orderId')} AS orderId, ${e('sellerId')} AS sellerId FROM ${e('parcels')} WHERE ${e('voidedAt')} IS NULL`)) as { orderId: string; sellerId: string | null }[]).map((r) => `${r.orderId}|${r.sellerId}`));
    for (const p of packages) {
      if (has.has(`${p.orderId}|${p.sellerId}`)) continue;
      let code = randomParcelCode();
      while (taken.has(code)) code = randomParcelCode();
      taken.add(code);
      const id = (await q.query(sqliteOrMysqlUuid(q)))[0].id as string;
      await q.query(`INSERT INTO ${e('parcels')} (${e('id')}, ${e('code')}, ${e('orderId')}, ${e('sellerId')}, ${e('boxNo')}, ${e('boxCount')}) VALUES (?, ?, ?, ?, 1, 1)`, [id, code, p.orderId, p.sellerId]);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasTable('parcel_scans')) await q.dropTable('parcel_scans', true, true, true);
    if (await q.hasTable('parcels')) await q.dropTable('parcels', true, true, true);
  }
}

/** A uuid made by the database itself (MySQL has UUID(); SQLite builds one from random bytes), so the migration needs no extra library. */
function sqliteOrMysqlUuid(q: QueryRunner): string {
  const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
  return sqlite
    ? `SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))) AS id`
    : 'SELECT UUID() AS id';
}
