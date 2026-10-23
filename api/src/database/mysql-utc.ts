import * as mysql2 from 'mysql2';

/**
 * Every DATETIME in MySQL is stored and read as UTC, whatever time zone the API
 * host or the MySQL server runs in (the same convention SQLite already uses, and
 * the one the "per day (UTC)" analytics rely on).
 *
 * Two settings are needed, because two different sides write timestamps:
 * - `timezone: 'Z'`: mysql2 sends JS Dates as UTC text and parses DATETIME
 *   values as UTC (its default, 'local', uses the Node process TZ).
 * - `SET time_zone = '+00:00'` on every new connection: `@CreateDateColumn` /
 *   `@UpdateDateColumn` are filled by MySQL itself (CURRENT_TIMESTAMP(6)), in the
 *   *session* time zone, which otherwise is the server's SYSTEM zone.
 * Without both, a host whose clock is not UTC stores local wall time, and a
 * Node/MySQL time-zone mismatch shifts every timestamp by the difference.
 */
export const UTC_SESSION_SQL = "SET time_zone = '+00:00'";

type Queryable = { query: (sql: string) => unknown };
type EventSource = { on: (event: 'connection', cb: (c: Queryable) => void) => unknown };

/** Runs {@link UTC_SESSION_SQL} on each connection a pool opens. */
export function pinSessionToUtc<T extends EventSource>(pool: T): T {
  // mysql2 emits 'connection' before handing the connection out, and a
  // connection runs its queries in order, so this always precedes app queries.
  pool.on('connection', (c) => {
    c.query(UTC_SESSION_SQL);
  });
  return pool;
}

/**
 * mysql2 with `createPool` wrapped so each new connection is pinned to UTC.
 * (TypeORM's `replication` mode uses a pool cluster, which mysql2 gives no
 * per-connection hook for; the API does not use replication.)
 */
export function utcMysqlDriver(base: typeof mysql2 = mysql2): typeof mysql2 {
  return {
    ...base,
    createPool: ((config: mysql2.PoolOptions) => pinSessionToUtc(base.createPool(config))) as typeof base.createPool,
  };
}

/** The TypeORM options that make a MySQL connection UTC end to end. */
export const MYSQL_UTC_OPTIONS = {
  timezone: 'Z',
  connectorPackage: 'mysql2',
  driver: utcMysqlDriver(),
} as const;
