import { MigrationInterface, QueryRunner } from 'typeorm';

/** Orders record the server-validated promo discount that was deducted from the total. */
export class OrderDiscount1791451153108 implements MigrationInterface {
  name = 'OrderDiscount1791451153108';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`orders\` ADD \`discountUsd\` float NOT NULL DEFAULT 0`);
    await queryRunner.query(`ALTER TABLE \`orders\` ADD \`promoCode\` varchar(40) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`orders\` DROP COLUMN \`promoCode\``);
    await queryRunner.query(`ALTER TABLE \`orders\` DROP COLUMN \`discountUsd\``);
  }
}
