import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-seller orders: every line remembers its seller and its own fulfilment
 * state (each seller packs, readies or cancels only their package). Existing
 * lines are attributed to their listing's current seller. Fully reversible.
 */
export class SellerPackages1792300000000 implements MigrationInterface {
  name = 'SellerPackages1792300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`order_items\` ADD \`sellerId\` varchar(36) NULL`);
    await q.query(`ALTER TABLE \`order_items\` ADD \`sellerName\` varchar(120) NULL`);
    await q.query(`ALTER TABLE \`order_items\` ADD \`fulfilment\` varchar(16) NOT NULL DEFAULT 'open'`);
    await q.query(`ALTER TABLE \`order_items\` ADD \`readyAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`order_items\` ADD \`receivedAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`order_items\` ADD \`cancelReason\` varchar(200) NULL`);
    await q.query(`ALTER TABLE \`order_items\` ADD \`refundedUsd\` float NOT NULL DEFAULT 0`);
    await q.query(`CREATE INDEX \`IDX_order_items_seller\` ON \`order_items\` (\`sellerId\`)`);
    await q.query(
      `UPDATE \`order_items\` i JOIN \`products\` p ON p.\`id\` = i.\`productId\` SET i.\`sellerId\` = p.\`sellerId\`, i.\`sellerName\` = p.\`sellerName\``,
    );
    // Lines of orders already cancelled are cancelled too, so seller views and payouts agree.
    await q.query(
      `UPDATE \`order_items\` i JOIN \`orders\` o ON o.\`id\` = i.\`orderId\` SET i.\`fulfilment\` = 'cancelled' WHERE o.\`status\` = 'cancelled'`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_order_items_seller\` ON \`order_items\``);
    for (const c of ['refundedUsd', 'cancelReason', 'receivedAt', 'readyAt', 'fulfilment', 'sellerName', 'sellerId']) {
      await q.query(`ALTER TABLE \`order_items\` DROP COLUMN \`${c}\``);
    }
  }
}
