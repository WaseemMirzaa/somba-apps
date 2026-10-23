import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Commission is stored per order line (rate and USD amount) so a later change of
 * the global `commissionPct` setting never rewrites past orders. Existing lines
 * are back-filled with the rate IN FORCE NOW (the best we know): the `settings`
 * row `commissionPct`, default 12, clamped 0-100. Fully reversible.
 *
 * Idempotent on purpose: a dev database that runs with `synchronize` may already
 * have the (zero-filled) columns; the back-fill then still applies to untouched
 * lines (rate 0 and amount 0).
 */
export class CommissionSnapshot1792810000000 implements MigrationInterface {
  name = 'CommissionSnapshot1792810000000';

  private async hasColumn(q: QueryRunner, table: string, column: string): Promise<boolean> {
    const rows = await q.query(
      `SELECT 1 AS x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    return rows.length > 0;
  }

  public async up(q: QueryRunner): Promise<void> {
    // DDL identical to what TypeORM `synchronize` generates for the entity.
    if (!(await this.hasColumn(q, 'order_items', 'commissionPct'))) {
      await q.query(`ALTER TABLE \`order_items\` ADD \`commissionPct\` float NOT NULL DEFAULT '0'`);
    }
    if (!(await this.hasColumn(q, 'order_items', 'commissionUsd'))) {
      await q.query(`ALTER TABLE \`order_items\` ADD \`commissionUsd\` float NOT NULL DEFAULT '0'`);
    }
    const rows = await q.query(`SELECT \`value\` FROM \`settings\` WHERE \`key\` = 'commissionPct' LIMIT 1`);
    const raw = rows.length ? Number(rows[0].value) : 12;
    const rate = Math.min(100, Math.max(0, Number.isFinite(raw) ? raw : 12));
    if (rate > 0) {
      await q.query(
        `UPDATE \`order_items\` SET \`commissionPct\` = ?, \`commissionUsd\` = ROUND(\`priceUsd\` * \`qty\` * ? / 100, 2) WHERE \`commissionPct\` = 0 AND \`commissionUsd\` = 0`,
        [rate, rate],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`order_items\` DROP COLUMN \`commissionUsd\``);
    await q.query(`ALTER TABLE \`order_items\` DROP COLUMN \`commissionPct\``);
  }
}
