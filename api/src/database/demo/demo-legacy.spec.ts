import { DataSource } from 'typeorm';
import { ENTITIES, User } from '../entities';
import { UsersService } from '../../users/users.service';
import { renameLegacyDemoEmails } from './demo-legacy';
import { currentDemoEmail, isDemoEmail, DEMO_DOMAIN } from './demo-common';

/** A server seeded before the rename to KOMORIKO keeps one set of demo accounts: they move to the new domain. */
describe('legacy demo domain', () => {
  let ds: DataSource;
  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: ENTITIES,
      synchronize: true,
    });
    await ds.initialize();
  });
  afterEach(async () => ds.destroy());

  const make = (email: string) =>
    ds.getRepository(User).save(
      ds.getRepository(User).create({
        email,
        emailHash: UsersService.emailHash(email),
        passwordHash: 'x',
        name: email,
        role: 'customer',
      }),
    );

  it('recognises both domains and maps a legacy address to the current one', () => {
    expect(DEMO_DOMAIN).toBe('demo.komoriko.test');
    expect(isDemoEmail('a@demo.komoriko.test')).toBe(true);
    expect(isDemoEmail('A@Demo.Sombateka.Test')).toBe(true);
    expect(isDemoEmail('a@company.com')).toBe(false);
    expect(currentDemoEmail('seller.a@demo.sombateka.test')).toBe('seller.a@demo.komoriko.test');
    expect(currentDemoEmail('boss@company.com')).toBe('boss@company.com');
  });

  it('renames legacy users (email and its hash), keeps the local part and leaves real users alone', async () => {
    const old = await make('seller.a@demo.sombateka.test');
    const cur = await make('customer.full@demo.komoriko.test');
    const real = await make('boss@company.com');
    const res = await renameLegacyDemoEmails(ds);
    expect(res.renamed).toBe(1);
    const repo = ds.getRepository(User);
    const moved = await repo.findOneOrFail({ where: { id: old.id } });
    expect(moved.email).toBe('seller.a@demo.komoriko.test');
    expect(moved.emailHash).toBe(UsersService.emailHash('seller.a@demo.komoriko.test'));
    expect((await repo.findOneOrFail({ where: { id: cur.id } })).email).toBe('customer.full@demo.komoriko.test');
    expect((await repo.findOneOrFail({ where: { id: real.id } })).email).toBe('boss@company.com');
    expect(await repo.count()).toBe(3);
    // A second run has nothing left to do.
    expect((await renameLegacyDemoEmails(ds)).renamed).toBe(0);
  });

  it('does not rename into an address that already exists', async () => {
    await make('rider@demo.sombateka.test');
    await make('rider@demo.komoriko.test');
    const res = await renameLegacyDemoEmails(ds);
    expect(res.renamed).toBe(0);
    expect(res.skipped).toEqual(['rider@demo.sombateka.test']);
  });
});
