import { Column, DataSource, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { serializeSqliteTransactions } from './sqlite-transactions';

@Entity('tx_probe_spec')
class Probe {
  @PrimaryGeneratedColumn() id!: number;
  @Column() label!: string;
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

async function sqlite(serialize: boolean): Promise<DataSource> {
  const ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: [Probe], synchronize: true });
  if (serialize) serializeSqliteTransactions(ds);
  await ds.initialize();
  return ds;
}

/** A transaction that really yields to the event loop between its writes, as a request doing I/O does. */
async function slowWrite(ds: DataSource, label: string, log: string[] = []): Promise<void> {
  await ds.transaction(async (m) => {
    log.push(`start ${label}`);
    await m.insert(Probe, { label });
    await tick();
    await m.update(Probe, { label }, { label: `${label}!` });
    await tick();
    log.push(`end ${label}`);
  });
}

describe('serializeSqliteTransactions', () => {
  let ds: DataSource;
  afterEach(async () => {
    if (ds?.isInitialized) await ds.destroy();
  });

  it('is the bug it fixes: overlapping transactions collide on the single SQLite connection', async () => {
    ds = await sqlite(false);
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => slowWrite(ds, `t${i}`)));
    expect(results.some((r) => r.status === 'rejected')).toBe(true);
  });

  it('runs overlapping transactions one after another, each completing', async () => {
    ds = await sqlite(true);
    const log: string[] = [];
    await Promise.all(Array.from({ length: 8 }, (_, i) => slowWrite(ds, `t${i}`, log)));
    // never two open at once, and in the order they arrived
    expect(log).toEqual(Array.from({ length: 8 }, (_, i) => [`start t${i}`, `end t${i}`]).flat());
    expect((await ds.getRepository(Probe).find({ order: { id: 'ASC' } })).map((p) => p.label)).toEqual(
      Array.from({ length: 8 }, (_, i) => `t${i}!`),
    );
  });

  it('lets a transaction decide a contended row exactly as a row lock would', async () => {
    ds = await sqlite(true);
    await ds.getRepository(Probe).insert({ label: 'stock:3' });
    const take = () =>
      ds.transaction(async (m) => {
        const row = await m.findOneByOrFail(Probe, { id: 1 });
        const left = Number(row.label.split(':')[1]);
        await tick();
        if (left < 1) throw new Error('sold out');
        await m.update(Probe, { id: 1 }, { label: `stock:${left - 1}` });
      });
    const results = await Promise.allSettled(Array.from({ length: 10 }, take));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter((r) => r.status === 'rejected').every((r) => (r as PromiseRejectedResult).reason.message === 'sold out')).toBe(true);
    expect((await ds.getRepository(Probe).findOneByOrFail({ id: 1 })).label).toBe('stock:0');
  });

  it("a failing transaction rolls back alone and does not stop the queue behind it", async () => {
    ds = await sqlite(true);
    const bad = ds.transaction(async (m) => {
      await m.insert(Probe, { label: 'bad' });
      await tick();
      throw new Error('boom');
    });
    const good = [slowWrite(ds, 'a'), slowWrite(ds, 'b')];
    await expect(bad).rejects.toThrow('boom');
    await Promise.all(good);
    expect((await ds.getRepository(Probe).find({ order: { id: 'ASC' } })).map((p) => p.label)).toEqual(['a!', 'b!']);
  });

  it('lets a transaction open another from inside itself (nested, no deadlock) and roll that one back alone', async () => {
    ds = await sqlite(true);
    await ds.transaction(async (m) => {
      await m.insert(Probe, { label: 'outer' });
      await ds.transaction(async (inner) => {
        await inner.insert(Probe, { label: 'via ds' });
      });
      await m.transaction(async (inner) => {
        await inner.insert(Probe, { label: 'via manager' });
      });
      await m
        .transaction(async (inner) => {
          await inner.insert(Probe, { label: 'undone' });
          throw new Error('inner failed');
        })
        .catch(() => undefined);
    });
    expect((await ds.getRepository(Probe).find({ order: { id: 'ASC' } })).map((p) => p.label)).toEqual(['outer', 'via ds', 'via manager']);
  });

  it('queues work started after a transaction finished behind the next one, not inside the finished one', async () => {
    ds = await sqlite(true);
    let later: Promise<void> = Promise.resolve();
    await ds.transaction(async (m) => {
      await m.insert(Probe, { label: 'first' });
      // started from inside the transaction but awaited by nobody: it runs after the transaction is over
      later = (async () => {
        await tick();
        await tick();
        await slowWrite(ds, 'later');
      })();
    });
    await Promise.all([later, slowWrite(ds, 'other')]);
    expect((await ds.getRepository(Probe).find()).map((p) => p.label).sort()).toEqual(['first', 'later!', 'other!']);
  });

  it('leaves other databases alone', () => {
    const transaction = jest.fn();
    const mysql = { options: { type: 'mysql' }, manager: { transaction } };
    expect(serializeSqliteTransactions(mysql as never)).toBe(mysql);
    expect(mysql.manager.transaction).toBe(transaction);
  });
});
