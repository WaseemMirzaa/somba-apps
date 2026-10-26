import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { User } from '../database/entities';
import { testDb } from '../testing/test-db';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { MAX_2FA_FAILURES, TwoFaService } from './twofa.service';
import { base32Decode, hashRecovery, hotp, totpCode, totpStep } from './totp';
import * as bcrypt from 'bcryptjs';

let ds: DataSource;
let users: UsersService;
let svc: TwoFaService;
let auth: AuthService;
let notices: { to: string; title: string; type: string }[];

const config = { get: (k: string) => (k === 'jwt.secret' ? 'access-secret' : k === 'jwt.refreshSecret' ? 'refresh-secret' : '15m') };
const nextStepCode = (secret: string, steps = 1) => hotp(base32Decode(secret), totpStep() + steps);

async function account(name = 'amina', role: User['role'] = 'customer', password = 'Password-123') {
  return users.create({ email: `${name}@x.test`, passwordHash: await bcrypt.hash(password, 4), name, role });
}
/** Enrol and confirm: returns the secret and the recovery codes. */
async function enrol(u: User) {
  const { secret } = await svc.setup(u.id);
  const out = await svc.enable(u.id, totpCode(secret));
  return { secret, recovery: out.recoveryCodes };
}

beforeEach(async () => {
  ds = await testDb();
  users = new UsersService(ds.getRepository(User));
  notices = [];
  const jwt = new JwtService({});
  svc = new TwoFaService(users, jwt, config as never, { toUser: async (to: string, n: { title: string; type: string }) => void notices.push({ to, ...n }) } as never);
  auth = new AuthService(users, jwt, config as never, svc);
});
afterEach(() => ds.destroy());

describe('TwoFaService: setup and enable', () => {
  it('setup stores an encrypted pending secret and returns the authenticator link; nothing is enforced yet', async () => {
    const u = await account();
    const out = await svc.setup(u.id);
    expect(out.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(out.otpauthUrl).toContain(`secret=${out.secret}`);
    const row = (await users.findById(u.id))!;
    expect(row.twofaSecret).toBe(out.secret);
    expect(row.twofaEnabled).toBe(false);
    expect(svc.status(row)).toEqual({ enabled: false, pending: true, recoveryRemaining: 0 });
    // the column is encrypted at rest
    const raw = await ds.query('SELECT twofaSecret FROM users WHERE id = ?', [u.id]);
    expect(raw[0].twofaSecret).toMatch(/^enc::/);
  });

  it('setup again before confirming replaces the secret', async () => {
    const u = await account();
    const a = await svc.setup(u.id);
    const b = await svc.setup(u.id);
    expect(b.secret).not.toBe(a.secret);
    await expect(svc.enable(u.id, totpCode(a.secret))).rejects.toThrow(/not right/);
  });

  it('enable needs a valid code, then turns it on and returns 10 recovery codes once', async () => {
    const u = await account();
    await expect(svc.enable(u.id, '123456')).rejects.toThrow(/Start the setup/);
    const { secret } = await svc.setup(u.id);
    await expect(svc.enable(u.id, '000000')).rejects.toThrow(/not right/);
    const out = await svc.enable(u.id, totpCode(secret));
    expect(out.enabled).toBe(true);
    expect(out.recoveryCodes).toHaveLength(10);
    const row = (await users.findById(u.id))!;
    expect(row.twofaEnabled).toBe(true);
    expect(svc.status(row)).toEqual({ enabled: true, pending: false, recoveryRemaining: 10 });
    // only hashes are stored
    expect(row.twofaRecovery).not.toContain(out.recoveryCodes[0]);
    expect(JSON.parse(row.twofaRecovery!)).toContain(hashRecovery(out.recoveryCodes[0]));
    expect(notices).toMatchObject([{ to: u.id, title: 'Two-factor authentication enabled', type: 'security' }]);
    await expect(svc.setup(u.id)).rejects.toThrow(/already on/);
    await expect(svc.enable(u.id, totpCode(secret))).rejects.toThrow(/already on/);
  });

  it('disable needs a valid code (TOTP or recovery) and wipes everything', async () => {
    const u = await account();
    const { secret, recovery } = await enrol(u);
    await expect(svc.disable(u.id, '000000')).rejects.toThrow(/not right/);
    await svc.disable(u.id, recovery[0]);
    const row = (await users.findById(u.id))!;
    expect(row).toMatchObject({ twofaEnabled: false, twofaSecret: null, twofaRecovery: null });
    expect(notices.at(-1)).toMatchObject({ title: 'Two-factor authentication disabled' });
    await expect(svc.disable(u.id, nextStepCode(secret))).rejects.toThrow(/not on/);
  });
});

describe('TwoFaService: codes', () => {
  it('a TOTP code works once (its step is remembered); the next step works', async () => {
    const u = await account();
    const { secret } = await enrol(u);
    const code = nextStepCode(secret);
    const row = (await users.findById(u.id))!;
    await expect(svc.consumeCode(row, code)).resolves.toBe('totp');
    await expect(svc.consumeCode((await users.findById(u.id))!, code)).rejects.toThrow(/not right/);
    // enrol consumed the current step and the first consume the next one; nothing later is valid yet
    await expect(svc.consumeCode((await users.findById(u.id))!, nextStepCode(secret, 2))).rejects.toThrow(/not right/);
  });

  it('a recovery code works once, any case and dash', async () => {
    const u = await account();
    const { recovery } = await enrol(u);
    await expect(svc.consumeCode((await users.findById(u.id))!, recovery[3].toLowerCase().replace('-', ' '))).resolves.toBe('recovery');
    await expect(svc.consumeCode((await users.findById(u.id))!, recovery[3])).rejects.toThrow(/not right/);
    expect(svc.status((await users.findById(u.id))!).recoveryRemaining).toBe(9);
  });

  it('regenerating recovery codes retires the old set and needs a valid code', async () => {
    const u = await account();
    const { recovery } = await enrol(u);
    await expect(svc.regenerateRecovery(u.id, '111111')).rejects.toThrow(/not right/);
    const fresh = await svc.regenerateRecovery(u.id, recovery[0]);
    expect(fresh.recoveryCodes).toHaveLength(10);
    await expect(svc.consumeCode((await users.findById(u.id))!, recovery[1])).rejects.toThrow(/not right/);
    await expect(svc.consumeCode((await users.findById(u.id))!, fresh.recoveryCodes[0])).resolves.toBe('recovery');
  });

  it('locks after repeated wrong codes, even for the right one, then forgives after the window', async () => {
    const u = await account();
    const { recovery } = await enrol(u);
    for (let i = 0; i < MAX_2FA_FAILURES; i++) await expect(svc.consumeCode((await users.findById(u.id))!, '999999')).rejects.toThrow();
    await expect(svc.consumeCode((await users.findById(u.id))!, recovery[0])).rejects.toThrow(/Too many wrong codes/);
    jest.useFakeTimers({ now: Date.now() + 11 * 60_000, doNotFake: ['setImmediate', 'nextTick'] });
    try {
      await expect(svc.consumeCode((await users.findById(u.id))!, recovery[0])).resolves.toBe('recovery');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a success resets the failure count', async () => {
    const u = await account();
    const { recovery } = await enrol(u);
    for (let i = 0; i < MAX_2FA_FAILURES - 1; i++) await expect(svc.consumeCode((await users.findById(u.id))!, '999999')).rejects.toThrow(/not right/);
    await svc.consumeCode((await users.findById(u.id))!, recovery[0]);
    for (let i = 0; i < MAX_2FA_FAILURES - 1; i++) await expect(svc.consumeCode((await users.findById(u.id))!, '999999')).rejects.toThrow(/not right/);
  });

  it('refuses codes for an account without 2FA', async () => {
    const u = await account();
    await expect(svc.consumeCode(u, '123456')).rejects.toThrow(/not on/);
  });
});

describe('sign-in with two-factor authentication', () => {
  it('login returns tokens when 2FA is off', async () => {
    await account('plain', 'customer', 'Password-123');
    const out = await auth.login({ email: 'plain@x.test', password: 'Password-123' });
    expect('accessToken' in out).toBe(true);
  });

  it('login returns a challenge instead of tokens when 2FA is on; the code completes it', async () => {
    const u = await account('secure');
    const { secret } = await enrol(u);
    const step1 = await auth.login({ email: 'secure@x.test', password: 'Password-123' });
    expect(step1).toMatchObject({ needs2fa: true });
    expect('accessToken' in step1).toBe(false);
    const challenge = (step1 as { challenge: string }).challenge;
    await expect(auth.completeLogin(challenge, '000000')).rejects.toThrow(/not right/);
    const done = await auth.completeLogin(challenge, nextStepCode(secret));
    expect(done.accessToken).toBeTruthy();
    expect(done.user.id).toBe(u.id);
  });

  it('a wrong password never reaches the second step; a forged or foreign challenge is refused', async () => {
    const u = await account('secure');
    const { secret } = await enrol(u);
    await expect(auth.login({ email: 'secure@x.test', password: 'nope' })).rejects.toThrow(/Invalid email or password/);
    await expect(auth.completeLogin('garbage', nextStepCode(secret))).rejects.toThrow(/expired/);
    const jwt = new JwtService({});
    const wrongPurpose = await jwt.signAsync({ sub: u.id, purpose: 'other' }, { secret: 'refresh-secret' });
    await expect(auth.completeLogin(wrongPurpose, nextStepCode(secret))).rejects.toThrow(/expired/);
    // an ACCESS token cannot stand in for a challenge
    const accessToken = await jwt.signAsync({ sub: u.id, purpose: '2fa' }, { secret: 'access-secret' });
    await expect(auth.completeLogin(accessToken, nextStepCode(secret))).rejects.toThrow(/expired/);
  });

  it('a challenge dies when the sessions are revoked (token version changes)', async () => {
    const u = await account('secure');
    const { secret } = await enrol(u);
    const challenge = ((await auth.login({ email: 'secure@x.test', password: 'Password-123' })) as { challenge: string }).challenge;
    await auth.revokeSessions(u.id);
    await expect(auth.completeLogin(challenge, nextStepCode(secret))).rejects.toThrow(/expired/);
  });

  it('a suspended account cannot finish signing in', async () => {
    const u = await account('secure');
    const { secret } = await enrol(u);
    const challenge = ((await auth.login({ email: 'secure@x.test', password: 'Password-123' })) as { challenge: string }).challenge;
    await ds.getRepository(User).update({ id: u.id }, { active: false });
    await expect(auth.completeLogin(challenge, nextStepCode(secret))).rejects.toThrow(/suspended/);
  });

  it('the phone-code sign-in steps up too', async () => {
    const u = await account('secure');
    await enrol(u);
    const out = await auth.loginWithPhoneCode((await users.findById(u.id))!);
    expect(out).toMatchObject({ needs2fa: true });
  });

  it('deleting the account erases the 2FA secret', async () => {
    const u = await account('secure');
    await enrol(u);
    await auth.deleteAccount(u.id, 'Password-123');
    const row = (await users.findById(u.id))!;
    expect(row).toMatchObject({ twofaEnabled: false, twofaSecret: null, twofaRecovery: null });
  });
});
