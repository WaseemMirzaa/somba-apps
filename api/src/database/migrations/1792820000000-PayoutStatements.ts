import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-payout settlement statements: one `payout_statement_lines` row per sale
 * (or refund clawback) settled by a payout, plus the statement totals and the
 * opening / closing balance on the payout itself. Existing payouts keep NULL
 * totals ("issued before statements existed"). Fully reversible.
 */
export class PayoutStatements1792820000000 implements MigrationInterface {
  name = 'PayoutStatements1792820000000';

  private static readonly PAYOUT_COLUMNS = [
    'statementGrossUsd',
    'statementCommissionUsd',
    'statementRefundsUsd',
    'statementNetUsd',
    'openingBalanceUsd',
    'closingBalanceUsd',
  ];

  private async has(q: QueryRunner, table: string, column?: string): Promise<boolean> {
    const rows = column
      ? await q.query(`SELECT 1 AS x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, column])
      : await q.query(`SELECT 1 AS x FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [table]);
    return rows.length > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    // DDL identical to what TypeORM `synchronize` generates for the entities.
    if (!(await this.has(q, 'payout_statement_lines'))) {
      await q.query(
        'CREATE TABLE `payout_statement_lines` (`id` varchar(36) NOT NULL, `payoutId` varchar(36) NOT NULL, `sellerId` varchar(255) NOT NULL, `orderItemId` varchar(36) NOT NULL, `orderId` varchar(36) NOT NULL, `orderReference` varchar(255) NOT NULL, `productName` varchar(255) NOT NULL, `variant` varchar(255) NOT NULL, `qty` int NOT NULL, `kind` varchar(10) NOT NULL, `grossUsd` float NOT NULL, `commissionPct` float NOT NULL, `commissionUsd` float NOT NULL, `refundUsd` float NOT NULL DEFAULT \'0\', `netUsd` float NOT NULL, `deliveredAt` datetime NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX `IDX_payout_statement_lines_payout` (`payoutId`), INDEX `IDX_payout_statement_lines_item` (`orderItemId`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
      );
    }
    for (const c of PayoutStatements1792820000000.PAYOUT_COLUMNS) {
      if (!(await this.has(q, 'payouts', c))) await q.query(`ALTER TABLE \`payouts\` ADD \`${c}\` float NULL`);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const c of [...PayoutStatements1792820000000.PAYOUT_COLUMNS].reverse()) {
      await q.query(`ALTER TABLE \`payouts\` DROP COLUMN \`${c}\``);
    }
    await q.query('DROP INDEX `IDX_payout_statement_lines_item` ON `payout_statement_lines`');
    await q.query('DROP INDEX `IDX_payout_statement_lines_payout` ON `payout_statement_lines`');
    await q.query('DROP TABLE `payout_statement_lines`');
  }
}
