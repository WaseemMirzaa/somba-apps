// A token may only be used for what it was issued for. Before this, the 2FA challenge (the result of a correct
// PASSWORD alone) was accepted by /auth/refresh, which handed back full tokens: the second step could be skipped.
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { User } from '../database/entities';
import { testDb } from '../testing/test-db';
import { UsersService } from '../users/users.service';
import { AccountDeletionService } from './account-deletion.service';
import { AuthService, assertTokenKind } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { totpCode } from './totp';
import { TwoFaService } from './twofa.service';

let ds: DataSource;
let users: UsersService;
let jwt: JwtService;
let twofa: TwoFaService;
let auth: AuthService;

const cfg = (sameSecret: boolean) => ({
  get: (k: string) =>
    k === 'jwt.secret' ? 'access-secret' : k === 'jwt.refreshSecret' ? (sameSecret ? 'access-secret' : 'refresh-secret') : k === 'jwt.refreshTtl' ? '30d' : '15m',
});
const build = (sameSecret: boolean) => {
  jwt = new JwtService({});
  twofa = new TwoFaService(users, jwt, cfg(sameSecret) as never, { toUser: async () => undefined } as never);
  auth = new AuthService(users, jwt, cfg(sameSecret) as never, new AccountDeletionService(ds), twofa);
};
const PASSWORD = 'Password-123';

async function enrolledAdmin() {
  const u = await users.create({ email: 'boss@x.test', passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Boss', role: 'admin' });
  const { secret } = await twofa.setup(u.id);
  await twofa.enable(u.id, totpCode(secret));
  return u;
}
async function challengeOf(email: string): Promise<string> {
  const step1 = (await auth.login({ email, password: PASSWORD })) as { needs2fa?: boolean; challenge: string };
  expect(step1.needs2fa).toBe(true);
  return step1.challenge;
}

beforeEach(async () => {
  ds = await testDb();
  users = new UsersService(ds.getRepository(User));
  build(false);
});
afterEach(() => ds.destroy());

describe('the 2FA challenge is not a session', () => {
  it('cannot be traded at /auth/refresh for tokens (this skipped the second step)', async () => {
    await enrolledAdmin();
    const challenge = await challengeOf('boss@x.test');
    await expect(auth.refresh(challenge)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('cannot be used as an access token (socket handshake or private link check)', async () => {
    await enrolledAdmin();
    const challenge = await challengeOf('boss@x.test');
    await expect(auth.verifyAccess(challenge)).rejects.toThrow();
  });

  it('still works for what it is for: a correct code turns it into a session', async () => {
    const u = await enrolledAdmin();
    const challenge = await challengeOf('boss@x.test');
    const secret = (await users.findById(u.id))!.twofaSecret!;
    // The enrolment already used this 30-second step (replay protection), so take the next step's code.
    const res = await twofa.redeem(challenge, totpCode(secret, Date.now() + 30_000));
    expect(res.id).toBe(u.id);
  });

  it('is refused even if the two JWT secrets were configured to the same value', async () => {
    build(true);
    await enrolledAdmin();
    const challenge = await challengeOf('boss@x.test');
    await expect(auth.refresh(challenge)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.verifyAccess(challenge)).rejects.toThrow();
  });
});

describe('access and refresh tokens are not interchangeable', () => {
  const login = async () => {
    await users.create({ email: 'c@x.test', passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'C', role: 'customer' });
    return (await auth.login({ email: 'c@x.test', password: PASSWORD })) as { accessToken: string; refreshToken: string };
  };

  it('new tokens say what they are, and a normal refresh works', async () => {
    const t = await login();
    expect(jwt.decode(t.accessToken)).toMatchObject({ typ: 'access' });
    expect(jwt.decode(t.refreshToken)).toMatchObject({ typ: 'refresh' });
    const again = await auth.refresh(t.refreshToken);
    expect(again.accessToken).toBeTruthy();
    expect((await auth.verifyAccess(again.accessToken)).role).toBe('customer');
  });

  it('with one shared secret, a refresh token is not an access token and an access token is not a refresh token', async () => {
    build(true);
    const t = await login();
    await expect(auth.verifyAccess(t.refreshToken)).rejects.toThrow();
    await expect(auth.refresh(t.accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('a refresh token issued before the claim existed (no typ) is still accepted, so nobody is signed out by the upgrade', async () => {
    const u = await users.create({ email: 'old@x.test', passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Old', role: 'customer' });
    const legacy = await jwt.signAsync({ sub: u.id, role: 'customer', email: 'old@x.test', tokenVersion: 0 }, { secret: 'refresh-secret', expiresIn: '30d' });
    await expect(auth.refresh(legacy)).resolves.toMatchObject({ accessToken: expect.any(String) });
  });
});

describe('assertTokenKind and the REST strategy', () => {
  it('rejects any purpose token and any token of the other kind; accepts the right kind or no kind', () => {
    expect(() => assertTokenKind({ purpose: '2fa' }, 'refresh')).toThrow(UnauthorizedException);
    expect(() => assertTokenKind({ purpose: '2fa' }, 'access')).toThrow(UnauthorizedException);
    expect(() => assertTokenKind({ typ: 'refresh' }, 'access')).toThrow(UnauthorizedException);
    expect(() => assertTokenKind({ typ: 'access' }, 'refresh')).toThrow(UnauthorizedException);
    expect(() => assertTokenKind({ typ: 'access' }, 'access')).not.toThrow();
    expect(() => assertTokenKind({ typ: 'refresh' }, 'refresh')).not.toThrow();
    expect(() => assertTokenKind({}, 'access')).not.toThrow();
    expect(() => assertTokenKind({}, 'refresh')).not.toThrow();
  });

  it('JwtStrategy (every REST call) refuses a 2FA challenge or a refresh token presented as a bearer token', async () => {
    const u = await users.create({ email: 'a@x.test', passwordHash: 'x', name: 'A', role: 'admin' });
    const strat = new JwtStrategy(cfg(true) as never, users);
    const base = { sub: u.id, role: 'admin', email: 'a@x.test', tokenVersion: 0 };
    await expect(strat.validate({ ...base, typ: 'access' })).resolves.toEqual({ id: u.id, role: 'admin', email: 'a@x.test' });
    await expect(strat.validate(base)).resolves.toEqual({ id: u.id, role: 'admin', email: 'a@x.test' }); // legacy access token, short-lived
    await expect(strat.validate({ ...base, purpose: '2fa' })).rejects.toThrow(UnauthorizedException);
    await expect(strat.validate({ ...base, typ: 'refresh' })).rejects.toThrow(UnauthorizedException);
  });
});
