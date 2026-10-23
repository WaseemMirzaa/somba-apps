import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Delivery time is now set by the seller per product (`products.deliveryDays`) and the order stores the
 * resulting estimate (YYYY-MM-DD). The shopper-chosen slot is dropped; its day becomes the estimate of
 * existing orders. Reversible (the time window of old slots is not restored).
 */
export class OrderEstimatedDelivery1792900000000 implements MigrationInterface {
  name = 'OrderEstimatedDelivery1792900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`orders\` ADD \`estimatedDeliveryDate\` varchar(10) NULL`);
    await q.query(`UPDATE \`orders\` SET \`estimatedDeliveryDate\` = LEFT(\`deliverySlot\`, 10) WHERE \`deliverySlot\` IS NOT NULL`);
    await q.query(`ALTER TABLE \`orders\` DROP COLUMN \`deliverySlot\``);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`orders\` ADD \`deliverySlot\` varchar(22) NULL`);
    await q.query(`ALTER TABLE \`orders\` DROP COLUMN \`estimatedDeliveryDate\``);
  }
}
