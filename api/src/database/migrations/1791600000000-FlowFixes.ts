import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fixes for broken flows: delivery re-attempts + failure reason, seller pickup
 * and "ready" signal, hub receiving, returns must arrive before a refund, and
 * payouts record where the money goes and the real transfer reference.
 */
export class FlowFixes1791600000000 implements MigrationInterface {
  name = 'FlowFixes1791600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`attempts\` int NOT NULL DEFAULT 1`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`failureReason\` varchar(200) NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`pickupAddress\` text NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`readyAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`delivery_tasks\` ADD \`receivedAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`receivedAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`payouts\` ADD \`account\` text NULL`);
    await q.query(`ALTER TABLE \`payouts\` ADD \`providerRef\` varchar(100) NULL`);
    await q.query(`ALTER TABLE \`sellers\` ADD \`pickupAddress\` text NULL`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`pickupAddress\``);
    await q.query(`ALTER TABLE \`payouts\` DROP COLUMN \`providerRef\``);
    await q.query(`ALTER TABLE \`payouts\` DROP COLUMN \`account\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`receivedAt\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`receivedAt\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`readyAt\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`pickupAddress\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`failureReason\``);
    await q.query(`ALTER TABLE \`delivery_tasks\` DROP COLUMN \`attempts\``);
  }
}
