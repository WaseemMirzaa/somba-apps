import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * pawaPay: payments record where a refund went (wallet or the paying phone) and the state of a phone refund;
 * payouts get the network receipt of a pawaPay transfer, and an index to find a payout by its pawaPay id.
 * Payouts are one step now (requested → paid): any row left `approved` goes back to `requested`. Reversible
 * (the status fix is not undone: `approved` no longer exists).
 */
export class PawapayRefundsPayouts1792920000000 implements MigrationInterface {
  name = 'PawapayRefundsPayouts1792920000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`payments\` ADD \`refundTo\` varchar(10) NULL`);
    await q.query(`ALTER TABLE \`payments\` ADD \`refundRef\` varchar(100) NULL`);
    await q.query(`ALTER TABLE \`payments\` ADD \`refundStatus\` varchar(20) NULL`);
    await q.query(`ALTER TABLE \`payments\` ADD \`refundedUsd\` float NULL`);
    await q.query(`CREATE INDEX \`IDX_59109de2861e3a59953ad2ba2a\` ON \`payments\` (\`refundRef\`)`);
    await q.query(`ALTER TABLE \`payouts\` ADD \`receiptRef\` varchar(100) NULL`);
    await q.query(`CREATE INDEX \`IDX_0e832ecfc8683a3f5cec1695ff\` ON \`payouts\` (\`providerRef\`)`);
    await q.query(`UPDATE \`payouts\` SET \`status\` = 'requested' WHERE \`status\` = 'approved'`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_0e832ecfc8683a3f5cec1695ff\` ON \`payouts\``);
    await q.query(`ALTER TABLE \`payouts\` DROP COLUMN \`receiptRef\``);
    await q.query(`DROP INDEX \`IDX_59109de2861e3a59953ad2ba2a\` ON \`payments\``);
    await q.query(`ALTER TABLE \`payments\` DROP COLUMN \`refundedUsd\``);
    await q.query(`ALTER TABLE \`payments\` DROP COLUMN \`refundStatus\``);
    await q.query(`ALTER TABLE \`payments\` DROP COLUMN \`refundRef\``);
    await q.query(`ALTER TABLE \`payments\` DROP COLUMN \`refundTo\``);
  }
}
