import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { Setting, User } from '../database/entities';
import { testDb } from '../testing/test-db';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { AccountDeletionService } from './account-deletion.service';
import { StaffTwoFaPolicy, STAFF_2FA_REQUIRED_MESSAGE, guardStaffTwoFa } from './staff-twofa';
import { base32Decode, hashRecovery, hotp, totpCode, totpStep } from './totp';
import { TwoFaGateway } from './twofa.gateway';
import { MAX_2FA_FAILURES, TwoFaService } from './twofa.service';

let ds: DataSource;
let users: UsersService;
let svc: TwoFaService;
let auth: AuthService;
let policy: StaffTwoFaPolicy;
let notices: { to: string; title: string; type: string }[];
let seq = 0;

const config = { get: (k: string) => (k === 'jwt.secret' ? 'access-secret' : k === 'jwt.refreshSecret' ? 'refresh-secret' : '15m') };
const nextStepCode = (secret: string, steps = 1) => hotp(base32Decode(secret), totpStep() + steps);

async function account(role: User['role'], name = `staff${++seq}`, password = 'Password-123') {
  return users.create({ email: `${name}@somba.test`, passwordHash: await bcrypt.hash(password, 4), name, role });
}
async function enrol(u: User) {
  const { secret } = await svc.setup(u.id);
  const out = await svc.enable(u.id, totpCode(secret));
  return { secret, recovery: out.recoveryCodes };
}
const setSetting = (key: string, value: string) => ds.getRepository(Setting).save(ds.getRepository(Setting).create({ key, value }));

beforeEach(async () => {
  ds = await testDb();
  users = new UsersService(ds.getRepository(User));
  notices = [];
  const jwt = new JwtService({});
  svc = new TwoFaService(users, jwt, config as never, { toUser: async (to: string, n: { title: string; type: string }) => void notices.push({ to, ...n }) } as never);
  auth = new AuthService(users, jwt, config as never, new AccountDeletionService(ds), svc);
  policy = new StaffTwoFaPolicy(ds.getRepository(Setting), ds.getRepository(User));
});
afterEach(() => ds.destroy());

describe('admin two-factor sign-in (same TOTP code as sellers)', () => {
  it.each(['admin', 'admin_finance', 'admin_support', 'admin_operations', 'admin_marketing', 'admin_moderation'] as const)('enrols a %s account and then asks for the code at sign-in', async (role) => {
    const u = await account(role, role);
    const { secret } = await enrol(u);
    expect(svc.status((await users.findById(u.id))!)).toMatchObject({ enabled: true, recoveryRemaining: 10 });
    const first = await auth.login({ email: `${role}@somba.test`, password: 'Password-123' });
    expect(first).toMatchObject({ needs2fa: true });
    expect('accessToken' in first).toBe(false); // no session until the code is right
    const done = await auth.completeLogin((first as { challenge: string }).challenge, nextStepCode(secret, 1));
    expect(done.user).toMatchObject({ role, twofaEnabled: true });
    expect(done.accessToken).toBeTruthy();
  });

  it('an admin without 2FA signs in with the password alone', async () => {
    await account('admin', 'plain');
    const out = await auth.login({ email: 'plain@somba.test', password: 'Password-123' });
    expect(out).toHaveProperty('accessToken');
  });

  it('a wrong code does not sign the admin in, and repeated wrong codes lock the account', async () => {
    const u = await account('admin_finance', 'fin');
    await enrol(u);
    const first = (await auth.login({ email: 'fin@somba.test', password: 'Password-123' })) as { challenge: string };
    await expect(auth.completeLogin(first.challenge, '000000')).rejects.toThrow(/not right/);
    for (let i = 0; i < MAX_2FA_FAILURES; i++) await auth.completeLogin(first.challenge, '111111').catch(() => undefined);
    await expect(auth.completeLogin(first.challenge, '222222')).rejects.toThrow(/Too many wrong codes/);
  });

  it('a recovery code signs the admin in once and is then burnt', async () => {
    const u = await account('admin', 'root');
    const { recovery } = await enrol(u);
    const signIn = async (code: string) => {
      const c = (await auth.login({ email: 'root@somba.test', password: 'Password-123' })) as { challenge: string };
      return auth.completeLogin(c.challenge, code);
    };
    const ok = await signIn(recovery[0].toLowerCase().replace('-', ' '));
    expect(ok.user.role).toBe('admin');
    expect(svc.status((await users.findById(u.id))!).recoveryRemaining).toBe(9);
    await expect(signIn(recovery[0])).rejects.toThrow(/not right/); // burnt
    expect(await signIn(recovery[1])).toHaveProperty('accessToken');
  });

  it('a code cannot be replayed within its 30-second window', async () => {
    const u = await account('admin_support', 'sup');
    const { secret } = await enrol(u);
    const code = nextStepCode(secret, 1);
    const c1 = (await auth.login({ email: 'sup@somba.test', password: 'Password-123' })) as { challenge: string };
    await auth.completeLogin(c1.challenge, code);
    const c2 = (await auth.login({ email: 'sup@somba.test', password: 'Password-123' })) as { challenge: string };
    await expect(auth.completeLogin(c2.challenge, code)).rejects.toThrow(/not right/);
  });

  it('a wrong password never gets a challenge', async () => {
    const u = await account('admin', 'pw');
    await enrol(u);
    await expect(auth.login({ email: 'pw@somba.test', password: 'nope-nope-1' })).rejects.toThrow(/Invalid email or password/);
  });

  it('regenerating recovery codes retires the old ones', async () => {
    const u = await account('admin', 'regen');
    const { secret, recovery } = await enrol(u);
    const { recoveryCodes } = await svc.regenerateRecovery(u.id, nextStepCode(secret, 1));
    const row = (await users.findById(u.id))!;
    expect(JSON.parse(row.twofaRecovery!)).not.toContain(hashRecovery(recovery[0]));
    expect(JSON.parse(row.twofaRecovery!)).toContain(hashRecovery(recoveryCodes[0]));
  });
});

describe('super admin resets another staff member\'s 2FA', () => {
  const sign = (role: User['role'] = 'admin') => ({ id: 'actor', role });

  it('switches 2FA off, wipes secret and recovery codes, signs them out everywhere, notices them, and they can sign in with the password and enrol again', async () => {
    const sup = await account('admin', 'boss');
    const target = await account('admin_finance', 'fin');
    const { secret } = await enrol(target);
    const pending = (await auth.login({ email: 'fin@somba.test', password: 'Password-123' })) as { challenge: string };
    const before = (await users.findById(target.id))!;
    const done = await svc.resetForStaff({ id: sup.id, role: 'admin' }, target.id);
    expect(done).toMatchObject({ id: target.id, role: 'admin_finance', email: 'fin@somba.test' });
    const row = (await users.findById(target.id))!;
    expect(row).toMatchObject({ twofaEnabled: false, twofaSecret: null, twofaRecovery: null, twofaLastStep: 0 });
    expect(row.tokenVersion).toBe((before.tokenVersion ?? 0) + 1);
    expect(notices.filter((n) => n.to === target.id).map((n) => n.title)).toContain('Two-factor authentication reset');
    // the sign-in that was waiting for a code is dead, the old code is useless
    await expect(auth.completeLogin(pending.challenge, nextStepCode(secret, 1))).rejects.toThrow(/expired/);
    expect(await auth.login({ email: 'fin@somba.test', password: 'Password-123' })).toHaveProperty('accessToken');
    const again = await enrol(row);
    expect(again.secret).not.toBe(secret);
  });

  it('only the super admin may reset, not a department admin, a customer or anyone else', async () => {
    const target = await account('admin_support', 'sup');
    await enrol(target);
    for (const role of ['admin_finance', 'admin_operations', 'admin_support', 'admin_marketing', 'admin_moderation', 'customer', 'seller', 'warehouse_staff', 'rider'] as const) {
      await expect(svc.resetForStaff(sign(role), target.id)).rejects.toThrow(/Super admin only/);
    }
    expect((await users.findById(target.id))!.twofaEnabled).toBe(true);
  });

  it('cannot reset your own account, an unknown account, a customer or a seller, or an account without 2FA', async () => {
    const sup = await account('admin', 'boss');
    await enrol(sup);
    await expect(svc.resetForStaff({ id: sup.id, role: 'admin' }, sup.id)).rejects.toThrow(/your own account page/);
    await expect(svc.resetForStaff({ id: sup.id, role: 'admin' }, 'nobody')).rejects.toThrow(/not found/);
    const cust = await account('customer', 'cust');
    const sell = await account('seller', 'sell');
    await enrol(cust);
    await enrol(sell);
    await expect(svc.resetForStaff({ id: sup.id, role: 'admin' }, cust.id)).rejects.toThrow(/Only staff/);
    await expect(svc.resetForStaff({ id: sup.id, role: 'admin' }, sell.id)).rejects.toThrow(/Only staff/);
    const plain = await account('admin_marketing', 'mkt');
    await expect(svc.resetForStaff({ id: sup.id, role: 'admin' }, plain.id)).rejects.toThrow(/not on for this account/);
  });

  it('also resets a rider or a warehouse employee who enrolled', async () => {
    const sup = await account('admin', 'boss');
    for (const role of ['rider', 'warehouse_staff'] as const) {
      const t = await account(role);
      await enrol(t);
      await svc.resetForStaff({ id: sup.id, role: 'admin' }, t.id);
      expect((await users.findById(t.id))!.twofaEnabled).toBe(false);
    }
  });

  it('clears a lock the person had from wrong codes', async () => {
    const sup = await account('admin', 'boss');
    const t = await account('admin_finance', 'fin');
    await enrol(t);
    for (let i = 0; i < MAX_2FA_FAILURES; i++) await svc.consumeCode((await users.findById(t.id))!, '999999').catch(() => undefined);
    await svc.resetForStaff({ id: sup.id, role: 'admin' }, t.id);
    const { secret } = await svc.setup(t.id);
    await expect(svc.enable(t.id, totpCode(secret))).resolves.toMatchObject({ enabled: true });
  });
});

describe('requireStaffTwoFactor (platform setting)', () => {
  it('is off by default: nobody is held at enrolment', async () => {
    const u = await account('admin_finance');
    expect(await policy.required('admin_finance')).toBe(false);
    expect(await policy.mustEnrol(u.id, 'admin_finance')).toBe(false);
    expect(await policy.refusal({ id: u.id, role: 'admin_finance' }, 'orders:list', {})).toBeNull();
  });

  it('when on, an admin without 2FA is refused everything except the enrolment events; one with 2FA is not', async () => {
    await setSetting('requireStaffTwoFactor', 'true');
    const without = await account('admin_finance', 'a');
    const withTfa = await account('admin_support', 'b');
    await enrol(withTfa);
    const a = { id: without.id, role: 'admin_finance' };
    expect(await policy.refusal(a, 'orders:list', {})).toBe(STAFF_2FA_REQUIRED_MESSAGE);
    expect(await policy.refusal(a, 'fraud:list', {})).toBe(STAFF_2FA_REQUIRED_MESSAGE);
    expect(await policy.refusal(a, 'settings:set', { key: 'fxRate', value: '1' })).toBe(STAFF_2FA_REQUIRED_MESSAGE);
    for (const open of ['auth:2fa:status', 'auth:2fa:setup', 'auth:2fa:enable', 'me:changePassword', 'notifications:list', 'devices:register', 'settings:get']) {
      expect(await policy.refusal(a, open, {})).toBeNull();
    }
    // the rest of `auth:` and `me:` is not an enrolment step
    for (const shut of ['auth:2fa:reset', 'auth:2fa:disable', 'auth:2fa:recovery', 'auth:other', 'me:delete', 'devices:test']) {
      expect(await policy.refusal(a, shut, { userId: 'x' })).toBe(STAFF_2FA_REQUIRED_MESSAGE);
    }
    expect(await policy.refusal({ id: withTfa.id, role: 'admin_support' }, 'orders:list', {})).toBeNull();
  });

  it('a key wrapped in an array cannot slip past the requirement guard', async () => {
    const fin = await account('admin_finance', 'wrap');
    const sup = await account('admin', 'wrapboss');
    for (const key of [['requireStaffTwoFactor'], new String('requireStaffTwoFactor')]) {
      expect(await policy.refusal({ id: fin.id, role: 'admin_finance' }, 'settings:set', { key, value: 'false' })).toMatch(/Only the super admin/);
      expect(await policy.refusal({ id: sup.id, role: 'admin' }, 'settings:set', { key, value: 'true' })).toMatch(/your own account first/);
    }
  });

  it('a super admin held at enrolment cannot switch the rule off or reset anyone: they enrol first, and enrolling stays open', async () => {
    const sup = await account('admin', 'heldboss');
    await enrol(sup);
    await setSetting('requireStaffTwoFactor', 'true');
    await ds.getRepository(User).update({ id: sup.id }, { twofaEnabled: false, twofaSecret: null as never, twofaRecovery: null as never }); // 2FA lost: held again
    const who = { id: sup.id, role: 'admin' };
    expect(await policy.refusal(who, 'settings:set', { key: 'requireStaffTwoFactor', value: 'false' })).toBe(STAFF_2FA_REQUIRED_MESSAGE);
    expect(await policy.refusal(who, 'auth:2fa:reset', { userId: 'someone' })).toBe(STAFF_2FA_REQUIRED_MESSAGE);
    for (const step of ['auth:2fa:status', 'auth:2fa:setup', 'auth:2fa:enable']) expect(await policy.refusal(who, step, {})).toBeNull();
    await enrol(sup);
    expect(await policy.refusal(who, 'settings:set', { key: 'requireStaffTwoFactor', value: 'false' })).toBeNull();
  });

  it('applies to every admin role and to no one else (customers, sellers, riders, warehouse staff)', async () => {
    await setSetting('requireStaffTwoFactor', 'true');
    for (const role of ['admin', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation']) {
      const u = await account(role as User['role']);
      expect(await policy.refusal({ id: u.id, role }, 'orders:list', {})).toBe(STAFF_2FA_REQUIRED_MESSAGE);
    }
    for (const role of ['customer', 'seller', 'rider', 'warehouse_staff'] as const) {
      const u = await account(role);
      expect(await policy.refusal({ id: u.id, role }, 'orders:list', {})).toBeNull();
    }
  });

  it('after enrolling, the same person gets through at once; after a reset they are held again', async () => {
    await setSetting('requireStaffTwoFactor', 'true');
    const sup = await account('admin', 'boss');
    await enrol(sup);
    const u = await account('admin_finance', 'fin');
    const who = { id: u.id, role: 'admin_finance' };
    expect(await policy.refusal(who, 'orders:list', {})).toBe(STAFF_2FA_REQUIRED_MESSAGE);
    await enrol(u);
    expect(await policy.refusal(who, 'orders:list', {})).toBeNull();
    await svc.resetForStaff({ id: sup.id, role: 'admin' }, u.id);
    expect(await policy.refusal(who, 'orders:list', {})).toBe(STAFF_2FA_REQUIRED_MESSAGE);
  });

  it('only the super admin can change the requirement, and only once their own 2FA is on', async () => {
    const sup = await account('admin', 'boss');
    const fin = await account('admin_finance', 'fin');
    const body = { key: 'requireStaffTwoFactor', value: 'true' };
    expect(await policy.refusal({ id: fin.id, role: 'admin_finance' }, 'settings:set', body)).toMatch(/Only the super admin/);
    expect(await policy.refusal({ id: fin.id, role: 'admin_finance' }, 'settings:set', { key: 'requireStaffTwoFactor', value: 'false' })).toMatch(/Only the super admin/);
    expect(await policy.refusal({ id: sup.id, role: 'admin' }, 'settings:set', body)).toMatch(/your own account first/);
    expect(await policy.refusal({ id: sup.id, role: 'admin' }, 'settings:set', { key: 'requireStaffTwoFactor', value: 'false' })).toBeNull(); // turning it off is always allowed
    await enrol(sup);
    expect(await policy.refusal({ id: sup.id, role: 'admin' }, 'settings:set', body)).toBeNull();
    // other settings are not affected by this rule
    expect(await policy.refusal({ id: fin.id, role: 'admin_finance' }, 'settings:set', { key: 'fxRate', value: '2900' })).toBeNull();
  });
});

describe('the socket guard (every event of every gateway)', () => {
  /** A socket whose packet middleware we can drive: `send` runs the packet through the guard, like Socket.IO does. */
  const socketFor = (user: { id: string; role: string } | undefined) => {
    let mw: ((packet: unknown[], next: (e?: Error) => void) => void) | undefined;
    const socket = { data: { user }, use: (fn: typeof mw) => void (mw = fn) };
    guardStaffTwoFa(socket as never, () => policy);
    return {
      send: (event: string, body?: unknown) =>
        new Promise<{ acked?: unknown; passed: boolean }>((resolve) => {
          let acked: unknown;
          const ack = (r: unknown) => { acked = r; resolve({ acked, passed: false }); };
          mw!(body === undefined ? [event, ack] : [event, body, ack], () => resolve({ acked, passed: true }));
        }),
    };
  };

  it('answers a held staff member through the ack and never lets the event through', async () => {
    await setSetting('requireStaffTwoFactor', 'true');
    const u = await account('admin_finance');
    const r = await socketFor({ id: u.id, role: 'admin_finance' }).send('orders:list', { limit: 5 });
    expect(r).toEqual({ passed: false, acked: { ok: false, error: STAFF_2FA_REQUIRED_MESSAGE, code: 'twofa_required' } });
    expect((await socketFor({ id: u.id, role: 'admin_finance' }).send('orders:list')).passed).toBe(false); // no body: [event, ack]
  });

  it('lets the enrolment events, other roles and guests through', async () => {
    await setSetting('requireStaffTwoFactor', 'true');
    const u = await account('admin_finance');
    expect((await socketFor({ id: u.id, role: 'admin_finance' }).send('auth:2fa:setup')).passed).toBe(true);
    const c = await account('customer');
    expect((await socketFor({ id: c.id, role: 'customer' }).send('orders:list')).passed).toBe(true);
    expect((await socketFor(undefined).send('products:list')).passed).toBe(true);
    expect((await socketFor({ id: 'guest', role: 'guest' }).send('products:list')).passed).toBe(true);
  });

  it('refuses a non-super admin who tries to change the requirement while it is off', async () => {
    const u = await account('admin_operations');
    const r = await socketFor({ id: u.id, role: 'admin_operations' }).send('settings:set', { key: 'requireStaffTwoFactor', value: 'true' });
    expect(r).toMatchObject({ passed: false, acked: { ok: false, code: 'twofa_required' } });
  });

  it('with the requirement off, staff go through untouched', async () => {
    const u = await account('admin_finance');
    expect((await socketFor({ id: u.id, role: 'admin_finance' }).send('orders:list')).passed).toBe(true);
  });

  it('when the policy cannot be read it answers instead of hanging, and does not let the event through', async () => {
    const u = await account('admin_finance');
    jest.spyOn(policy, 'refusal').mockRejectedValueOnce(new Error('db down'));
    const r = await socketFor({ id: u.id, role: 'admin_finance' }).send('orders:list');
    expect(r).toMatchObject({ passed: false, acked: { ok: false } });
  });
});

describe('TwoFaGateway for staff', () => {
  let audit: { record: jest.Mock };
  let disconnect: jest.Mock;
  let gw: TwoFaGateway;
  const sock = (u: User) => ({ data: { user: { id: u.id, role: u.role, name: u.name } } }) as never;

  beforeEach(() => {
    audit = { record: jest.fn(async () => undefined) };
    disconnect = jest.fn();
    const settings = { get: async (k: string) => (await ds.getRepository(Setting).findOne({ where: { key: k } }))?.value ?? null };
    gw = new TwoFaGateway(svc, users, settings as never, { membership: async () => null } as never, policy, audit as never);
    gw.server = { in: () => ({ disconnectSockets: disconnect }) } as never;
  });

  it('status says whether the platform requires 2FA for a staff account', async () => {
    const u = await account('admin_finance');
    expect(await gw.status(sock(u))).toMatchObject({ ok: true, data: { enabled: false, required: false, requiredFor: 'staff' } });
    await setSetting('requireStaffTwoFactor', 'true');
    expect(await gw.status(sock(u))).toMatchObject({ ok: true, data: { required: true, requiredFor: 'staff' } });
    const c = await account('customer');
    expect(await gw.status(sock(c))).toMatchObject({ ok: true, data: { required: false, requiredFor: null } });
  });

  it('a staff member can enrol through the events, and cannot turn 2FA off while it is required', async () => {
    await setSetting('requireStaffTwoFactor', 'true');
    const u = await account('admin_support');
    const setup = (await gw.setup(sock(u))) as { ok: true; data: { secret: string; otpauthUrl: string } };
    expect(setup.data.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    const en = (await gw.enable(sock(u), { code: totpCode(setup.data.secret) })) as { ok: true; data: { recoveryCodes: string[] } };
    expect(en.data.recoveryCodes).toHaveLength(10);
    const off = await gw.disable(sock(u), { code: nextStepCode(setup.data.secret, 1) });
    expect(off).toEqual({ ok: false, error: 'Two-factor authentication is required for staff accounts and cannot be turned off.' });
    expect((await users.findById(u.id))!.twofaEnabled).toBe(true);
  });

  it('a staff member can turn 2FA off when the platform does not require it', async () => {
    const u = await account('admin_support');
    const { secret } = await enrol(u);
    const off = await gw.disable(sock(u), { code: nextStepCode(secret, 1) });
    expect(off).toMatchObject({ ok: true, data: { enabled: false } });
  });

  it('reset: audited, drops the person\'s sockets, and refused for everyone but the super admin', async () => {
    const sup = await account('admin', 'boss');
    const fin = await account('admin_finance', 'fin');
    await enrol(fin);
    expect(await gw.reset(sock(fin), { userId: fin.id })).toMatchObject({ ok: false });
    expect(await gw.reset(sock(await account('admin_finance', 'other')), { userId: fin.id })).toEqual({ ok: false, error: 'Super admin only.' });
    expect(audit.record).not.toHaveBeenCalled();
    expect(await gw.reset(sock(sup), { userId: fin.id })).toEqual({ ok: true, data: { id: fin.id, twofaEnabled: false } });
    expect(audit.record).toHaveBeenCalledWith({ actor: 'boss', role: 'admin', action: 'staff.2fa.reset', entity: 'user', entityId: fin.id, detail: 'admin_finance fin@somba.test' });
    expect(disconnect).toHaveBeenCalledWith(true);
    expect((await users.findById(fin.id))!.twofaEnabled).toBe(false);
    // not twice: there is nothing left to reset
    expect(await gw.reset(sock(sup), { userId: fin.id })).toMatchObject({ ok: false, error: expect.stringMatching(/not on/) });
  });

  it('reset without a user id is refused cleanly', async () => {
    const sup = await account('admin', 'boss');
    expect(await gw.reset(sock(sup), {})).toMatchObject({ ok: false });
  });
});
