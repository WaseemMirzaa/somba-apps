import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Multi-warehouse transfers (docs/WAREHOUSE-AREAS-USE-CASE.md UC-10 and UC-11, docs/contracts/areas.md):
 *  - `hub_lanes`: the links trucks and drivers run between two warehouses (one direction per row, a transit time and an
 *    optional price). Parcels travel along the shortest chain of active lanes; with no lanes every transfer is direct.
 *  - `transfer_runs`: one trip carrying many parcels (a manifest), `delivery_tasks.runId` ties a parcel to it.
 *  - `delivery_tasks.finalHubId` (where a chain of transfer hops ends), `hop` / `hops` (which hop of how many).
 *  - `orders.routeBySeller`: the planned chain of warehouses of each seller's parcel.
 *
 * Data: every existing transfer leg is a single hop that ends where it goes (`finalHubId = toHubId`, hop 1 of 1); orders
 * that recorded their origins get the one-step route `[origin, destination]` per seller. Nothing in progress changes.
 * Fully reversible.
 */
export class TransferLanesRuns1793000000002 implements MigrationInterface {
  name = 'TransferLanesRuns1793000000002';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`hub_lanes\` (\`id\` varchar(36) NOT NULL, \`fromHubId\` varchar(36) NOT NULL, \`toHubId\` varchar(36) NOT NULL, \`transitHours\` float NOT NULL, \`costUsd\` float NULL, \`active\` tinyint NOT NULL DEFAULT 1, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_hub_lanes_toHubId\` (\`toHubId\`), UNIQUE INDEX \`IDX_hub_lanes_pair\` (\`fromHubId\`, \`toHubId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(
      `CREATE TABLE \`transfer_runs\` (\`id\` varchar(36) NOT NULL, \`reference\` varchar(20) NOT NULL, \`fromHubId\` varchar(36) NOT NULL, \`toHubId\` varchar(36) NOT NULL, \`riderId\` varchar(36) NULL, \`status\` varchar(12) NOT NULL DEFAULT 'planned', \`createdById\` varchar(36) NULL, \`dispatchedAt\` datetime NULL, \`inTransitAt\` datetime NULL, \`arrivedAt\` datetime NULL, \`closedAt\` datetime NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_transfer_runs_riderId\` (\`riderId\`), INDEX \`IDX_transfer_runs_toHubId\` (\`toHubId\`), INDEX \`IDX_transfer_runs_fromHubId\` (\`fromHubId\`), UNIQUE INDEX \`IDX_transfer_runs_reference\` (\`reference\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await q.query(`ALTER TABLE \`orders\` ADD \`routeBySeller\` text NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`finalHubId\` varchar(36) NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`hop\` int NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`hops\` int NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`runId\` varchar(36) NULL`);
    await q.query(`CREATE INDEX \`IDX_delivery_tasks_runId\` ON \`delivery_tasks\` (\`runId\`)`);

    // ── data ───────────────────────────────────────────────────────────────────
    await q.query(`UPDATE \`delivery_tasks\` SET \`finalHubId\` = \`toHubId\`, \`hop\` = 1, \`hops\` = 1 WHERE \`kind\` IN ('transfer', 'return_transfer') AND \`finalHubId\` IS NULL`);
    let lastId = '';
    for (;;) {
      const batch: { id: string; destinationHubId: string | null; originBySeller: string | null }[] = await q.query(
        `SELECT \`id\`, \`destinationHubId\`, \`originBySeller\` FROM \`orders\` WHERE \`id\` > ? AND \`originBySeller\` IS NOT NULL AND \`routeBySeller\` IS NULL ORDER BY \`id\` ASC LIMIT 500`,
        [lastId],
      );
      if (!batch.length) break;
      for (const o of batch) {
        lastId = o.id;
        try {
          const origins = JSON.parse(o.originBySeller as string) as Record<string, string>;
          const route = Object.fromEntries(Object.entries(origins).map(([seller, hubId]) => [seller, o.destinationHubId && o.destinationHubId !== hubId ? [hubId, o.destinationHubId] : [hubId]]));
          await q.query(`UPDATE \`orders\` SET \`routeBySeller\` = ? WHERE \`id\` = ?`, [JSON.stringify(route), o.id]);
        } catch {
          /* an order whose origins cannot be read keeps no route: the journey is read from its legs */
        }
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_delivery_tasks_runId\` ON \`delivery_tasks\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`runId\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`hops\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`hop\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`finalHubId\``);
    await q.query(`ALTER TABLE \`orders\` DROP COLUMN \`routeBySeller\``);
    await q.query(`DROP INDEX \`IDX_transfer_runs_reference\` ON \`transfer_runs\``);
    await q.query(`DROP INDEX \`IDX_transfer_runs_fromHubId\` ON \`transfer_runs\``);
    await q.query(`DROP INDEX \`IDX_transfer_runs_toHubId\` ON \`transfer_runs\``);
    await q.query(`DROP INDEX \`IDX_transfer_runs_riderId\` ON \`transfer_runs\``);
    await q.query(`DROP TABLE \`transfer_runs\``);
    await q.query(`DROP INDEX \`IDX_hub_lanes_pair\` ON \`hub_lanes\``);
    await q.query(`DROP INDEX \`IDX_hub_lanes_toHubId\` ON \`hub_lanes\``);
    await q.query(`DROP TABLE \`hub_lanes\``);
  }
}
