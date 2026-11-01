import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Commerce: inventory, promotions, products and finance.
 *  - `stock_movements` (the ledger of every change of stock) and `sellers.lowStockThreshold`;
 *  - products gain a gallery (`images`), `sku` (unique per seller), `brand`, `weightGrams` and `variantStock` (units per
 *    option); existing covers become the first picture of the gallery;
 *  - campaigns count what they spent (`spentUsd`, backfilled from the orders) and say why they were rejected / ended;
 *  - flash sales can be nominated by a store (`sellerId`, `status`), remember their schedule phase (`phase`, backfilled)
 *    and when they were made; promo codes can belong to a store (`promos.sellerId`);
 *  - order lines carry their share of a store coupon (`couponDiscountUsd`); payout statement lines remember when their
 *    payout was paid (`paidOutAt`, backfilled for payouts already paid);
 *  - `tax_documents`: the monthly commission invoices.
 * Fully reversible.
 */
export class Commerce1792970000001 implements MigrationInterface {
  name = 'Commerce1792970000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`stock_movements\` (\`id\` varchar(36) NOT NULL, \`productId\` varchar(36) NOT NULL, \`sellerId\` varchar(36) NULL, \`variant\` varchar(200) NULL, \`delta\` int NOT NULL, \`stockAfter\` int NOT NULL, \`reason\` varchar(24) NOT NULL, \`orderId\` varchar(36) NULL, \`actorId\` varchar(36) NULL, \`note\` varchar(200) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_stock_movements_seller\` (\`sellerId\`), INDEX \`IDX_stock_movements_product\` (\`productId\`, \`createdAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await q.query(
      `CREATE TABLE \`tax_documents\` (\`id\` varchar(36) NOT NULL, \`sellerId\` varchar(36) NOT NULL, \`period\` varchar(7) NOT NULL, \`number\` varchar(24) NOT NULL, \`locale\` varchar(5) NOT NULL DEFAULT 'en', \`orders\` int NOT NULL DEFAULT '0', \`units\` int NOT NULL DEFAULT '0', \`grossUsd\` float NOT NULL DEFAULT '0', \`commissionUsd\` float NOT NULL DEFAULT '0', \`creditedUsd\` float NOT NULL DEFAULT '0', \`netUsd\` float NOT NULL DEFAULT '0', \`url\` varchar(500) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_tax_documents_seller\` (\`sellerId\`), UNIQUE INDEX \`IDX_253cc9640e35a6208d21ad8692\` (\`number\`), UNIQUE INDEX \`UQ_tax_documents_seller_period\` (\`sellerId\`, \`period\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    );
    await q.query(`ALTER TABLE \`sellers\` ADD \`lowStockThreshold\` int NOT NULL DEFAULT '10'`);
    await q.query(`ALTER TABLE \`products\` ADD \`images\` text NULL`);
    await q.query(`ALTER TABLE \`products\` ADD \`sku\` varchar(60) NULL`);
    await q.query(`ALTER TABLE \`products\` ADD \`brand\` varchar(80) NULL`);
    await q.query(`ALTER TABLE \`products\` ADD \`weightGrams\` int NULL`);
    await q.query(`ALTER TABLE \`products\` ADD \`variantStock\` text NULL`);
    await q.query(`ALTER TABLE \`order_items\` ADD \`couponDiscountUsd\` float NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE \`payout_statement_lines\` ADD \`paidOutAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`promos\` ADD \`sellerId\` varchar(36) NULL`);
    await q.query(`ALTER TABLE \`flash_sales\` ADD \`sellerId\` varchar(36) NULL`);
    await q.query(`ALTER TABLE \`flash_sales\` ADD \`status\` varchar(16) NOT NULL DEFAULT 'approved'`);
    await q.query(`ALTER TABLE \`flash_sales\` ADD \`phase\` varchar(12) NOT NULL DEFAULT 'scheduled'`);
    await q.query(`ALTER TABLE \`flash_sales\` ADD \`rejectReason\` varchar(300) NULL`);
    await q.query(`ALTER TABLE \`flash_sales\` ADD \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)`);
    await q.query(`ALTER TABLE \`campaigns\` ADD \`spentUsd\` float NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE \`campaigns\` ADD \`rejectReason\` varchar(300) NULL`);
    await q.query(`ALTER TABLE \`campaigns\` ADD \`endedReason\` varchar(20) NULL`);
    await q.query(`CREATE UNIQUE INDEX \`UQ_products_seller_sku\` ON \`products\` (\`sellerId\`, \`sku\`)`);
    await q.query(`CREATE INDEX \`IDX_promos_seller\` ON \`promos\` (\`sellerId\`)`);
    await q.query(`CREATE INDEX \`IDX_flash_sales_seller\` ON \`flash_sales\` (\`sellerId\`)`);

    // Data: the cover becomes the first picture of the gallery.
    await q.query("UPDATE `products` SET `images` = JSON_ARRAY(`image`) WHERE `image` IS NOT NULL AND `image` <> '' AND `images` IS NULL");
    // What each campaign already gave away counts against its budget from now on.
    await q.query(
      "UPDATE `campaigns` c SET c.`spentUsd` = COALESCE((SELECT SUM((i.`listPriceUsd` - i.`priceUsd`) * i.`qty`) FROM `order_items` i INNER JOIN `orders` o ON o.`id` = i.`orderId` WHERE i.`campaignId` = c.`id` AND i.`listPriceUsd` IS NOT NULL AND o.`status` <> 'cancelled'), 0)",
    );
    // Flash sales already running / over keep their phase, so the first sweep does not announce them again.
    const now = "DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%s.000Z')";
    await q.query(`UPDATE \`flash_sales\` SET \`phase\` = 'ended' WHERE \`active\` = 0 OR (\`endsAt\` IS NOT NULL AND \`endsAt\` <> '' AND \`endsAt\` < ${now})`);
    await q.query(`UPDATE \`flash_sales\` SET \`phase\` = 'running' WHERE \`phase\` <> 'ended' AND (\`startsAt\` IS NULL OR \`startsAt\` = '' OR \`startsAt\` <= ${now})`);
    // Payouts already paid: their lines are paid out.
    await q.query("UPDATE `payout_statement_lines` l INNER JOIN `payouts` p ON p.`id` = l.`payoutId` SET l.`paidOutAt` = p.`updatedAt` WHERE p.`status` = 'paid' AND l.`paidOutAt` IS NULL");
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_flash_sales_seller\` ON \`flash_sales\``);
    await q.query(`DROP INDEX \`IDX_promos_seller\` ON \`promos\``);
    await q.query(`DROP INDEX \`UQ_products_seller_sku\` ON \`products\``);
    await q.query(`ALTER TABLE \`campaigns\` DROP COLUMN \`endedReason\``);
    await q.query(`ALTER TABLE \`campaigns\` DROP COLUMN \`rejectReason\``);
    await q.query(`ALTER TABLE \`campaigns\` DROP COLUMN \`spentUsd\``);
    await q.query(`ALTER TABLE \`flash_sales\` DROP COLUMN \`createdAt\``);
    await q.query(`ALTER TABLE \`flash_sales\` DROP COLUMN \`rejectReason\``);
    await q.query(`ALTER TABLE \`flash_sales\` DROP COLUMN \`phase\``);
    await q.query(`ALTER TABLE \`flash_sales\` DROP COLUMN \`status\``);
    await q.query(`ALTER TABLE \`flash_sales\` DROP COLUMN \`sellerId\``);
    await q.query(`ALTER TABLE \`promos\` DROP COLUMN \`sellerId\``);
    await q.query(`ALTER TABLE \`payout_statement_lines\` DROP COLUMN \`paidOutAt\``);
    await q.query(`ALTER TABLE \`order_items\` DROP COLUMN \`couponDiscountUsd\``);
    await q.query(`ALTER TABLE \`products\` DROP COLUMN \`variantStock\``);
    await q.query(`ALTER TABLE \`products\` DROP COLUMN \`weightGrams\``);
    await q.query(`ALTER TABLE \`products\` DROP COLUMN \`brand\``);
    await q.query(`ALTER TABLE \`products\` DROP COLUMN \`sku\``);
    await q.query(`ALTER TABLE \`products\` DROP COLUMN \`images\``);
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`lowStockThreshold\``);
    await q.query(`DROP TABLE \`tax_documents\``);
    await q.query(`DROP TABLE \`stock_movements\``);
  }
}
