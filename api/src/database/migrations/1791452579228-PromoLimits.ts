import { MigrationInterface, QueryRunner } from 'typeorm';

/** Promo codes can now expire, be capped (total / per customer) and be private. */
export class PromoLimits1791452579228 implements MigrationInterface {
  name = 'PromoLimits1791452579228';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`promos\` ADD \`maxUses\` int NULL`);
    await queryRunner.query(`ALTER TABLE \`promos\` ADD \`perUserLimit\` int NULL`);
    await queryRunner.query(`ALTER TABLE \`promos\` ADD \`expiresAt\` datetime NULL`);
    await queryRunner.query(`ALTER TABLE \`promos\` ADD \`isPublic\` tinyint NOT NULL DEFAULT 1`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE \`promos\` DROP COLUMN \`isPublic\``);
    await queryRunner.query(`ALTER TABLE \`promos\` DROP COLUMN \`expiresAt\``);
    await queryRunner.query(`ALTER TABLE \`promos\` DROP COLUMN \`perUserLimit\``);
    await queryRunner.query(`ALTER TABLE \`promos\` DROP COLUMN \`maxUses\``);
  }
}
