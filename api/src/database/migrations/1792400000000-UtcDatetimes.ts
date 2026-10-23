import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * MySQL DATETIME columns move from "MySQL server's SYSTEM time zone" to UTC
 * (see `mysql-utc.ts`). Before this, the connection used the default session
 * zone, so rows hold the server's local wall time; this rewrites every
 * DATETIME value in the schema from SYSTEM to UTC. On a server whose zone is
 * already UTC it changes nothing. SQLite already stores UTC: no-op there.
 * Reversible (`down` converts back to SYSTEM).
 */
export class UtcDatetimes1792400000000 implements MigrationInterface {
  name = 'UtcDatetimes1792400000000';

  public async up(q: QueryRunner): Promise<void> {
    await convert(q, "'SYSTEM'", "'+00:00'");
  }

  public async down(q: QueryRunner): Promise<void> {
    await convert(q, "'+00:00'", "'SYSTEM'");
  }
}

async function convert(q: QueryRunner, from: string, to: string): Promise<void> {
  if (q.connection.options.type !== 'mysql') return;
  const cols: { t: string; c: string }[] = await q.query(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND DATA_TYPE = 'datetime' AND TABLE_NAME <> 'migrations'`,
  );
  const byTable = new Map<string, string[]>();
  for (const { t, c } of cols) byTable.set(t, [...(byTable.get(t) ?? []), c]);
  for (const [table, columns] of byTable) {
    // One UPDATE per table, assigning every DATETIME column (`updatedAt`
    // included), so its `ON UPDATE CURRENT_TIMESTAMP` does not overwrite it.
    const set = columns.map((c) => `\`${c}\` = CONVERT_TZ(\`${c}\`, ${from}, ${to})`).join(', ');
    await q.query(`UPDATE \`${table}\` SET ${set}`);
  }
}
