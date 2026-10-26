import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The refund ledger (C-refund): `payment_refunds`, one row for every refund of a payment, whatever path made it
 * (finance's order refund, a cancellation, the refund of returned items, an admin's dispute decision, a seller
 * cancelling lines, a payment that arrived after its order was closed). `payments.refundedUsd` becomes the running TOTAL
 * of those rows (it used to be the amount of the last full refund only), and no refund may take it past `amountUsd`.
 *
 * Data: refunds made before the ledger are written as `legacy` rows so the admin Refunds page and the finance figures
 * count them and the cap sees them:
 *  - a refunded order payment (`status = 'refunded'`) gave back its whole amount: one row for the refund it recorded
 *    (amount `refundedUsd`, destination `refundTo`, pawaPay id and state kept), one for the rest, paid back earlier in
 *    pieces (lines a seller cancelled, partial returns);
 *  - a payment still `succeeded` whose items were partly refunded (a return's refund leaves the payment open): one row
 *    for what the order lines say was paid back, plus its own phone refund where one is in flight.
 * Then `payments.refundedUsd` is set to the sum of each payment's rows. Nothing else changes.
 * Reversible (the totals on `payments.refundedUsd` are kept as they are).
 */
export class PaymentRefunds1793010000001 implements MigrationInterface {
  name = 'PaymentRefunds1793010000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE \`payment_refunds\` (\`id\` varchar(36) NOT NULL, \`paymentId\` varchar(36) NOT NULL, \`orderId\` varchar(36) NULL, \`orderReference\` varchar(255) NULL, \`userId\` varchar(36) NOT NULL, \`amountUsd\` float NOT NULL, \`refundTo\` varchar(10) NOT NULL, \`status\` varchar(12) NOT NULL DEFAULT 'completed', \`refundRef\` varchar(100) NULL, \`kind\` varchar(16) NOT NULL, \`disputeId\` varchar(36) NULL, \`disputeReference\` varchar(24) NULL, \`memo\` varchar(255) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_f201eeb6b580759255174f6216\` (\`paymentId\`), INDEX \`IDX_57a24a8f8f993c93f6e2dce6c9\` (\`orderId\`), INDEX \`IDX_23895a3cf95533cd1a9fe49bf9\` (\`refundRef\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );

    // ── data ───────────────────────────────────────────────────────────────────
    const cols = '`id`, `paymentId`, `orderId`, `orderReference`, `userId`, `amountUsd`, `refundTo`, `status`, `refundRef`, `kind`, `createdAt`, `updatedAt`';
    // 1. the refund a payment recorded itself (a full refund, a cancellation, a phone refund in flight)
    await q.query(
      `INSERT INTO \`payment_refunds\` (${cols})
       SELECT UUID(), p.\`id\`, p.\`orderId\`, p.\`orderReference\`, p.\`userId\`, COALESCE(p.\`refundedUsd\`, p.\`amountUsd\`), COALESCE(p.\`refundTo\`, 'wallet'), COALESCE(p.\`refundStatus\`, 'completed'), p.\`refundRef\`, 'legacy', p.\`updatedAt\`, p.\`updatedAt\`
       FROM \`payments\` p
       WHERE p.\`purpose\` = 'order' AND COALESCE(p.\`refundedUsd\`, p.\`amountUsd\`) > 0
         AND (p.\`status\` = 'refunded' OR (p.\`status\` = 'succeeded' AND p.\`refundRef\` IS NOT NULL))`,
    );
    // 2. the rest of what each payment gave back earlier, in pieces: all of it for a refunded payment, what the lines say otherwise
    await q.query(
      `INSERT INTO \`payment_refunds\` (${cols})
       SELECT UUID(), p.\`id\`, p.\`orderId\`, p.\`orderReference\`, p.\`userId\`, ROUND(t.\`total\` - COALESCE(r.\`done\`, 0), 2), 'wallet', 'completed', NULL, 'legacy', p.\`updatedAt\`, p.\`updatedAt\`
       FROM \`payments\` p
       JOIN (
         SELECT p2.\`id\` AS \`id\`, CASE WHEN p2.\`status\` = 'refunded' THEN p2.\`amountUsd\` ELSE LEAST(COALESCE(i.\`total\`, 0), p2.\`amountUsd\`) END AS \`total\`
         FROM \`payments\` p2
         LEFT JOIN (SELECT \`orderId\`, SUM(\`refundedUsd\`) AS \`total\` FROM \`order_items\` GROUP BY \`orderId\`) i ON i.\`orderId\` = p2.\`orderId\`
         WHERE p2.\`purpose\` = 'order' AND p2.\`status\` IN ('refunded', 'succeeded')
       ) t ON t.\`id\` = p.\`id\`
       LEFT JOIN (SELECT \`paymentId\`, SUM(\`amountUsd\`) AS \`done\` FROM \`payment_refunds\` GROUP BY \`paymentId\`) r ON r.\`paymentId\` = p.\`id\`
       WHERE t.\`total\` - COALESCE(r.\`done\`, 0) > 0.009`,
    );
    // 3. the running total on each payment
    await q.query(
      `UPDATE \`payments\` p
       JOIN (SELECT \`paymentId\`, ROUND(SUM(\`amountUsd\`), 2) AS \`total\` FROM \`payment_refunds\` GROUP BY \`paymentId\`) r ON r.\`paymentId\` = p.\`id\`
       SET p.\`refundedUsd\` = r.\`total\``,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_23895a3cf95533cd1a9fe49bf9\` ON \`payment_refunds\``);
    await q.query(`DROP INDEX \`IDX_57a24a8f8f993c93f6e2dce6c9\` ON \`payment_refunds\``);
    await q.query(`DROP INDEX \`IDX_f201eeb6b580759255174f6216\` ON \`payment_refunds\``);
    await q.query(`DROP TABLE \`payment_refunds\``);
  }
}
