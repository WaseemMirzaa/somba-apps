import { createHash, randomUUID } from 'crypto';
import type { QueryRunner } from 'typeorm';

// Data moves of the multilingual migration (1792940000000-Translations). Kept out of the migration file because
// TypeORM treats every export of a migration file as a migration class.

/** sha1(sourceLang + "\n" + text), computed here (not by the database: not every MySQL build has SHA1). */
const hash = (lang: string, text: string) => createHash('sha1').update(`${lang}\n${text}`).digest('hex');

const insertAuthors = async (q: Pick<QueryRunner, 'query'>, rows: { type: string; id: string; fr: string; source: string }[]) => {
  for (let i = 0; i < rows.length; i += 200) {
    const part = rows.slice(i, i + 200);
    const values = part.map(() => "(?, ?, ?, 'name', 'fr', ?, 'author', 'en', ?)").join(', ');
    await q.query(
      `INSERT INTO \`translations\` (\`id\`, \`entityType\`, \`entityId\`, \`field\`, \`locale\`, \`value\`, \`origin\`, \`sourceLang\`, \`sourceHash\`) VALUES ${values}`,
      part.flatMap((r) => [randomUUID(), r.type, r.id, r.fr, hash('en', r.source)]),
    );
  }
};

/**
 * The French name of products / categories / campaigns becomes an author row, when it is not empty and differs
 * (exactly, accents and case included) from the name. Rows that already have one are left alone.
 */
export async function moveNameFr(q: Pick<QueryRunner, 'query'>, table: 'products' | 'categories' | 'campaigns', type: 'product' | 'category' | 'campaign'): Promise<number> {
  const have = new Set<string>((await q.query("SELECT `entityId` FROM `translations` WHERE `entityType` = ? AND `field` = 'name' AND `locale` = 'fr'", [type])).map((r: { entityId: string }) => r.entityId));
  const rows: { id: string; name: string; nameFr: string }[] = await q.query(`SELECT \`id\`, \`name\`, \`nameFr\` FROM \`${table}\` WHERE \`nameFr\` IS NOT NULL`);
  const todo = rows
    .filter((r) => r.nameFr != null && !have.has(r.id) && String(r.nameFr).trim() !== '' && String(r.nameFr).trim() !== r.name)
    .map((r) => ({ type, id: r.id, fr: String(r.nameFr).trim(), source: r.name }));
  await insertAuthors(q, todo);
  return todo.length;
}

const key = (s: unknown) => String(s ?? '').trim().toLowerCase();

/**
 * Every product gets the id of its category. A product's old category NAME is matched, ignoring case and spaces,
 * to a category's English name and then its French one; a name nobody has becomes a new category (its French name,
 * if some product carried one, an author row), and a blank name becomes "Other". Done row by row in code, not in
 * SQL, because the database collation would fold accents ("Mode" = "Modé") and merge distinct names.
 */
export async function moveCategories(q: Pick<QueryRunner, 'query'>): Promise<{ created: string[] }> {
  const cats: { id: string; name: string; nameFr: string | null }[] = await q.query('SELECT `id`, `name`, `nameFr` FROM `categories`');
  const byName = new Map<string, string>();
  const byFr = new Map<string, string>();
  for (const c of cats) {
    if (!byName.has(key(c.name))) byName.set(key(c.name), c.id);
    if (c.nameFr && !byFr.has(key(c.nameFr))) byFr.set(key(c.nameFr), c.id);
  }
  const products: { id: string; category: string; categoryFr: string | null }[] = await q.query('SELECT `id`, `category`, `categoryFr` FROM `products` WHERE `categoryId` IS NULL');
  const [{ top }] = await q.query('SELECT COALESCE(MAX(`sortOrder`), -1) AS top FROM `categories`');
  let order = Number(top);
  const created: string[] = [];
  const idsOf = new Map<string, string[]>(); // category id -> product ids
  for (const p of products) {
    const k = key(p.category) || 'other';
    let id = byName.get(k) ?? byFr.get(k);
    if (!id) {
      id = randomUUID();
      const name = key(p.category) ? String(p.category).trim().slice(0, 100) : 'Other';
      await q.query("INSERT INTO `categories` (`id`, `name`, `sortOrder`, `sourceLang`) VALUES (?, ?, ?, 'en')", [id, name, ++order]);
      const fr = String(p.categoryFr ?? '').trim();
      if (fr && fr !== name) await insertAuthors(q, [{ type: 'category', id, fr, source: name }]);
      byName.set(k, id);
      created.push(name);
    }
    idsOf.set(id, [...(idsOf.get(id) ?? []), p.id]);
  }
  for (const [categoryId, ids] of idsOf) {
    for (let i = 0; i < ids.length; i += 500) {
      const part = ids.slice(i, i + 500);
      await q.query(`UPDATE \`products\` SET \`categoryId\` = ? WHERE \`id\` IN (${part.map(() => '?').join(',')})`, [categoryId, ...part]);
    }
  }
  return { created };
}
