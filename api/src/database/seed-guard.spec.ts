import { SEED_OVERRIDE, seedRefusalForData, seedRefusalForEnvironment } from './seed-guard';

describe('the seed refuses to wipe a real server (S-01)', () => {
  it('refuses in production, naming the way round it', () => {
    const msg = seedRefusalForEnvironment({ NODE_ENV: 'production' });
    expect(msg).toMatch(/Refusing to run the seed/);
    expect(msg).toContain(SEED_OVERRIDE);
    expect(msg).toMatch(/bootstrap:prod/);
  });

  it('only the exact override value lifts it', () => {
    expect(seedRefusalForEnvironment({ NODE_ENV: 'production', [SEED_OVERRIDE]: '1' })).toBeNull();
    expect(seedRefusalForEnvironment({ NODE_ENV: 'production', [SEED_OVERRIDE]: 'true' })).not.toBeNull();
    expect(seedRefusalForEnvironment({ NODE_ENV: 'production', [SEED_OVERRIDE]: '0' })).not.toBeNull();
  });

  it('goes ahead in development, test, and with NODE_ENV unset (the data check covers that case)', () => {
    for (const NODE_ENV of ['development', 'test', undefined]) expect(seedRefusalForEnvironment({ NODE_ENV })).toBeNull();
  });

  it('refuses a database that holds accounts the seed did not make, whatever NODE_ENV says', () => {
    const live = { NODE_ENV: 'development', DB_TYPE: 'mysql' };
    expect(seedRefusalForData(0, live)).toBeNull();
    expect(seedRefusalForData(1, live)).toMatch(/holds 1 account the seed did not create/);
    expect(seedRefusalForData(12, {})).toMatch(/holds 12 accounts the seed did not create/);
    expect(seedRefusalForData(12, { ...live, [SEED_OVERRIDE]: '1' })).toBeNull();
  });

  it('a developer re-seeding a local SQLite file is not asked', () => {
    expect(seedRefusalForData(40, { NODE_ENV: 'development', DB_TYPE: 'sqlite' })).toBeNull();
    expect(seedRefusalForData(40, { NODE_ENV: 'test', DB_TYPE: 'sqlite' })).toBeNull();
    expect(seedRefusalForData(40, { NODE_ENV: 'production', DB_TYPE: 'sqlite' })).not.toBeNull();
    expect(seedRefusalForData(40, { DB_TYPE: 'sqlite' })).not.toBeNull();
  });
});
