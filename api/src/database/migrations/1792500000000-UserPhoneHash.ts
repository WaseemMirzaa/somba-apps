import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lookup hash for phone-code login (phone numbers themselves are encrypted). Existing rows are filled by
 * UsersService.onModuleInit on the next start. Fully reversible.
 */
export class UserPhoneHash1792500000000 implements MigrationInterface {
  name = 'UserPhoneHash1792500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE \`users\` ADD \`phoneHash\` varchar(64) NULL`);
    await q.query(`CREATE INDEX \`IDX_a78fbf9a44244abda9841b8dc2\` ON \`users\` (\`phoneHash\`)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX \`IDX_a78fbf9a44244abda9841b8dc2\` ON \`users\``);
    await q.query(`ALTER TABLE \`users\` DROP COLUMN \`phoneHash\``);
  }
}
