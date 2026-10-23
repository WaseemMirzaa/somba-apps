// A host clock that is not UTC (Kinshasa is +01:00, Karachi +05:00): the
// stored values must not depend on it. Node applies a TZ change immediately.
process.env.TZ = 'Asia/Karachi';

import 'dotenv/config';
import { EventEmitter } from 'events';
import { Column, CreateDateColumn, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { MYSQL_UTC_OPTIONS, UTC_SESSION_SQL, pinSessionToUtc, utcMysqlDriver } from './mysql-utc';

describe('MySQL UTC pinning', () => {
  it('runs SET time_zone on every new pool connection', () => {
    const pool = new EventEmitter();
    pinSessionToUtc(pool as never);
    const conn = { query: jest.fn() };
    pool.emit('connection', conn);
    expect(conn.query).toHaveBeenCalledWith(UTC_SESSION_SQL);
    expect(UTC_SESSION_SQL).toBe("SET time_zone = '+00:00'");
  });

  it('wraps createPool of the driver TypeORM loads', () => {
    const pool = new EventEmitter();
    const base = { createPool: jest.fn(() => pool), format: jest.fn() };
    const driver = utcMysqlDriver(base as never);
    expect(driver.createPool({} as never)).toBe(pool);
    expect(pool.listenerCount('connection')).toBe(1);
    expect(driver.format).toBe(base.format);
  });

  it('tells mysql2 to read and write DATETIME as UTC', () => {
    expect(MYSQL_UTC_OPTIONS.timezone).toBe('Z');
    expect(MYSQL_UTC_OPTIONS.connectorPackage).toBe('mysql2');
  });
});

@Entity('tz_probe_spec')
class TzProbe {
  @PrimaryGeneratedColumn() id!: number;
  @CreateDateColumn() createdAt!: Date;
  @Column({ type: 'datetime' }) at!: Date;
}

/** Real round trip; runs when the env points at MySQL (api/.env locally). */
const withMysql = process.env.DB_TYPE === 'mysql' ? describe : describe.skip;

withMysql('MySQL UTC round trip (live database)', () => {
  let ds: DataSource;

  beforeAll(async () => {
    ds = await new DataSource({
      type: 'mysql',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '3306', 10),
      username: process.env.DB_USERNAME ?? 'root',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_DATABASE ?? 'somba',
      entities: [TzProbe],
      synchronize: false,
      poolSize: 1, // one connection, so the TEMPORARY table is visible to every query
      ...MYSQL_UTC_OPTIONS,
    }).initialize();
    await ds.query(
      `CREATE TEMPORARY TABLE tz_probe_spec (id int AUTO_INCREMENT PRIMARY KEY,
       createdAt datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), at datetime NOT NULL)`,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('pins the session time zone', async () => {
    const [row] = await ds.query('SELECT @@session.time_zone AS tz');
    expect(row.tz).toBe('+00:00');
  });

  it('stores UTC wall time for JS Dates and DB defaults, and reads the same instant back', async () => {
    const at = new Date('2026-10-22T13:38:02.000Z'); // 18:38 in Karachi
    const before = Date.now();
    const saved = await ds.getRepository(TzProbe).save({ at });
    const after = Date.now();

    const [raw] = await ds.query(
      'SELECT CAST(at AS CHAR) AS at, CAST(createdAt AS CHAR) AS createdAt FROM tz_probe_spec WHERE id = ?',
      [saved.id],
    );
    expect(raw.at).toBe('2026-10-22 13:38:02');
    const createdUtc = Date.parse(`${raw.createdAt.replace(' ', 'T')}Z`);
    expect(createdUtc).toBeGreaterThanOrEqual(before - 1000);
    expect(createdUtc).toBeLessThanOrEqual(after + 1000);

    const back = await ds.getRepository(TzProbe).findOneByOrFail({ id: saved.id });
    expect(back.at.toISOString()).toBe('2026-10-22T13:38:02.000Z');
    expect(back.createdAt.getTime()).toBe(createdUtc);
  });
});
