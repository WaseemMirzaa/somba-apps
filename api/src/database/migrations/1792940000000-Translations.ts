import { MigrationInterface, QueryRunner } from 'typeorm';
import { moveCategories, moveNameFr } from '../i18n-moves';

/**
 * Multilingual (EN / FR) storage, normalized (docs/MULTILINGUAL-PLAN.md §2.1).
 *
 *  - new tables `translations` (one row per record, field and language) and `translation_jobs` (the work queue);
 *  - `sourceLang` on every record that carries authored text;
 *  - `products.categoryId` (indexed, foreign key, ON DELETE RESTRICT) replaces the copied category NAME;
 *  - DATA MOVES before anything is dropped: products / categories / campaigns `nameFr` become author rows in
 *    `translations` (when not empty and different from the name); every product gets a categoryId (a category row is
 *    created for a name nobody has);
 *  - the per-language and copied columns are dropped: products.nameFr / categoryFr / category / sellerName,
 *    categories.nameFr, campaigns.nameFr / sellerName, flash_sales.productName, sellers.productCount.
 *
 * Utf8mb4 is pinned on the new tables (L20). The same moves, idempotent, exist for databases managed by
 * `synchronize` in scripts/i18n-migrate-synced-db.cjs. Reversible: `down` rebuilds the dropped columns from the
 * new storage.
 */
export class Translations1792940000000 implements MigrationInterface {
  name = 'Translations1792940000000';

  public async up(q: QueryRunner): Promise<void> {
    // ── 1. New tables and columns ─────────────────────────────────────────────────────────
    await q.query(
      'CREATE TABLE `translations` (`id` varchar(36) NOT NULL, `entityType` varchar(24) NOT NULL, `entityId` varchar(36) NOT NULL, `field` varchar(32) NOT NULL, `locale` varchar(5) NOT NULL, `value` text NOT NULL, `origin` varchar(10) NOT NULL, `sourceLang` varchar(5) NULL, `sourceHash` varchar(40) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_translations_hash` (`sourceHash`, `locale`), INDEX `IDX_translations_entity` (`entityType`, `entityId`), UNIQUE INDEX `IDX_translations_unique` (`entityType`, `entityId`, `field`, `locale`), PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    );
    await q.query(
      "CREATE TABLE `translation_jobs` (`id` varchar(36) NOT NULL, `entityType` varchar(24) NOT NULL, `entityId` varchar(36) NOT NULL, `status` varchar(10) NOT NULL DEFAULT 'pending', `attempts` int NOT NULL DEFAULT '0', `nextAttemptAt` datetime NULL, `lastError` varchar(300) NULL, `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_translation_jobs_due` (`status`, `nextAttemptAt`), UNIQUE INDEX `IDX_translation_jobs_unique` (`entityType`, `entityId`), PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
    );
    for (const table of ['products', 'categories', 'sellers', 'campaigns', 'flash_sales', 'cms_blocks', 'broadcasts']) {
      await q.query(`ALTER TABLE \`${table}\` ADD \`sourceLang\` varchar(5) NOT NULL DEFAULT 'en'`);
    }
    await q.query('ALTER TABLE `products` ADD `categoryId` varchar(36) NULL');

    // ── 2. Data moves (nothing is dropped before it is copied) ───────────────────────────
    await moveNameFr(q, 'categories', 'category');
    await moveCategories(q);
    await moveNameFr(q, 'products', 'product');
    await moveNameFr(q, 'campaigns', 'campaign');

    // ── 3. Drop what the new storage replaces ─────────────────────────────────────────────
    await q.query('DROP INDEX `IDX_c3932231d2385ac248d0888d95` ON `products`');
    for (const [table, columns] of Object.entries({
      products: ['category', 'categoryFr', 'nameFr', 'sellerName'],
      categories: ['nameFr'],
      campaigns: ['nameFr', 'sellerName'],
      flash_sales: ['productName'],
      sellers: ['productCount'],
    })) {
      for (const column of columns) await q.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
    }

    // ── 4. Products point at their category ───────────────────────────────────────────────
    await q.query('CREATE INDEX `IDX_products_category` ON `products` (`categoryId`)');
    await q.query(
      'ALTER TABLE `products` ADD CONSTRAINT `FK_ff56834e735fa78a15d0cf21926` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE `products` DROP FOREIGN KEY `FK_ff56834e735fa78a15d0cf21926`');
    await q.query('DROP INDEX `IDX_products_category` ON `products`');

    // Rebuild the dropped columns from the new storage.
    await q.query('ALTER TABLE `sellers` ADD `productCount` int NOT NULL DEFAULT \'0\'');
    await q.query('ALTER TABLE `flash_sales` ADD `productName` varchar(255) NOT NULL DEFAULT \'\'');
    await q.query('ALTER TABLE `campaigns` ADD `nameFr` varchar(255) NULL');
    await q.query('ALTER TABLE `campaigns` ADD `sellerName` varchar(255) NULL');
    await q.query('ALTER TABLE `categories` ADD `nameFr` varchar(255) NULL');
    await q.query('ALTER TABLE `products` ADD `sellerName` varchar(255) NULL');
    await q.query('ALTER TABLE `products` ADD `nameFr` varchar(255) NULL');
    await q.query('ALTER TABLE `products` ADD `categoryFr` varchar(255) NULL');
    await q.query("ALTER TABLE `products` ADD `category` varchar(255) NOT NULL DEFAULT ''");

    const fr = (table: string, type: string, column = 'nameFr') =>
      q.query(
        `UPDATE \`${table}\` x JOIN \`translations\` t ON t.\`entityType\` = '${type}' AND t.\`entityId\` = x.\`id\` AND t.\`field\` = 'name' AND t.\`locale\` = 'fr'
         SET x.\`${column}\` = t.\`value\``,
      );
    await fr('categories', 'category');
    await fr('products', 'product');
    await fr('campaigns', 'campaign');
    await q.query('UPDATE `products` p JOIN `categories` c ON c.`id` = p.`categoryId` SET p.`category` = c.`name`, p.`categoryFr` = COALESCE(c.`nameFr`, c.`name`)');
    await q.query('UPDATE `products` p JOIN `sellers` s ON s.`id` = p.`sellerId` SET p.`sellerName` = s.`name`');
    await q.query('UPDATE `campaigns` c JOIN `sellers` s ON s.`id` = c.`sellerId` SET c.`sellerName` = s.`name`');
    await q.query('UPDATE `flash_sales` f JOIN `products` p ON p.`id` = f.`productId` SET f.`productName` = p.`name`');
    await q.query("UPDATE `sellers` s SET s.`productCount` = (SELECT COUNT(*) FROM `products` p WHERE p.`sellerId` = s.`id` AND p.`status` = 'live')");
    await q.query('CREATE INDEX `IDX_c3932231d2385ac248d0888d95` ON `products` (`category`)');

    await q.query('ALTER TABLE `products` DROP COLUMN `categoryId`');
    for (const table of ['products', 'categories', 'sellers', 'campaigns', 'flash_sales', 'cms_blocks', 'broadcasts']) {
      await q.query(`ALTER TABLE \`${table}\` DROP COLUMN \`sourceLang\``);
    }
    await q.query('DROP TABLE `translation_jobs`');
    await q.query('DROP TABLE `translations`');
  }
}
