import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Warehouses, zones and riders are linked: a rider or warehouse staff member has a home warehouse (and riders can
 * have preferred zones), and each delivery task records the warehouse whose riders deliver it. Zones point at their
 * warehouse inside the `deliveryZones` setting (JSON), which needs no schema change. Fully reversible.
 */
export class WarehouseLinks1792930000000 implements MigrationInterface {
  name = 'WarehouseLinks1792930000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`users\` ADD \`hubId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`users\` ADD \`preferredZones\` text NULL`);
    await q.query(`CREATE INDEX \`IDX_bc9b2e5fc43865bb22f7f639bb\` ON \`users\` (\`hubId\`)`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`hubId\` varchar(255) NULL`);
    await q.query(`CREATE INDEX \`IDX_bd875b8567529c8137eb0040c5\` ON \`delivery_tasks\` (\`hubId\`)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_bd875b8567529c8137eb0040c5\` ON \`delivery_tasks\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`hubId\``);
    await q.query(`DROP INDEX \`IDX_bc9b2e5fc43865bb22f7f639bb\` ON \`users\``);
    await q.query(`ALTER TABLE \`users\` DROP COLUMN \`preferredZones\``);
    await q.query(`ALTER TABLE \`users\` DROP COLUMN \`hubId\``);
  }
}
