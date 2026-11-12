import { createHash, randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/**
 * Same-day parcel groups (one label set for several orders of one seller, one customer, one day, one address).
 *
 * Up:
 *  - creates `parcel_groups` (seller, customer, Kinshasa day + sequence, address key, delivery mode, hubs, `groupKey`, `lockedAt`,
 *    `contentsRev`), UNIQUE (`groupKey`, `daySeq`);
 *  - creates `parcel_group_orders` (group, order), UNIQUE per order: an order is in one group only;
 *  - adds `parcels.groupId` and `parcels.liveSlot` (`groupId:sellerId:boxNo` while the box is live, NULL once void) with a UNIQUE index
 *    on `liveSlot`: one live box per slot, so a double click or a second tab can never make a second set of boxes;
 *  - back-fills one group per order that already has labels (the groups are of one order: the delivery address is encrypted at
 *    rest, so no key can be computed from it here; their `groupKey` is `legacy:<orderId>`, which no new order ever matches),
 *    points the order's parcels at it and sets their `liveSlot`;
 *  - before the unique index, voids the later copy of any live box that the old race had made twice (the copy that was scanned,
 *    else the oldest, is kept).
 *
 * QueryRunner API only (MySQL in production, SQLite in tests); every step checks what exists first, so a second run changes nothing.
 * Down drops the indexes, the two columns and the two tables (the groups cannot be restored; the boxes and their codes stay).
 */
export class ParcelGroups1793500000001 implements MigrationInterface {
  name = 'ParcelGroups1793500000001';

  public async up(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    const created = sqlite
      ? { name: 'createdAt', type: 'datetime', isNullable: false, default: "datetime('now')" }
      : { name: 'createdAt', type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' };

    if (!(await q.hasTable('parcel_groups'))) {
      await q.createTable(
        new Table({
          name: 'parcel_groups',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'sellerKey', type: 'varchar', length: '36', isNullable: true },
            { name: 'customerId', type: 'varchar', length: '36', isNullable: false },
            { name: 'dayKey', type: 'varchar', length: '10', isNullable: false },
            { name: 'daySeq', type: 'int', isNullable: false, default: 1 },
            { name: 'addressKey', type: 'varchar', length: '255', isNullable: false, default: "''" },
            { name: 'deliveryMode', type: 'varchar', length: '16', isNullable: false, default: "'standard'" },
            { name: 'originHubId', type: 'varchar', length: '36', isNullable: true },
            { name: 'destinationHubId', type: 'varchar', length: '36', isNullable: true },
            { name: 'groupKey', type: 'varchar', length: '64', isNullable: false },
            { name: 'lockedAt', type: 'datetime', isNullable: true },
            { name: 'contentsRev', type: 'int', isNullable: false, default: 0 },
            created,
          ],
        }),
        true,
      );
      await q.createIndex('parcel_groups', new TableIndex({ name: 'UQ_parcel_groups_key_seq', columnNames: ['groupKey', 'daySeq'], isUnique: true }));
      await q.createIndex('parcel_groups', new TableIndex({ name: 'IDX_parcel_groups_seller_day', columnNames: ['sellerKey', 'dayKey'] }));
    }
    if (!(await q.hasTable('parcel_group_orders'))) {
      await q.createTable(
        new Table({
          name: 'parcel_group_orders',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'groupId', type: 'varchar', length: '36', isNullable: false },
            { name: 'orderId', type: 'varchar', length: '36', isNullable: false },
            created,
          ],
        }),
        true,
      );
      await q.createIndex('parcel_group_orders', new TableIndex({ name: 'UQ_parcel_group_orders_order', columnNames: ['orderId'], isUnique: true }));
      await q.createIndex('parcel_group_orders', new TableIndex({ name: 'IDX_parcel_group_orders_group', columnNames: ['groupId'] }));
    }

    if (!(await q.hasColumn('parcels', 'groupId'))) await q.addColumn('parcels', new TableColumn({ name: 'groupId', type: 'varchar', length: '36', isNullable: true }));
    if (!(await q.hasColumn('parcels', 'liveSlot'))) await q.addColumn('parcels', new TableColumn({ name: 'liveSlot', type: 'varchar', length: '96', isNullable: true }));

    await this.dedupe(q);
    await this.backfill(q);

    const parcels = await q.getTable('parcels');
    if (!parcels?.indices.some((i) => i.name === 'IDX_parcels_groupId')) await q.createIndex('parcels', new TableIndex({ name: 'IDX_parcels_groupId', columnNames: ['groupId'] }));
    if (!parcels?.indices.some((i) => i.name === 'UQ_parcels_live_slot')) await q.createIndex('parcels', new TableIndex({ name: 'UQ_parcels_live_slot', columnNames: ['liveSlot'], isUnique: true }));
  }

  /** Void the later copy of a box that the old double-click race made twice (live, same order, seller and box number). */
  private async dedupe(q: QueryRunner): Promise<void> {
    const e = (n: string) => q.connection.driver.escape(n);
    const rows = (await q.query(
      `SELECT p.${e('id')} AS id, p.${e('orderId')} AS orderId, p.${e('sellerId')} AS sellerId, p.${e('boxNo')} AS boxNo, p.${e('createdAt')} AS createdAt,
              (SELECT COUNT(*) FROM ${e('parcel_scans')} s WHERE s.${e('parcelId')} = p.${e('id')}) AS scans
         FROM ${e('parcels')} p WHERE p.${e('voidedAt')} IS NULL AND p.${e('returnId')} IS NULL ORDER BY p.${e('createdAt')} ASC, p.${e('id')} ASC`,
    )) as { id: string; orderId: string; sellerId: string | null; boxNo: number; createdAt: unknown; scans: number | string }[];
    const slots = new Map<string, typeof rows>();
    for (const r of rows) {
      const k = `${r.orderId}|${r.sellerId}|${r.boxNo}`;
      slots.set(k, [...(slots.get(k) ?? []), r]);
    }
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    for (const list of slots.values()) {
      if (list.length < 2) continue;
      const keep = list.find((r) => Number(r.scans) > 0) ?? list[0];
      for (const r of list) if (r !== keep) await q.query(`UPDATE ${e('parcels')} SET ${e('voidedAt')} = ? WHERE ${e('id')} = ?`, [now, r.id]);
    }
  }

  /** One group per order that already has labels; its parcels point at it. */
  private async backfill(q: QueryRunner): Promise<void> {
    const e = (n: string) => q.connection.driver.escape(n);
    if (!(await q.hasTable('orders'))) return;
    const parcels = (await q.query(`SELECT ${e('id')} AS id, ${e('orderId')} AS orderId, ${e('sellerId')} AS sellerId, ${e('boxNo')} AS boxNo, ${e('voidedAt')} AS voidedAt FROM ${e('parcels')} WHERE ${e('returnId')} IS NULL AND ${e('groupId')} IS NULL`)) as { id: string; orderId: string; sellerId: string | null; boxNo: number; voidedAt: unknown }[];
    if (!parcels.length) return;
    const byOrder = new Map<string, typeof parcels>();
    for (const p of parcels) byOrder.set(p.orderId, [...(byOrder.get(p.orderId) ?? []), p]);
    const done = new Set<string>(((await q.query(`SELECT ${e('orderId')} AS orderId FROM ${e('parcel_group_orders')}`)) as { orderId: string }[]).map((r) => r.orderId));
    for (const [orderId, list] of byOrder) {
      if (done.has(orderId)) continue;
      const order = ((await q.query(`SELECT ${e('customerId')} AS customerId, ${e('createdAt')} AS createdAt, ${e('deliveryMode')} AS deliveryMode, ${e('destinationHubId')} AS destinationHubId FROM ${e('orders')} WHERE ${e('id')} = ?`, [orderId])) as { customerId: string; createdAt: unknown; deliveryMode: string | null; destinationHubId: string | null }[])[0];
      if (!order) continue;
      const sellers = [...new Set(list.map((p) => p.sellerId).filter((x): x is string => !!x))];
      const placed = new Date(String(order.createdAt).includes('T') || order.createdAt instanceof Date ? (order.createdAt as string) : `${String(order.createdAt).replace(' ', 'T')}Z`);
      const dayKey = new Date((Number.isNaN(placed.getTime()) ? Date.now() : placed.getTime()) + 3_600_000).toISOString().slice(0, 10);
      const groupId = randomUUID();
      await q.query(
        `INSERT INTO ${e('parcel_groups')} (${e('id')}, ${e('sellerKey')}, ${e('customerId')}, ${e('dayKey')}, ${e('daySeq')}, ${e('addressKey')}, ${e('deliveryMode')}, ${e('destinationHubId')}, ${e('groupKey')}, ${e('contentsRev')}) VALUES (?, ?, ?, ?, 1, '', ?, ?, ?, 0)`,
        [groupId, sellers.length === 1 ? sellers[0] : null, order.customerId, dayKey, order.deliveryMode === 'express' ? 'express' : 'standard', order.destinationHubId, createHash('sha256').update(`legacy:${orderId}`).digest('hex')],
      );
      await q.query(`INSERT INTO ${e('parcel_group_orders')} (${e('id')}, ${e('groupId')}, ${e('orderId')}) VALUES (?, ?, ?)`, [randomUUID(), groupId, orderId]);
      for (const p of list) {
        await q.query(`UPDATE ${e('parcels')} SET ${e('groupId')} = ?, ${e('liveSlot')} = ? WHERE ${e('id')} = ?`, [groupId, p.voidedAt ? null : `${groupId}:${p.sellerId}:${p.boxNo}`, p.id]);
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    const parcels = await q.getTable('parcels');
    if (parcels?.indices.some((i) => i.name === 'UQ_parcels_live_slot')) await q.dropIndex('parcels', 'UQ_parcels_live_slot');
    if (parcels?.indices.some((i) => i.name === 'IDX_parcels_groupId')) await q.dropIndex('parcels', 'IDX_parcels_groupId');
    if (await q.hasColumn('parcels', 'liveSlot')) await q.dropColumn('parcels', 'liveSlot');
    if (await q.hasColumn('parcels', 'groupId')) await q.dropColumn('parcels', 'groupId');
    if (await q.hasTable('parcel_group_orders')) await q.dropTable('parcel_group_orders', true, true, true);
    if (await q.hasTable('parcel_groups')) await q.dropTable('parcel_groups', true, true, true);
  }
}
