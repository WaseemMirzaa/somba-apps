import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seller platform (docs/contracts/seller-platform.md):
 *  - `seller_team`: staff seats of a store (invited by e-mail, role, status);
 *  - `conversations` / `conversation_messages`: customer <-> seller chat (utf8mb4: messages carry emoji);
 *  - `private_files`: KYC documents that are no longer served from the public /uploads/ folder;
 *  - `sellers`: vacation mode, handling time, returns / shipping policy, goals, reputation inputs, payout account;
 *  - `users`: two-factor authentication (TOTP secret, enabled flag, hashed recovery codes, last used step).
 * Moving the files of existing KYC documents behind the login happens at API start-up (they are files, not rows).
 * Fully reversible.
 */
export class SellerPlatform1792980000001 implements MigrationInterface {
  name = 'SellerPlatform1792980000001';

  public async up(q: QueryRunner): Promise<void> {
    const tail = 'ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';
    await q.query(
      `CREATE TABLE \`seller_team\` (\`id\` varchar(36) NOT NULL, \`sellerId\` varchar(36) NOT NULL, \`userId\` varchar(36) NULL, \`emailHash\` varchar(64) NOT NULL, \`email\` text NOT NULL, \`name\` varchar(100) NULL, \`role\` varchar(16) NOT NULL DEFAULT 'orders', \`status\` varchar(10) NOT NULL DEFAULT 'invited', \`inviteTokenHash\` varchar(64) NULL, \`inviteExpiresAt\` datetime NULL, \`invitedBy\` varchar(36) NOT NULL, \`acceptedAt\` datetime NULL, \`removedAt\` datetime NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_seller_team_seller\` (\`sellerId\`), INDEX \`IDX_seller_team_user\` (\`userId\`), UNIQUE INDEX \`IDX_seller_team_unique\` (\`sellerId\`, \`emailHash\`), PRIMARY KEY (\`id\`)) ${tail}`,
    );
    await q.query(
      `CREATE TABLE \`conversations\` (\`id\` varchar(36) NOT NULL, \`buyerId\` varchar(36) NOT NULL, \`buyerName\` varchar(100) NOT NULL, \`sellerId\` varchar(36) NOT NULL, \`productId\` varchar(36) NULL, \`orderId\` varchar(36) NULL, \`contextKey\` varchar(80) NOT NULL DEFAULT '', \`lastMessageAt\` datetime NULL, \`lastMessagePreview\` varchar(200) NOT NULL DEFAULT '', \`buyerUnread\` int NOT NULL DEFAULT '0', \`sellerUnread\` int NOT NULL DEFAULT '0', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_conversations_buyer\` (\`buyerId\`), INDEX \`IDX_conversations_seller\` (\`sellerId\`), UNIQUE INDEX \`IDX_conversations_unique\` (\`buyerId\`, \`sellerId\`, \`contextKey\`), PRIMARY KEY (\`id\`)) ${tail}`,
    );
    await q.query(
      `CREATE TABLE \`conversation_messages\` (\`id\` varchar(36) NOT NULL, \`conversationId\` varchar(36) NOT NULL, \`senderId\` varchar(36) NOT NULL, \`senderSide\` varchar(10) NOT NULL, \`senderName\` varchar(100) NOT NULL, \`text\` text NOT NULL, \`attachments\` text NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_conversation_messages_thread\` (\`conversationId\`, \`createdAt\`), PRIMARY KEY (\`id\`)) ${tail}`,
    );
    await q.query(
      `CREATE TABLE \`private_files\` (\`id\` varchar(36) NOT NULL, \`ownerUserId\` varchar(36) NOT NULL, \`kind\` varchar(20) NOT NULL DEFAULT 'kyc', \`storedName\` varchar(80) NOT NULL, \`mime\` varchar(40) NOT NULL, \`size\` int NOT NULL DEFAULT '0', \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_private_files_owner\` (\`ownerUserId\`), PRIMARY KEY (\`id\`)) ${tail}`,
    );

    await q.query('ALTER TABLE `sellers` ADD `vacationUntil` datetime NULL');
    await q.query("ALTER TABLE `sellers` ADD `handlingDays` int NOT NULL DEFAULT '0'");
    await q.query('ALTER TABLE `sellers` ADD `returnsPolicy` text NULL');
    await q.query('ALTER TABLE `sellers` ADD `shippingPolicy` text NULL');
    await q.query('ALTER TABLE `sellers` ADD `goals` text NULL');
    await q.query("ALTER TABLE `sellers` ADD `ratingCount` int NOT NULL DEFAULT '0'");
    await q.query('ALTER TABLE `sellers` ADD `fulfilmentRate` float NULL');
    await q.query('ALTER TABLE `sellers` ADD `scoreUpdatedAt` datetime NULL');
    await q.query('ALTER TABLE `sellers` ADD `payoutMethod` varchar(20) NULL');
    await q.query('ALTER TABLE `sellers` ADD `payoutAccount` text NULL');

    await q.query('ALTER TABLE `users` ADD `twofaSecret` text NULL');
    await q.query('ALTER TABLE `users` ADD `twofaEnabled` tinyint NOT NULL DEFAULT 0');
    await q.query('ALTER TABLE `users` ADD `twofaRecovery` text NULL');
    await q.query("ALTER TABLE `users` ADD `twofaLastStep` int NOT NULL DEFAULT '0'");

    // Stores that already have reviews get a real rating count right away (the hourly sweep keeps it true afterwards).
    await q.query(
      `UPDATE \`sellers\` s SET s.\`ratingCount\` = (SELECT COUNT(*) FROM \`reviews\` r INNER JOIN \`products\` p ON p.\`id\` = r.\`productId\` WHERE r.\`status\` = 'visible' AND (p.\`sellerId\` = s.\`id\` OR p.\`sellerId\` = s.\`userId\`))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const c of ['twofaLastStep', 'twofaRecovery', 'twofaEnabled', 'twofaSecret']) await q.query(`ALTER TABLE \`users\` DROP COLUMN \`${c}\``);
    for (const c of ['payoutAccount', 'payoutMethod', 'scoreUpdatedAt', 'fulfilmentRate', 'ratingCount', 'goals', 'shippingPolicy', 'returnsPolicy', 'handlingDays', 'vacationUntil']) {
      await q.query(`ALTER TABLE \`sellers\` DROP COLUMN \`${c}\``);
    }
    await q.query('DROP TABLE `private_files`');
    await q.query('DROP TABLE `conversation_messages`');
    await q.query('DROP TABLE `conversations`');
    await q.query('DROP TABLE `seller_team`');
  }
}
