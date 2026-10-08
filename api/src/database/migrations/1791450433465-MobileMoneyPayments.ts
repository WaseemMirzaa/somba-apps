import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Mobile-money payments: a payment may now be a wallet top-up (no order), and
 * carries the aggregator's transaction id and the (encrypted) subscriber number.
 */
export class MobileMoneyPayments1791450433465 implements MigrationInterface {
  name = 'MobileMoneyPayments1791450433465';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`payments\` ADD \`purpose\` varchar(10) NOT NULL DEFAULT 'order'`);
    await queryRunner.query(`ALTER TABLE \`payments\` ADD \`providerRef\` varchar(100) NULL`);
    await queryRunner.query(`ALTER TABLE \`payments\` ADD \`phone\` text NULL`);
    await queryRunner.query(`ALTER TABLE \`payments\` MODIFY \`orderId\` varchar(255) NULL`);
    await queryRunner.query(`ALTER TABLE \`payments\` MODIFY \`orderReference\` varchar(255) NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Top-up payments have no order: remove them before restoring NOT NULL.
    await queryRunner.query(`DELETE FROM \`payments\` WHERE \`orderId\` IS NULL`);
    await queryRunner.query(`ALTER TABLE \`payments\` MODIFY \`orderReference\` varchar(255) NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`payments\` MODIFY \`orderId\` varchar(255) NOT NULL`);
    await queryRunner.query(`ALTER TABLE \`payments\` DROP COLUMN \`phone\``);
    await queryRunner.query(`ALTER TABLE \`payments\` DROP COLUMN \`providerRef\``);
    await queryRunner.query(`ALTER TABLE \`payments\` DROP COLUMN \`purpose\``);
  }
}
