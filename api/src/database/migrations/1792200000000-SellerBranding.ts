import { MigrationInterface, QueryRunner } from 'typeorm';

/** Seller storefront branding: logo, banner and description. Fully reversible. */
export class SellerBranding1792200000000 implements MigrationInterface {
  name = 'SellerBranding1792200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`sellers\` ADD \`logoUrl\` varchar(500) NULL`);
    await q.query(`ALTER TABLE \`sellers\` ADD \`bannerUrl\` varchar(500) NULL`);
    await q.query(`ALTER TABLE \`sellers\` ADD \`description\` text NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`description\``);
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`bannerUrl\``);
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`logoUrl\``);
  }
}
