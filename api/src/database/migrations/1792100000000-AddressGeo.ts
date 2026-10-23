import { MigrationInterface, QueryRunner } from 'typeorm';

/** Customer address map pin (lat/lng/placeId), stored encrypted as JSON text. Fully reversible. */
export class AddressGeo1792100000000 implements MigrationInterface {
  name = 'AddressGeo1792100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`addresses\` ADD \`geo\` text NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`addresses\` DROP COLUMN \`geo\``);
  }
}
