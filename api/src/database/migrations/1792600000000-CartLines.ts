import { MigrationInterface, QueryRunner } from 'typeorm';

/** Account-level cart and "saved for later" lines (shared by web and app). Fully reversible. */
export class CartLines1792600000000 implements MigrationInterface {
  name = 'CartLines1792600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`cart_lines\` (\`id\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`productId\` varchar(36) NOT NULL, \`variant\` varchar(200) NOT NULL DEFAULT 'Default', \`qty\` int NOT NULL DEFAULT 1, \`priceWhenAdded\` float NULL, \`saved\` tinyint NOT NULL DEFAULT 0, \`position\` int NOT NULL DEFAULT 0, \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_cart_lines_user\` (\`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE \`cart_lines\``);
  }
}
