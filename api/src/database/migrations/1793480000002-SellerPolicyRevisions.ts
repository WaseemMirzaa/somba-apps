import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Store policies need admin approval (docs/contracts/admin-controls.md).
 *
 * Up:
 *  - creates `seller_policy_revisions`: one row per proposed returns / shipping policy (`pending` until an admin approves or
 *    rejects it), with who proposed it, who decided, the admin's note and the times;
 *  - grandfathers the policies that are already live: one `approved` revision per store that has a returns or a shipping policy
 *    (decidedBy `system`, decidedAt now), holding the live text as it is stored, so every live policy has an approved
 *    revision behind it and nothing a seller wrote before today is hidden or re-queued.
 *
 * Written with the QueryRunner API, so it runs on MySQL in production and on SQLite in tests; each step checks what exists
 * first, so a second run changes nothing. Down drops the table (the proposals and the approval history cannot be restored; the
 * live policy text on the stores is untouched).
 */
export class SellerPolicyRevisions1793480000002 implements MigrationInterface {
  name = 'SellerPolicyRevisions1793480000002';

  public async up(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    const created = sqlite
      ? { name: 'createdAt', type: 'datetime', isNullable: false, default: "datetime('now')" }
      : { name: 'createdAt', type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' };

    if (!(await q.hasTable('seller_policy_revisions'))) {
      await q.createTable(
        new Table({
          name: 'seller_policy_revisions',
          columns: [
            { name: 'id', type: 'varchar', length: '36', isPrimary: true },
            { name: 'sellerId', type: 'varchar', length: '36', isNullable: false },
            { name: 'returnsPolicy', type: 'text', isNullable: true },
            { name: 'shippingPolicy', type: 'text', isNullable: true },
            { name: 'returnsPolicyFr', type: 'text', isNullable: true },
            { name: 'shippingPolicyFr', type: 'text', isNullable: true },
            { name: 'status', type: 'varchar', length: '12', isNullable: false, default: "'pending'" },
            { name: 'note', type: 'text', isNullable: true },
            { name: 'proposedBy', type: 'varchar', length: '36', isNullable: true },
            { name: 'decidedBy', type: 'varchar', length: '36', isNullable: true },
            { name: 'decidedAt', type: 'datetime', isNullable: true },
            created,
          ],
        }),
        true,
      );
      await q.createIndex('seller_policy_revisions', new TableIndex({ name: 'IDX_policy_revisions_seller', columnNames: ['sellerId', 'createdAt'] }));
      await q.createIndex('seller_policy_revisions', new TableIndex({ name: 'IDX_policy_revisions_status', columnNames: ['status', 'createdAt'] }));
    }
    await this.grandfather(q);
  }

  /** One approved revision for each store with a live policy and no revision yet. */
  private async grandfather(q: QueryRunner): Promise<void> {
    if (!(await q.hasTable('sellers'))) return;
    const e = (n: string) => q.connection.driver.escape(n);
    const stores = (await q.query(
      `SELECT s.${e('id')} AS id, s.${e('returnsPolicy')} AS returnsPolicy, s.${e('shippingPolicy')} AS shippingPolicy FROM ${e('sellers')} s
         WHERE (s.${e('returnsPolicy')} IS NOT NULL AND s.${e('returnsPolicy')} <> '') OR (s.${e('shippingPolicy')} IS NOT NULL AND s.${e('shippingPolicy')} <> '')`,
    )) as { id: string; returnsPolicy: string | null; shippingPolicy: string | null }[];
    if (!stores.length) return;
    const done = new Set<string>(((await q.query(`SELECT DISTINCT ${e('sellerId')} AS sellerId FROM ${e('seller_policy_revisions')}`)) as { sellerId: string }[]).map((r) => r.sellerId));
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    for (const s of stores) {
      if (done.has(s.id)) continue;
      const id = (await q.query(uuid(sqlite)))[0].id as string;
      await q.query(
        `INSERT INTO ${e('seller_policy_revisions')} (${e('id')}, ${e('sellerId')}, ${e('returnsPolicy')}, ${e('shippingPolicy')}, ${e('status')}, ${e('decidedBy')}, ${e('decidedAt')}) VALUES (?, ?, ?, ?, 'approved', 'system', ${sqlite ? "datetime('now')" : 'CURRENT_TIMESTAMP'})`,
        [id, s.id, s.returnsPolicy || null, s.shippingPolicy || null],
      );
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasTable('seller_policy_revisions')) await q.dropTable('seller_policy_revisions', true, true, true);
  }
}

/** A uuid made by the database itself (MySQL has UUID(); SQLite builds one from random bytes). */
function uuid(sqlite: boolean): string {
  return sqlite
    ? `SELECT lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))) AS id`
    : 'SELECT UUID() AS id';
}
