import { MigrationInterface, QueryRunner } from 'typeorm';

/** Product options (size, colour…) as JSON text on the listing. Nullable: existing products have none. Fully reversible. */
export class ProductVariants1792700000000 implements MigrationInterface {
  name = 'ProductVariants1792700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`products\` ADD \`variants\` text NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`products\` DROP COLUMN \`variants\``);
  }
}
