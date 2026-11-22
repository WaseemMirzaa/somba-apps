import { MigrationInterface, QueryRunner } from 'typeorm';
import { sourceHash } from '../../translation/translatable';

/**
 * Order references move from `SOM-…` to `KOM-…`.
 *
 * Up rewrites every STORED reference, in two passes:
 *  1. Columns that hold a reference and nothing else (`orders.reference` and the copied `orderReference` columns): the 4-character prefix
 *     only, in batches of ids so a large table never holds one long lock.
 *  2. Text that embeds a reference (notices and their authored translations, wallet history, refund memos, audit log, task failure
 *     reasons, warehouse exception notes, fraud alert reasons): each `SOM-` that starts a reference (at the start of the text or after a
 *     non-word character, and followed by an id character) becomes `KOM-`. Words that merely contain "som-" and `SOMBA10` are untouched.
 *     Done in the application in keyset batches, so the rule is the same on MySQL and SQLite.
 * Text typed by people (chat, support tickets, dispute messages) is NOT rewritten: it is their words, and an old `SOM-…` in it still
 * resolves, because every search and scan maps `SOM-` to `KOM-` (`common/order-ref.ts`).
 *
 * Idempotent: a row that has no `SOM-` left matches nothing, so a second run changes nothing. A table or column that does not exist is skipped.
 *
 * Down (documented choice): the opposite rewrite, `KOM-` -> `SOM-`, over the same columns. It cannot tell a reference this migration renamed
 * from one created later under the new scheme, so it turns ALL `KOM-` references in these columns back to `SOM-`. That is the whole point of
 * a rollback to code that only knows `SOM-`, and unique references stay unique because the prefix change is one-to-one.
 */
const BATCH = 1000;

/** Columns that hold only a reference. */
const PREFIX_COLUMNS: [table: string, column: string][] = [
  ['orders', 'reference'],
  ['payments', 'orderReference'],
  ['payment_refunds', 'orderReference'],
  ['delivery_tasks', 'orderReference'],
  ['disputes', 'orderReference'],
  ['exchanges', 'orderReference'],
  ['replacements', 'orderReference'],
  ['warehouse_exceptions', 'orderReference'],
  ['payout_statement_lines', 'orderReference'],
];

/** Free-text columns that can embed references. */
const TEXT_COLUMNS: [table: string, column: string][] = [
  ['notifications', 'title'],
  ['notifications', 'body'],
  ['wallet_transactions', 'description'],
  ['payment_refunds', 'memo'],
  ['audit_logs', 'detail'],
  ['audit_logs', 'detailFr'],
  ['delivery_tasks', 'failureReason'],
  ['warehouse_exceptions', 'notes'],
  ['warehouse_exceptions', 'resolution'],
  ['fraud_alerts', 'reason'],
  ['fraud_alerts', 'reasonFr'],
];

type Dir = 'up' | 'down';
const FROM: Record<Dir, string> = { up: 'SOM-', down: 'KOM-' };
const TO: Record<Dir, string> = { up: 'KOM-', down: 'SOM-' };

/** `PREFIX` followed by an id character, at the start of the text or after a non-word character. */
const embedded = (dir: Dir) => new RegExp(`(^|[^A-Za-z0-9])${FROM[dir]}(?=[0-9A-Za-z])`, 'g');

const isSqlite = (q: QueryRunner) => /sqlite|sql\.js/i.test(String(q.connection.options.type));
const quote = (q: QueryRunner, name: string) => (isSqlite(q) ? `"${name}"` : `\`${name}\``);
const concat = (q: QueryRunner, prefix: string, rest: string) => (isSqlite(q) ? `'${prefix}' || SUBSTR(${rest}, 5)` : `CONCAT('${prefix}', SUBSTRING(${rest}, 5))`);

async function usable(q: QueryRunner, table: string, column: string): Promise<boolean> {
  return (await q.hasTable(table)) && (await q.hasColumn(table, column));
}

const marks = (n: number) => Array.from({ length: n }, () => '?').join(',');

/** Pass 1: a column that is only a reference. Batches of ids; rows already converted no longer match, so the loop ends. */
async function renamePrefix(q: QueryRunner, table: string, column: string, dir: Dir): Promise<void> {
  if (!(await usable(q, table, column))) return;
  const t = quote(q, table);
  const c = quote(q, column);
  // Case-sensitive on both databases: GLOB on SQLite, BINARY on MySQL (the default MySQL collation would also match "som-").
  const match = isSqlite(q) ? `${c} GLOB '${FROM[dir]}*'` : `${c} LIKE BINARY '${FROM[dir]}%'`;
  for (;;) {
    const ids: { id: string }[] = await q.query(`SELECT ${quote(q, 'id')} AS id FROM ${t} WHERE ${match} LIMIT ${BATCH}`);
    if (!ids.length) return;
    await q.query(`UPDATE ${t} SET ${c} = ${concat(q, TO[dir], c)} WHERE ${quote(q, 'id')} IN (${marks(ids.length)})`, ids.map((r) => r.id));
  }
}

/** Pass 2: embedded references, keyset-paged by id; only rows whose text really changes are written. Returns the ids it changed. */
async function renameEmbedded(q: QueryRunner, table: string, column: string, dir: Dir, where = ''): Promise<{ id: string; value: string }[]> {
  const changed: { id: string; value: string }[] = [];
  if (!(await usable(q, table, column))) return changed;
  const t = quote(q, table);
  const c = quote(q, column);
  const id = quote(q, 'id');
  const re = embedded(dir);
  let after = '';
  for (;;) {
    const rows: { id: string; value: string }[] = await q.query(
      `SELECT ${id} AS id, ${c} AS value FROM ${t} WHERE ${id} > ? AND ${c} LIKE ?${where} ORDER BY ${id} LIMIT ${BATCH}`,
      [after, `%${FROM[dir]}%`],
    );
    if (!rows.length) return changed;
    after = rows[rows.length - 1].id;
    for (const r of rows) {
      const next = String(r.value).replace(re, `$1${TO[dir]}`);
      if (next === r.value) continue;
      await q.query(`UPDATE ${t} SET ${c} = ? WHERE ${id} = ?`, [next, r.id]);
      changed.push({ id: r.id, value: next });
    }
  }
}

/** Authored / machine translations of notices (`translations` rows of entityType 'notification') carry the same references. */
async function renameNoticeTranslations(q: QueryRunner, dir: Dir): Promise<void> {
  if (!(await q.hasTable('translations'))) return;
  const t = quote(q, 'translations');
  const re = embedded(dir);
  let after = '';
  for (;;) {
    const rows: { id: string; entityId: string; field: string; value: string; origin: string; sourceLang: string | null; sourceHash: string | null }[] = await q.query(
      `SELECT ${quote(q, 'id')} AS id, ${quote(q, 'entityId')} AS entityId, ${quote(q, 'field')} AS field, ${quote(q, 'value')} AS value, ${quote(q, 'origin')} AS origin, ${quote(q, 'sourceLang')} AS sourceLang, ${quote(q, 'sourceHash')} AS sourceHash FROM ${t} WHERE ${quote(q, 'entityType')} = 'notification' AND ${quote(q, 'id')} > ? AND ${quote(q, 'value')} LIKE ? ORDER BY ${quote(q, 'id')} LIMIT ${BATCH}`,
      [after, `%${FROM[dir]}%`],
    );
    if (!rows.length) return;
    after = rows[rows.length - 1].id;
    for (const r of rows) {
      const next = r.value.replace(re, `$1${TO[dir]}`);
      if (next === r.value) continue;
      let hash = r.sourceHash;
      if (hash && r.origin === 'machine' && (r.field === 'title' || r.field === 'body') && (await usable(q, 'notifications', r.field))) {
        // A machine row remembers a hash of the English text it came from; the notice text changed, so the hash follows it (else the row reads as stale).
        const src: { v: string }[] = await q.query(`SELECT ${quote(q, r.field)} AS v FROM ${quote(q, 'notifications')} WHERE ${quote(q, 'id')} = ?`, [r.entityId]);
        if (src[0]?.v) hash = sourceHash(r.sourceLang ?? 'en', src[0].v);
      }
      await q.query(`UPDATE ${t} SET ${quote(q, 'value')} = ?, ${quote(q, 'sourceHash')} = ? WHERE ${quote(q, 'id')} = ?`, [next, hash, r.id]);
    }
  }
}

async function rewrite(q: QueryRunner, dir: Dir): Promise<void> {
  for (const [table, column] of PREFIX_COLUMNS) await renamePrefix(q, table, column, dir);
  for (const [table, column] of TEXT_COLUMNS) await renameEmbedded(q, table, column, dir);
  await renameNoticeTranslations(q, dir);
}

export class OrderRefsKom1793570000001 implements MigrationInterface {
  name = 'OrderRefsKom1793570000001';

  public async up(q: QueryRunner): Promise<void> {
    await rewrite(q, 'up');
  }

  public async down(q: QueryRunner): Promise<void> {
    await rewrite(q, 'down');
  }
}
