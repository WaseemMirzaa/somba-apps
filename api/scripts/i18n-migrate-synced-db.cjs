#!/usr/bin/env node
/* Multilingual (EN/FR) data move for a database managed by `synchronize` (no migrations table).
 *
 * The migration 1792940000000-Translations does this for migration-managed databases. A database that the API keeps
 * in shape with `synchronize` has no such step, and `synchronize` would DROP products.nameFr / category, categories.nameFr
 * ... the moment the new code boots, losing the French names. Run this FIRST:
 *
 *   DB_DATABASE=somba node scripts/i18n-migrate-synced-db.cjs --dry-run     # what it would do
 *   DB_DATABASE=somba node scripts/i18n-migrate-synced-db.cjs               # do it
 *
 * What it does (idempotent: safe to run again, and after `synchronize` dropped the old columns it does nothing):
 *   1. creates `translations` / `translation_jobs` and the new columns (sourceLang, products.categoryId) if missing;
 *   2. copies products / categories / campaigns `nameFr` into `translations` author rows (not empty, different from the name);
 *   3. gives every product a categoryId (matching the old category name ignoring case; a name nobody has becomes a category);
 * and leaves the column drops to `synchronize`. Back the database up first.
 *
 * It REFUSES to run unless DB_DATABASE is given on the command line (the environment of this command), never from
 * api/.env: the target is always a deliberate choice. Host, user and password may come from api/.env.
 */
const path = require('path');

const target = process.env.DB_DATABASE; // read BEFORE .env is loaded
if (!target || !target.trim()) {
  console.error(
    'Refusing to run: name the database on the command line, e.g.\n' +
      '  DB_DATABASE=somba_dev node scripts/i18n-migrate-synced-db.cjs --dry-run\n' +
      '(DB_DATABASE is never taken from api/.env for this script.)',
  );
  process.exit(2);
}
require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); // fills host / user / password; never overrides
const mysql = require('mysql2/promise');

const dryRun = process.argv.includes('--dry-run');

// The data moves are shared with the migration (src/database/i18n-moves.ts): same code, same result.
function loadMoves() {
  try {
    require('ts-node').register({ transpileOnly: true });
    return require(path.join(__dirname, '..', 'src', 'database', 'i18n-moves.ts'));
  } catch (e) {
    return require(path.join(__dirname, '..', 'dist', 'database', 'i18n-moves.js'));
  }
}

const TABLES = ['products', 'categories', 'sellers', 'campaigns', 'flash_sales', 'cms_blocks', 'broadcasts'];

const DDL = [
  'CREATE TABLE IF NOT EXISTS `translations` (`id` varchar(36) NOT NULL, `entityType` varchar(24) NOT NULL, `entityId` varchar(36) NOT NULL, `field` varchar(32) NOT NULL, `locale` varchar(5) NOT NULL, `value` text NOT NULL, `origin` varchar(10) NOT NULL, `sourceLang` varchar(5) NULL, `sourceHash` varchar(40) NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_translations_hash` (`sourceHash`, `locale`), INDEX `IDX_translations_entity` (`entityType`, `entityId`), UNIQUE INDEX `IDX_translations_unique` (`entityType`, `entityId`, `field`, `locale`), PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
  "CREATE TABLE IF NOT EXISTS `translation_jobs` (`id` varchar(36) NOT NULL, `entityType` varchar(24) NOT NULL, `entityId` varchar(36) NOT NULL, `status` varchar(10) NOT NULL DEFAULT 'pending', `attempts` int NOT NULL DEFAULT '0', `nextAttemptAt` datetime NULL, `lastError` varchar(300) NULL, `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX `IDX_translation_jobs_due` (`status`, `nextAttemptAt`), UNIQUE INDEX `IDX_translation_jobs_unique` (`entityType`, `entityId`), PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci",
];

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    user: process.env.DB_USERNAME ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: target,
    charset: 'utf8mb4',
    timezone: 'Z',
  });
  const q = { query: async (sql, params) => (await conn.query(sql, params))[0] };
  const columns = async (table) =>
    new Set((await q.query('SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?', [target, table])).map((r) => r.c));
  const tables = new Set((await q.query('SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [target])).map((r) => r.t));
  try {
    console.log(`Database: ${process.env.DB_HOST ?? 'localhost'} / ${target}${dryRun ? '   (dry run: nothing is written)' : ''}`);
    for (const t of ['products', 'categories', 'campaigns']) {
      if (!tables.has(t)) throw new Error(`Table \`${t}\` not found: is ${target} a Somba database?`);
    }
    if (tables.has('migrations')) {
      const done = await q.query("SELECT 1 FROM `migrations` WHERE `name` LIKE 'Translations%' LIMIT 1");
      if (done.length) throw new Error('The Translations migration already ran here; there is nothing to do.');
    }
    const before = {};
    for (const t of ['products', 'categories', 'campaigns']) before[t] = (await columns(t));

    if (dryRun) {
      const count = async (sql) => Number((await q.query(sql))[0].n);
      const frProducts = before.products.has('nameFr') ? await count("SELECT COUNT(*) AS n FROM products WHERE nameFr IS NOT NULL AND TRIM(nameFr) <> '' AND BINARY TRIM(nameFr) <> BINARY name") : 0;
      const frCats = before.categories.has('nameFr') ? await count("SELECT COUNT(*) AS n FROM categories WHERE nameFr IS NOT NULL AND TRIM(nameFr) <> '' AND BINARY TRIM(nameFr) <> BINARY name") : 0;
      const frCamps = before.campaigns.has('nameFr') ? await count("SELECT COUNT(*) AS n FROM campaigns WHERE nameFr IS NOT NULL AND TRIM(nameFr) <> '' AND BINARY TRIM(nameFr) <> BINARY name") : 0;
      const noCat = before.products.has('category') ? await count("SELECT COUNT(*) AS n FROM products" + (before.products.has('categoryId') ? ' WHERE categoryId IS NULL' : '')) : 0;
      console.log(`Would copy ${frProducts} product, ${frCats} category and ${frCamps} campaign French names into translations.`);
      console.log(`Would link ${noCat} products to a category (creating categories for names nobody has).`);
      return;
    }

    for (const ddl of DDL) await q.query(ddl);
    for (const t of TABLES) {
      if (!tables.has(t)) continue;
      if (!(await columns(t)).has('sourceLang')) await q.query(`ALTER TABLE \`${t}\` ADD \`sourceLang\` varchar(5) NOT NULL DEFAULT 'en'`);
    }
    if (!before.products.has('categoryId')) await q.query('ALTER TABLE `products` ADD `categoryId` varchar(36) NULL');

    const moves = loadMoves();
    const out = {};
    if (before.categories.has('nameFr')) out.categoryNames = await moves.moveNameFr(q, 'categories', 'category');
    if (before.products.has('category')) out.categories = (await moves.moveCategories(q)).created;
    if (before.products.has('nameFr')) out.productNames = await moves.moveNameFr(q, 'products', 'product');
    if (before.campaigns.has('nameFr')) out.campaignNames = await moves.moveNameFr(q, 'campaigns', 'campaign');

    const count = async (sql) => Number((await q.query(sql))[0].n);
    console.log('\nCopied this run:', JSON.stringify(out));
    console.log('translations now :', JSON.stringify(await q.query("SELECT entityType, field, locale, origin, COUNT(*) AS n FROM translations GROUP BY 1,2,3,4")));
    console.log(`products         : ${await count('SELECT COUNT(*) AS n FROM products')}  (without a category: ${await count('SELECT COUNT(*) AS n FROM products WHERE categoryId IS NULL')})`);
    console.log('\nNext: start the API with DB_SYNCHRONIZE=true; it drops the old columns and creates the foreign key.');
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
