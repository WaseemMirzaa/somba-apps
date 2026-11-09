/**
 * Hard stop for `npm run seed` (audit S-01). The seed WIPES every table and creates demo accounts that share one public
 * password, so on a real server it would delete the business and leave an admin anyone can sign in as. It therefore refuses
 * unless the person running it says, in the environment, that this really is a throw-away database.
 */
export const SEED_OVERRIDE = 'I_UNDERSTAND_THIS_WIPES_EVERYTHING';

const override = (env: NodeJS.ProcessEnv) => env[SEED_OVERRIDE] === '1';

const HOW = `To seed a throw-away database anyway, set ${SEED_OVERRIDE}=1 for this one command. On a real server never run the seed: use "npm run bootstrap:prod" (production-safe) instead.`;

/** Checked before anything is opened: production is never a place for demo data. Null means go ahead. */
export function seedRefusalForEnvironment(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.NODE_ENV === 'production' && !override(env)) {
    return `Refusing to run the seed: NODE_ENV is "production" and the seed wipes every table and creates demo accounts with a public password. ${HOW}`;
  }
  return null;
}

/**
 * Checked once the database is open: accounts that are not the seed's own mean this is a real database, whatever NODE_ENV says
 * (a missing or misspelled NODE_ENV must not turn a live server into a demo box), except a local SQLite dev file. Null means go ahead.
 */
export function seedRefusalForData(otherAccounts: number, env: NodeJS.ProcessEnv = process.env): string | null {
  // A developer's own local SQLite file collects accounts from the smoke tests and is re-seeded to reset it: no questions there.
  const localDev = env.DB_TYPE === 'sqlite' && (env.NODE_ENV === 'development' || env.NODE_ENV === 'test');
  if (otherAccounts > 0 && !localDev && !override(env)) {
    return `Refusing to run the seed: this database already holds ${otherAccounts} account${otherAccounts === 1 ? '' : 's'} the seed did not create, so it looks like real data, and the seed would delete it. ${HOW}`;
  }
  return null;
}
