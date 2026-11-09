import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Forced password change for admin-made accounts (audit AD-02).
 *
 * `users.mustChangePassword` is set while an account still has the temporary password an administrator generated for it;
 * the server then refuses everything except changing the password (see `auth/password-change.ts`).
 *
 * Every EXISTING row gets 0 (false): nobody is locked out by the deploy, including staff who are working today with a
 * temporary password. Only accounts created or re-issued after this release are flagged. Written with the QueryRunner
 * column API, so it runs on MySQL (production) and SQLite (tests). Reversible.
 */
export class ForcedPasswordChange1793410000001 implements MigrationInterface {
  name = 'ForcedPasswordChange1793410000001';

  public async up(q: QueryRunner): Promise<void> {
    const sqlite = q.connection.options.type === 'better-sqlite3' || q.connection.options.type === 'sqlite';
    if (!(await q.hasColumn('users', 'mustChangePassword'))) {
      await q.addColumn('users', new TableColumn({ name: 'mustChangePassword', type: 'boolean', isNullable: false, default: sqlite ? 0 : false }));
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    if (await q.hasColumn('users', 'mustChangePassword')) await q.dropColumn('users', 'mustChangePassword');
  }
}
