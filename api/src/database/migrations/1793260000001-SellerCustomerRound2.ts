import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex } from 'typeorm';

/**
 * Round 2, seller portal and customer app.
 *
 * - `reviews.photos`: up to 4 photo URLs per review (JSON text).
 * - `store_follows`: which customer follows which store (new-product notices go to the followers).
 * - `sellerLapsedAt` on `disputes`, `replacements`, `exchanges`: marks the request whose seller response time ran
 *   out with no answer, so support, the customer and the seller are told exactly once.
 *
 * Written with the QueryRunner table API (no raw MySQL), so it runs on MySQL in production and on SQLite in tests.
 * Reversible.
 */
export class SellerCustomerRound21793260000001 implements MigrationInterface {
  name = 'SellerCustomerRound21793260000001';

  private static readonly LAPSED = ['disputes', 'replacements', 'exchanges'];

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasColumn('reviews', 'photos'))) {
      await q.addColumn('reviews', new TableColumn({ name: 'photos', type: 'text', isNullable: true }));
    }
    for (const t of SellerCustomerRound21793260000001.LAPSED) {
      if (!(await q.hasColumn(t, 'sellerLapsedAt'))) {
        await q.addColumn(t, new TableColumn({ name: 'sellerLapsedAt', type: 'datetime', isNullable: true }));
      }
    }
    if (!(await q.hasTable('store_follows'))) {
      const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
      await q.createTable(
        new Table({
          name: 'store_follows',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'userId', type: 'varchar', length: '36', isNullable: false },
            { name: 'sellerId', type: 'varchar', length: '36', isNullable: false },
            sqlite
              ? { name: 'createdAt', type: 'datetime', isNullable: false, default: "datetime('now')" }
              : { name: 'createdAt', type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' },
          ],
        }),
        true,
      );
      await q.createIndex('store_follows', new TableIndex({ name: 'IDX_store_follows_unique', columnNames: ['userId', 'sellerId'], isUnique: true }));
      await q.createIndex('store_follows', new TableIndex({ name: 'IDX_store_follows_seller', columnNames: ['sellerId'] }));
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.dropTable('store_follows', true, true, true);
    for (const t of SellerCustomerRound21793260000001.LAPSED) {
      if (await q.hasColumn(t, 'sellerLapsedAt')) await q.dropColumn(t, 'sellerLapsedAt');
    }
    if (await q.hasColumn('reviews', 'photos')) await q.dropColumn('reviews', 'photos');
  }
}
