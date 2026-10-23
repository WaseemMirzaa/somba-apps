import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Exchanges remember the store whose item is exchanged, so the seller can see and follow them (replacements already
 * had this column). Old rows stay null. Fully reversible.
 */
export class ExchangeSeller1792910000000 implements MigrationInterface {
  name = 'ExchangeSeller1792910000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`exchanges\` ADD \`sellerId\` varchar(255) NULL`);
    await q.query(`CREATE INDEX \`IDX_39ad36191fa4c378a81814a1c2\` ON \`exchanges\` (\`sellerId\`)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_39ad36191fa4c378a81814a1c2\` ON \`exchanges\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`sellerId\``);
  }
}
