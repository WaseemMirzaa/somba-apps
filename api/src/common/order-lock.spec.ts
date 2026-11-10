import { DataSource } from 'typeorm';
import { ENTITIES } from '../database/entities';
import { withOrderLock } from './order-lock';

describe('withOrderLock', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
  });
  afterEach(async () => ds.destroy());

  const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

  it('runs work for the same order one after the other, in the order it arrived', async () => {
    const log: string[] = [];
    const job = (name: string, ms: number) =>
      withOrderLock(ds.manager, 'o1', async () => {
        log.push(`${name}:start`);
        await tick(ms);
        log.push(`${name}:end`);
        return name;
      });
    expect(await Promise.all([job('a', 20), job('b', 1), job('c', 1)])).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
  });

  it('a job that fails does not block the next one, and its error reaches its own caller', async () => {
    const failing = withOrderLock(ds.manager, 'o2', async () => {
      throw new Error('boom');
    });
    const next = withOrderLock(ds.manager, 'o2', async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });

  it('hands the work a transaction: what it writes is rolled back when it fails', async () => {
    await withOrderLock(ds.manager, 'o3', async (m) => {
      expect(m.queryRunner?.isTransactionActive).toBe(true);
    });
    await expect(
      withOrderLock(ds.manager, 'o3', async (m) => {
        await m.query("INSERT INTO hubs (id, name, city, country, active, createdAt, updatedAt) VALUES ('x','X','C','K',1,datetime('now'),datetime('now'))").catch(() => undefined);
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect(await ds.query("SELECT COUNT(*) AS n FROM hubs WHERE id = 'x'")).toEqual([{ n: 0 }]);
  });
});
