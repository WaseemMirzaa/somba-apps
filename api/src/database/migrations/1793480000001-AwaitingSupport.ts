import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Returns and disputes start with KOMORIKO support (docs/contracts/admin-controls.md).
 *
 * Up: every OPEN request that waits on the seller (`awaiting_seller`, `seller_rejected`, `seller_timeout`, and a dispute's
 * `seller_replied`) moves to the new first stage `awaiting_support`. A request already `escalated` is support's already and
 * keeps that stage; approved, pickup, received and closed rows are not touched. `sellerDueAt` is kept (it is now the support
 * deadline). A request that sat in `seller_rejected` or `seller_timeout` is marked as "support was told" (`sellerLapsedAt`),
 * so the first support SLA sweep after the deploy does not alert once for every old case.
 * On MySQL the column default becomes `awaiting_support` too.
 *
 * Down: `awaiting_support` rows go back to `awaiting_seller` (a request support was already working on becomes the
 * seller's again: nothing in the data says who it was moved from) and the MySQL default returns.
 *
 * Plain UPDATEs through the QueryRunner API: the same on MySQL and SQLite, and a second run changes nothing.
 */
export class AwaitingSupport1793480000001 implements MigrationInterface {
  name = 'AwaitingSupport1793480000001';

  private static readonly SELLER_STAGES = ['awaiting_seller', 'seller_rejected', 'seller_timeout', 'seller_replied'];

  public async up(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('disputes'))) return;
    const marks = AwaitingSupport1793480000001.SELLER_STAGES.map(() => '?').join(', ');
    await q.query("UPDATE disputes SET sellerLapsedAt = CURRENT_TIMESTAMP WHERE status = 'open' AND stage IN ('seller_rejected', 'seller_timeout') AND sellerLapsedAt IS NULL");
    await q.query(`UPDATE disputes SET stage = 'awaiting_support' WHERE status = 'open' AND stage IN (${marks})`, AwaitingSupport1793480000001.SELLER_STAGES);
    if (q.connection.options.type === 'mysql' || q.connection.options.type === 'mariadb') {
      await q.query("ALTER TABLE disputes ALTER COLUMN stage SET DEFAULT 'awaiting_support'");
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('disputes'))) return;
    await q.query("UPDATE disputes SET stage = 'awaiting_seller' WHERE status = 'open' AND stage = 'awaiting_support'");
    if (q.connection.options.type === 'mysql' || q.connection.options.type === 'mariadb') {
      await q.query("ALTER TABLE disputes ALTER COLUMN stage SET DEFAULT 'awaiting_seller'");
    }
  }
}
