import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * After-sale and engagement.
 *  - Returns and disputes carry a stage, the lines (`dispute_items`) and the thread (`dispute_messages`); replacements
 *    and exchanges carry the seller's answer, the stock they took and the delivery task; product questions remember
 *    who asked and which store; reviews can be reported and hidden with a reason; one helpful vote per person.
 *  - Support messages move from a JSON column on the ticket to rows of `support_messages` (data migration below), so
 *    two people replying at once can never lose a message; tickets gain the sender's role, an assignee and unread counters.
 *  - `notification_reads` keeps who read a role-wide notice.
 * Fully reversible (the messages go back into the JSON column).
 */
export class AfterSale1792960000001 implements MigrationInterface {
  name = 'AfterSale1792960000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE \`dispute_items\` (\`id\` varchar(36) NOT NULL, \`disputeId\` varchar(36) NOT NULL, \`orderItemId\` varchar(36) NOT NULL, \`productId\` varchar(255) NOT NULL, \`productName\` varchar(255) NOT NULL, \`variant\` varchar(255) NOT NULL DEFAULT 'Default', \`qty\` int NOT NULL DEFAULT '1', \`unitPriceUsd\` float NOT NULL, \`refundUsd\` float NOT NULL DEFAULT '0', \`condition\` varchar(12) NULL, \`restockedQty\` int NOT NULL DEFAULT '0', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_df9fc2c8bc48ae7ac7fd7cb78a\` (\`disputeId\`), INDEX \`IDX_9e49bea5288787aa8d236bef64\` (\`orderItemId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE \`dispute_messages\` (\`id\` varchar(36) NOT NULL, \`disputeId\` varchar(36) NOT NULL, \`authorId\` varchar(255) NOT NULL, \`authorName\` varchar(255) NOT NULL, \`role\` varchar(40) NOT NULL, \`text\` text NOT NULL, \`attachments\` text NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_288e9a3fe13cfe14abe9824e9c\` (\`disputeId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE \`review_reports\` (\`id\` varchar(36) NOT NULL, \`reviewId\` varchar(36) NOT NULL, \`reporterId\` varchar(36) NOT NULL, \`reporterName\` varchar(100) NOT NULL, \`reason\` text NOT NULL, \`status\` varchar(10) NOT NULL DEFAULT 'open', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_f3375c7d477215f4961e2ba871\` (\`reviewId\`), UNIQUE INDEX \`IDX_review_reports_unique\` (\`reviewId\`, \`reporterId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE \`review_helpful\` (\`id\` varchar(36) NOT NULL, \`reviewId\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_review_helpful_unique\` (\`reviewId\`, \`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE \`support_messages\` (\`id\` varchar(36) NOT NULL, \`ticketId\` varchar(36) NOT NULL, \`fromId\` varchar(36) NULL, \`from\` varchar(255) NOT NULL, \`role\` varchar(40) NOT NULL, \`text\` text NOT NULL, \`attachments\` text NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_219aab1e47674b144d2094cfa1\` (\`ticketId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    await q.query(`CREATE TABLE \`notification_reads\` (\`id\` varchar(36) NOT NULL, \`notificationId\` varchar(36) NOT NULL, \`userId\` varchar(36) NOT NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_bddd24aed9c7f0beee6e8d8339\` (\`userId\`), UNIQUE INDEX \`IDX_notification_reads_unique\` (\`notificationId\`, \`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`category\` varchar(24) NULL`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`stage\` varchar(20) NOT NULL DEFAULT 'awaiting_seller'`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`attachments\` text NULL`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`sellerId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`sellerDueAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`sellerRespondedAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`sellerReason\` text NULL`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`escalatedAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`outcome\` varchar(20) NULL`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`refundUsd\` float NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`refundTo\` varchar(10) NOT NULL DEFAULT 'wallet'`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`gradedAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`disputes\` ADD \`pickupTaskId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`reviews\` ADD \`reportCount\` int NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE \`reviews\` ADD \`moderationReason\` text NULL`);
    await q.query(`ALTER TABLE \`product_questions\` ADD \`askerId\` varchar(36) NULL`);
    await q.query(`ALTER TABLE \`product_questions\` ADD \`sellerId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`product_questions\` ADD \`answeredAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`support_tickets\` ADD \`role\` varchar(40) NOT NULL DEFAULT 'customer'`);
    await q.query(`ALTER TABLE \`support_tickets\` ADD \`assigneeId\` varchar(36) NULL`);
    await q.query(`ALTER TABLE \`support_tickets\` ADD \`assigneeName\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`support_tickets\` ADD \`userUnread\` int NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE \`support_tickets\` ADD \`staffUnread\` int NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE \`replacements\` ADD \`qty\` int NOT NULL DEFAULT '1'`);
    await q.query(`ALTER TABLE \`replacements\` ADD \`variant\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`replacements\` ADD \`attachments\` text NULL`);
    await q.query(`ALTER TABLE \`replacements\` ADD \`sellerDueAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`replacements\` ADD \`sellerRespondedAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`replacements\` ADD \`sellerReason\` text NULL`);
    await q.query(`ALTER TABLE \`replacements\` ADD \`stockTaken\` int NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE \`replacements\` ADD \`deliveryTaskId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`replacements\` ADD \`deliveredAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`replacements\` ADD \`disputeId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`exchanges\` ADD \`qty\` int NOT NULL DEFAULT '1'`);
    await q.query(`ALTER TABLE \`exchanges\` ADD \`fromVariant\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`exchanges\` ADD \`toVariant\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`exchanges\` ADD \`heldUsd\` float NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE \`exchanges\` ADD \`sellerDueAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`exchanges\` ADD \`sellerRespondedAt\` datetime NULL`);
    await q.query(`ALTER TABLE \`exchanges\` ADD \`sellerReason\` text NULL`);
    await q.query(`ALTER TABLE \`exchanges\` ADD \`stockTaken\` int NOT NULL DEFAULT '0'`);
    await q.query(`ALTER TABLE \`exchanges\` ADD \`deliveryTaskId\` varchar(255) NULL`);
    await q.query(`ALTER TABLE \`exchanges\` ADD \`deliveredAt\` datetime NULL`);
    await q.query(`CREATE INDEX \`IDX_97027823745f1e7daae8fee761\` ON \`disputes\` (\`stage\`)`);
    await q.query(`CREATE INDEX \`IDX_1f17253f54a59ef6272fba84d9\` ON \`disputes\` (\`sellerId\`)`);
    await q.query(`CREATE INDEX \`IDX_58205cb6c284735295b3f876f8\` ON \`product_questions\` (\`askerId\`)`);
    await q.query(`CREATE INDEX \`IDX_94bd44e38507e80a7613651f4b\` ON \`product_questions\` (\`sellerId\`)`);
    await q.query(`CREATE INDEX \`IDX_2f1a2d477de650a8abb9af37d5\` ON \`support_tickets\` (\`assigneeId\`)`);

    // Disputes: where an existing request stands.
    await q.query(`UPDATE \`disputes\` SET \`stage\` = 'closed' WHERE \`status\` <> 'open'`);
    await q.query(`UPDATE \`disputes\` SET \`stage\` = 'received' WHERE \`status\` = 'open' AND \`receivedAt\` IS NOT NULL`);
    // Questions: which store they belong to.
    await q.query(`UPDATE \`product_questions\` qn INNER JOIN \`products\` p ON p.\`id\` = qn.\`productId\` SET qn.\`sellerId\` = p.\`sellerId\` WHERE qn.\`sellerId\` IS NULL`);

    // Support: the creator's role, then the messages out of the JSON column into rows.
    await q.query(`UPDATE \`support_tickets\` t INNER JOIN \`users\` u ON u.\`id\` = t.\`userId\` SET t.\`role\` = u.\`role\``);
    const tickets: { id: string; userId: string; messages: string | null }[] = await q.query('SELECT `id`, `userId`, `messages` FROM `support_tickets`');
    for (const t of tickets) {
      let list: { from?: string; role?: string; text?: string; at?: string }[] = [];
      try {
        list = JSON.parse(t.messages || '[]');
      } catch {
        list = [];
      }
      for (const m of list) {
        const at = m.at ? new Date(m.at) : new Date();
        const staff = String(m.role ?? '').startsWith('admin');
        await q.query(
          'INSERT INTO `support_messages` (`id`, `ticketId`, `fromId`, `from`, `role`, `text`, `attachments`, `createdAt`) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
          [randomUUID(), t.id, staff ? null : t.userId, String(m.from ?? '').slice(0, 255), String(m.role ?? 'customer').slice(0, 40), String(m.text ?? ''), Number.isNaN(at.getTime()) ? new Date() : at],
        );
      }
    }
    await q.query(`ALTER TABLE \`support_tickets\` DROP COLUMN \`messages\``);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`support_tickets\` ADD \`messages\` text NOT NULL`);
    const rows: { ticketId: string; from: string; role: string; text: string; createdAt: Date }[] = await q.query(
      'SELECT `ticketId`, `from`, `role`, `text`, `createdAt` FROM `support_messages` ORDER BY `createdAt` ASC',
    );
    const by = new Map<string, { from: string; role: string; text: string; at: string }[]>();
    for (const r of rows) by.set(r.ticketId, [...(by.get(r.ticketId) ?? []), { from: r.from, role: r.role, text: r.text, at: new Date(r.createdAt).toISOString() }]);
    for (const [id, list] of by) await q.query('UPDATE `support_tickets` SET `messages` = ? WHERE `id` = ?', [JSON.stringify(list), id]);
    await q.query(`UPDATE \`support_tickets\` SET \`messages\` = '[]' WHERE \`messages\` = ''`);
    await q.query(`DROP INDEX \`IDX_97027823745f1e7daae8fee761\` ON \`disputes\``);
    await q.query(`DROP INDEX \`IDX_1f17253f54a59ef6272fba84d9\` ON \`disputes\``);
    await q.query(`DROP INDEX \`IDX_58205cb6c284735295b3f876f8\` ON \`product_questions\``);
    await q.query(`DROP INDEX \`IDX_94bd44e38507e80a7613651f4b\` ON \`product_questions\``);
    await q.query(`DROP INDEX \`IDX_2f1a2d477de650a8abb9af37d5\` ON \`support_tickets\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`deliveredAt\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`deliveryTaskId\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`stockTaken\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`sellerReason\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`sellerRespondedAt\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`sellerDueAt\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`heldUsd\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`toVariant\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`fromVariant\``);
    await q.query(`ALTER TABLE \`exchanges\` DROP COLUMN \`qty\``);
    await q.query(`ALTER TABLE \`replacements\` DROP COLUMN \`disputeId\``);
    await q.query(`ALTER TABLE \`replacements\` DROP COLUMN \`deliveredAt\``);
    await q.query(`ALTER TABLE \`replacements\` DROP COLUMN \`deliveryTaskId\``);
    await q.query(`ALTER TABLE \`replacements\` DROP COLUMN \`stockTaken\``);
    await q.query(`ALTER TABLE \`replacements\` DROP COLUMN \`sellerReason\``);
    await q.query(`ALTER TABLE \`replacements\` DROP COLUMN \`sellerRespondedAt\``);
    await q.query(`ALTER TABLE \`replacements\` DROP COLUMN \`sellerDueAt\``);
    await q.query(`ALTER TABLE \`replacements\` DROP COLUMN \`attachments\``);
    await q.query(`ALTER TABLE \`replacements\` DROP COLUMN \`variant\``);
    await q.query(`ALTER TABLE \`replacements\` DROP COLUMN \`qty\``);
    await q.query(`ALTER TABLE \`support_tickets\` DROP COLUMN \`staffUnread\``);
    await q.query(`ALTER TABLE \`support_tickets\` DROP COLUMN \`userUnread\``);
    await q.query(`ALTER TABLE \`support_tickets\` DROP COLUMN \`assigneeName\``);
    await q.query(`ALTER TABLE \`support_tickets\` DROP COLUMN \`assigneeId\``);
    await q.query(`ALTER TABLE \`support_tickets\` DROP COLUMN \`role\``);
    await q.query(`ALTER TABLE \`product_questions\` DROP COLUMN \`answeredAt\``);
    await q.query(`ALTER TABLE \`product_questions\` DROP COLUMN \`sellerId\``);
    await q.query(`ALTER TABLE \`product_questions\` DROP COLUMN \`askerId\``);
    await q.query(`ALTER TABLE \`reviews\` DROP COLUMN \`moderationReason\``);
    await q.query(`ALTER TABLE \`reviews\` DROP COLUMN \`reportCount\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`pickupTaskId\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`gradedAt\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`refundTo\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`refundUsd\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`outcome\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`escalatedAt\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`sellerReason\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`sellerRespondedAt\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`sellerDueAt\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`sellerId\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`attachments\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`stage\``);
    await q.query(`ALTER TABLE \`disputes\` DROP COLUMN \`category\``);
    await q.query(`DROP TABLE \`notification_reads\``);
    await q.query(`DROP TABLE \`support_messages\``);
    await q.query(`DROP TABLE \`review_helpful\``);
    await q.query(`DROP TABLE \`review_reports\``);
    await q.query(`DROP TABLE \`dispute_messages\``);
    await q.query(`DROP TABLE \`dispute_items\``);
  }
}
