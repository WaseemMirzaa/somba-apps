import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Refresh-token rotation with reuse detection (audit A-09).
 *
 * `refresh_tokens`: one row per refresh token handed out from now on, keyed by the token's `jti` (the token itself is
 * never stored). Tokens issued before this change carry no `jti`, have no row, and keep working until they expire, so
 * nobody is signed out by the deploy.
 *
 * Nothing existing is changed. Written with the QueryRunner table API (no raw MySQL), so it runs on MySQL in production
 * and on SQLite in tests. Reversible.
 */
export class RefreshTokenRotation1793420000001 implements MigrationInterface {
  name = 'RefreshTokenRotation1793420000001';

  public async up(q: QueryRunner): Promise<void> {
    if (await q.hasTable('refresh_tokens')) return;
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    await q.createTable(
      new Table({
        name: 'refresh_tokens',
        columns: [
          { name: 'id', type: 'varchar', length: '36', isPrimary: true },
          { name: 'userId', type: 'varchar', length: '36', isNullable: false },
          { name: 'familyId', type: 'varchar', length: '36', isNullable: false },
          { name: 'expiresAt', type: 'datetime', isNullable: false },
          { name: 'usedAt', type: 'datetime', isNullable: true },
          { name: 'replacedById', type: 'varchar', length: '36', isNullable: true },
          { name: 'revokedAt', type: 'datetime', isNullable: true },
          sqlite
            ? { name: 'createdAt', type: 'datetime', isNullable: false, default: "datetime('now')" }
            : { name: 'createdAt', type: 'datetime', precision: 6, isNullable: false, default: 'CURRENT_TIMESTAMP(6)' },
        ],
      }),
      true,
    );
    await q.createIndex('refresh_tokens', new TableIndex({ name: 'IDX_refresh_tokens_user', columnNames: ['userId'] }));
    await q.createIndex('refresh_tokens', new TableIndex({ name: 'IDX_refresh_tokens_family', columnNames: ['familyId'] }));
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.dropTable('refresh_tokens', true, true, true);
  }
}
