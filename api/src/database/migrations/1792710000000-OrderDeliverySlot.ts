import { MigrationInterface, QueryRunner } from 'typeorm';

/** The delivery slot the shopper chose at checkout ("YYYY-MM-DD HH:MM-HH:MM"); NULL = as soon as possible. Fully reversible. */
export class OrderDeliverySlot1792710000000 implements MigrationInterface {
  name = 'OrderDeliverySlot1792710000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`orders\` ADD \`deliverySlot\` varchar(22) NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`orders\` DROP COLUMN \`deliverySlot\``);
  }
}
