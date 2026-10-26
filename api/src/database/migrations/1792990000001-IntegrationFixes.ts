import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Integration fixes:
 *  - `warehouse_exceptions.hubId`: the warehouse an incident belongs to, so warehouse staff only see their own. Existing
 *    incidents are matched to a warehouse through their parcel (the task's warehouse) and, failing that, the hub name they
 *    were filed under; an incident that matches neither stays visible to admins only.
 *  - `orders.originBySeller`: `{ sellerId: hubId }`, which warehouse collects from which seller (`originHubIds` has no line order).
 *    Older orders are read back from their pickup legs by the customer view.
 *  - `exchanges.attachments`: the customer's photos of the item (JSON list of upload URLs).
 * Fully reversible.
 */
export class IntegrationFixes1792990000001 implements MigrationInterface {
  name = 'IntegrationFixes1792990000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`exchanges\` ADD \`attachments\` text NULL`);
    await q.query(`ALTER TABLE \`orders\` ADD \`originBySeller\` text NULL`);
    await q.query(`ALTER TABLE \`warehouse_exceptions\` ADD \`hubId\` varchar(36) NULL`);
    await q.query(`CREATE INDEX \`IDX_warehouse_exceptions_hubId\` ON \`warehouse_exceptions\` (\`hubId\`)`);
    await q.query(
      `UPDATE \`warehouse_exceptions\` e INNER JOIN \`delivery_tasks\` t ON t.\`id\` = e.\`taskId\` SET e.\`hubId\` = COALESCE(t.\`hubId\`, t.\`toHubId\`) WHERE e.\`hubId\` IS NULL`,
    );
    await q.query(
      `UPDATE \`warehouse_exceptions\` e INNER JOIN \`hubs\` h ON LOWER(TRIM(h.\`name\`)) = LOWER(TRIM(e.\`hub\`)) SET e.\`hubId\` = h.\`id\` WHERE e.\`hubId\` IS NULL AND e.\`hub\` IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_warehouse_exceptions_hubId\` ON \`warehouse_exceptions\``);
    await q.query(`ALTER TABLE \`warehouse_exceptions\` DROP COLUMN \`hubId\``);
    await q.query(`ALTER TABLE \`orders\` DROP COLUMN \`originBySeller\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`attachments\``);
  }
}
