import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nearest-warehouse routing and the three-leg journey (seller -> origin warehouse -> destination warehouse -> customer):
 * warehouses get a map position, sellers a pickup pin and a computed origin warehouse, orders record their origin and
 * destination warehouses, warehouse staff get a tier, and every delivery task becomes one leg with a kind.
 *
 * Data: existing warehouses keep null coordinates (place them in Admin); existing tasks are `delivery` legs; riders and
 * staff without a warehouse join the first active one (they must belong to one now); existing staff become `manager`
 * (they could do everything before). Fully reversible.
 */
export class Logistics1792950000001 implements MigrationInterface {
  name = 'Logistics1792950000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`hubs\` ADD \`lat\` double NULL`);
    await q.query(`ALTER TABLE \`hubs\` ADD \`lng\` double NULL`);

    await q.query(`ALTER TABLE \`sellers\` ADD \`pickupLat\` double NULL`);
    await q.query(`ALTER TABLE \`sellers\` ADD \`pickupLng\` double NULL`);
    await q.query(`ALTER TABLE \`sellers\` ADD \`originHubId\` varchar(255) NULL`);

    await q.query(`ALTER TABLE \`users\` ADD \`warehouseTier\` varchar(12) NULL`);

    await q.query(`ALTER TABLE \`orders\` ADD \`destinationHubId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`orders\` ADD \`originHubIds\` text NULL`);
    await q.query(`CREATE INDEX \`IDX_orders_destinationHubId\` ON \`orders\` (\`destinationHubId\`)`);

    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`kind\` varchar(24) NOT NULL DEFAULT 'delivery'`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`fromHubId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`toHubId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`sellerId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`parentTaskId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`disputeId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`replacementId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`exchangeId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`itemsJson\` text NULL`);
    await q.query(`CREATE INDEX \`IDX_delivery_tasks_toHubId\` ON \`delivery_tasks\` (\`toHubId\`)`);
    await q.query(`CREATE INDEX \`IDX_delivery_tasks_fromHubId\` ON \`delivery_tasks\` (\`fromHubId\`)`);
    await q.query(`CREATE INDEX \`IDX_delivery_tasks_parentTaskId\` ON \`delivery_tasks\` (\`parentTaskId\`)`);

    // ── data ───────────────────────────────────────────────────────────────────
    // Staff could do everything before tiers existed: keep it that way until an admin lowers someone.
    await q.query(`UPDATE \`users\` SET \`warehouseTier\` = 'manager' WHERE \`role\` = 'warehouse_staff' AND \`warehouseTier\` IS NULL`);
    // Riders and staff must belong to a warehouse: the first active one (by name) for those who had none.
    await q.query(
      `UPDATE \`users\` SET \`hubId\` = (SELECT \`id\` FROM (SELECT \`id\` FROM \`hubs\` ORDER BY \`active\` DESC, \`name\` ASC LIMIT 1) AS first_hub)
       WHERE \`role\` IN ('rider', 'warehouse_staff') AND \`hubId\` IS NULL`,
    );
    // Open tasks that no warehouse owned join the same warehouse; every existing task is a delivery leg from its warehouse.
    await q.query(
      `UPDATE \`delivery_tasks\` SET \`hubId\` = (SELECT \`id\` FROM (SELECT \`id\` FROM \`hubs\` ORDER BY \`active\` DESC, \`name\` ASC LIMIT 1) AS first_hub)
       WHERE \`hubId\` IS NULL AND \`status\` IN ('unassigned', 'assigned', 'picked_up', 'in_transit')`,
    );
    await q.query(`UPDATE \`delivery_tasks\` SET \`kind\` = 'delivery', \`fromHubId\` = \`hubId\` WHERE \`fromHubId\` IS NULL`);
    await q.query(
      `UPDATE \`orders\` o INNER JOIN \`delivery_tasks\` t ON t.\`orderId\` = o.\`id\` AND t.\`hubId\` IS NOT NULL
       SET o.\`destinationHubId\` = t.\`hubId\` WHERE o.\`destinationHubId\` IS NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_delivery_tasks_parentTaskId\` ON \`delivery_tasks\``);
    await q.query(`DROP INDEX \`IDX_delivery_tasks_fromHubId\` ON \`delivery_tasks\``);
    await q.query(`DROP INDEX \`IDX_delivery_tasks_toHubId\` ON \`delivery_tasks\``);
    for (const c of ['itemsJson', 'exchangeId', 'replacementId', 'disputeId', 'parentTaskId', 'sellerId', 'toHubId', 'fromHubId', 'kind']) {
      await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`${c}\``);
    }
    await q.query(`DROP INDEX \`IDX_orders_destinationHubId\` ON \`orders\``);
    await q.query(`ALTER TABLE \`orders\` DROP COLUMN \`originHubIds\``);
    await q.query(`ALTER TABLE \`orders\` DROP COLUMN \`destinationHubId\``);
    await q.query(`ALTER TABLE \`users\` DROP COLUMN \`warehouseTier\``);
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`originHubId\``);
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`pickupLng\``);
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`pickupLat\``);
    await q.query(`ALTER TABLE \`hubs\` DROP COLUMN \`lng\``);
    await q.query(`ALTER TABLE \`hubs\` DROP COLUMN \`lat\``);
  }
}
