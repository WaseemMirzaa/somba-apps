import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Closes the server-side gaps behind the "demo data" screens:
 *  - campaign discounts applied at checkout (campaigns.productIds, order lines record the discount)
 *  - seller replies + moderation on reviews
 *  - hub directory (address, active)
 *  - seller subscription plans (sellers.plan/planExpiresAt, payments.subject for purpose 'plan')
 *  - delivery timestamps for real throughput / time-to-deliver numbers
 *  - daily product-view counters (seller conversion funnel)
 *  - indexes for the hot list / analytics queries
 * Fully reversible (down drops everything up added).
 */
export class AnalyticsCampaignsReviews1792000000000 implements MigrationInterface {
  name = 'AnalyticsCampaignsReviews1792000000000';

  public async up(q: QueryRunner): Promise<void> {
    // campaigns
    await q.query(`ALTER TABLE \`campaigns\` ADD \`productIds\` text NULL`);

    // orders + lines
    await q.query(`ALTER TABLE \`orders\` ADD \`campaignDiscountUsd\` float NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE \`order_items\` ADD \`listPriceUsd\` float NULL`);
    await q.query(`ALTER TABLE \`order_items\` ADD \`campaignId\` varchar(36) NULL`);
    await q.query(`ALTER TABLE \`order_items\` ADD \`campaignPct\` int NOT NULL DEFAULT 0`);

    // reviews
    await q.query(`ALTER TABLE \`reviews\` ADD \`status\` varchar(10) NOT NULL DEFAULT 'visible'`);
    await q.query(`ALTER TABLE \`reviews\` ADD \`sellerReply\` text NULL`);
    await q.query(`ALTER TABLE \`reviews\` ADD \`sellerReplyAt\` datetime NULL`);

    // hubs
    await q.query(`ALTER TABLE \`hubs\` ADD \`address\` varchar(200) NULL`);
    await q.query(`ALTER TABLE \`hubs\` ADD \`active\` tinyint NOT NULL DEFAULT 1`);

    // seller subscription
    await q.query(`ALTER TABLE \`sellers\` ADD \`plan\` varchar(30) NOT NULL DEFAULT 'free'`);
    await q.query(`ALTER TABLE \`sellers\` ADD \`planExpiresAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`payments\` ADD \`subject\` varchar(60) NULL`);

    // delivery timestamps
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`pickedUpAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`deliveredAt\` datetime NULL`);

    // product views (one row per product per UTC day)
    await q.query(
      `CREATE TABLE \`product_views\` (\`id\` varchar(36) NOT NULL, \`productId\` varchar(36) NOT NULL, \`viewDate\` varchar(10) NOT NULL, \`views\` int NOT NULL DEFAULT '0', UNIQUE INDEX \`IDX_product_views_product_day\` (\`productId\`, \`viewDate\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );

    // indexes for list + analytics queries
    await q.query(`CREATE INDEX \`IDX_orders_status_created\` ON \`orders\` (\`status\`, \`createdAt\`)`);
    await q.query(`CREATE INDEX \`IDX_orders_created\` ON \`orders\` (\`createdAt\`)`);
    await q.query(`CREATE INDEX \`IDX_payments_status_created\` ON \`payments\` (\`status\`, \`createdAt\`)`);
    await q.query(`CREATE INDEX \`IDX_delivery_tasks_status\` ON \`delivery_tasks\` (\`status\`)`);
    await q.query(`CREATE INDEX \`IDX_products_status_seller\` ON \`products\` (\`status\`, \`sellerId\`)`);
    await q.query(`CREATE INDEX \`IDX_products_seller\` ON \`products\` (\`sellerId\`)`);
    await q.query(`CREATE INDEX \`IDX_order_items_product\` ON \`order_items\` (\`productId\`)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_order_items_product\` ON \`order_items\``);
    await q.query(`DROP INDEX \`IDX_products_seller\` ON \`products\``);
    await q.query(`DROP INDEX \`IDX_products_status_seller\` ON \`products\``);
    await q.query(`DROP INDEX \`IDX_delivery_tasks_status\` ON \`delivery_tasks\``);
    await q.query(`DROP INDEX \`IDX_payments_status_created\` ON \`payments\``);
    await q.query(`DROP INDEX \`IDX_orders_created\` ON \`orders\``);
    await q.query(`DROP INDEX \`IDX_orders_status_created\` ON \`orders\``);

    await q.query(`DROP TABLE \`product_views\``);

    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`deliveredAt\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`pickedUpAt\``);
    await q.query(`ALTER TABLE \`payments\` DROP COLUMN \`subject\``);
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`planExpiresAt\``);
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`plan\``);
    await q.query(`ALTER TABLE \`hubs\` DROP COLUMN \`active\``);
    await q.query(`ALTER TABLE \`hubs\` DROP COLUMN \`address\``);
    await q.query(`ALTER TABLE \`reviews\` DROP COLUMN \`sellerReplyAt\``);
    await q.query(`ALTER TABLE \`reviews\` DROP COLUMN \`sellerReply\``);
    await q.query(`ALTER TABLE \`reviews\` DROP COLUMN \`status\``);
    await q.query(`ALTER TABLE \`order_items\` DROP COLUMN \`campaignPct\``);
    await q.query(`ALTER TABLE \`order_items\` DROP COLUMN \`campaignId\``);
    await q.query(`ALTER TABLE \`order_items\` DROP COLUMN \`listPriceUsd\``);
    await q.query(`ALTER TABLE \`orders\` DROP COLUMN \`campaignDiscountUsd\``);
    await q.query(`ALTER TABLE \`campaigns\` DROP COLUMN \`productIds\``);
  }
}
