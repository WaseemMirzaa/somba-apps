// Audit AD-02: staff and riders an administrator creates got a temporary password that nothing ever made them change,
// and an administrator could not re-issue one or correct an e-mail. These tests pin the fix: the flag, the single central
// refusal (sockets and REST), the change that lifts it, the re-issue and the e-mail edit.
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource, DataSource as Ds } from 'typeorm';
import { Hub, User, VerificationToken } from '../database/entities';
import { ForcedPasswordChange1793410000001 } from '../database/migrations/1793410000001-ForcedPasswordChange';
import { RolesService } from '../ops/roles.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { recordingEmitter, testDb } from '../testing/test-db';
import { UsersService } from '../users/users.service';
import { AccountDeletionService } from './account-deletion.service';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { AllowPendingPasswordChange, PASSWORD_CHANGE_OPEN_EVENTS, PASSWORD_CHANGE_REQUIRED, guardPasswordChange } from './password-change';
import { VerificationService } from './verification.service';

// bcrypt at the production cost (12) is slow in pure JS and every test here creates and signs in real accounts: hash cheaply.
jest.mock('bcryptjs', () => {
  const real = jest.requireActual('bcryptjs');
  return { ...real, hash: (p: string) => real.hash(p, 4) };
});
jest.setTimeout(30_000);

let ds: DataSource;
let users: UsersService;
let auth: AuthService;
let roles: RolesService;
let hubId: string;

const cfg = { get: (k: string) => (k === 'jwt.secret' ? 'access-secret' : k === 'jwt.refreshSecret' ? 'refresh-secret' : k === 'jwt.refreshTtl' ? '30d' : '15m') };

beforeEach(async () => {
  ds = await testDb();
  users = new UsersService(ds.getRepository(User));
  auth = new AuthService(users, new JwtService({}), cfg as never, new AccountDeletionService(ds));
  roles = new RolesService(ds.getRepository(User), users, recordingEmitter() as never, ds.getRepository(Hub), undefined, ds.getRepository(VerificationToken));
  hubId = (await ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name: 'Entrepôt', city: 'Kinshasa', country: 'DRC', capacity: 10, address: 'Gombe' }))).id;
});
afterEach(() => ds.destroy());

const verificationService = () => new VerificationService(ds.getRepository(VerificationToken), users, { emailConfigured: true, sendEmail: async () => undefined } as never);
const reload = async (id: string) => (await users.findById(id))!;
const makeStaff = (role: 'rider' | 'warehouse_staff' | 'admin_finance' = 'rider', email = `${role}@somba.test`) =>
  roles.createStaff({ email, name: 'New Person', role, hubId: role === 'rider' || role === 'warehouse_staff' ? hubId : null });

describe('accounts an administrator creates are flagged', () => {
  it.each(['rider', 'warehouse_staff', 'admin_finance', 'admin_support', 'admin_operations', 'admin_marketing', 'admin_moderation'] as const)('createStaff(%s) sets mustChangePassword and the login answer says so', async (role) => {
    const made = await makeStaff(role, `${role}@somba.test`);
    expect((await reload(made.id)).mustChangePassword).toBe(true);
    const login = await auth.login({ email: `${role}@somba.test`, password: made.tempPassword });
    expect(login).toMatchObject({ mustChangePassword: true, user: { id: made.id, mustChangePassword: true } });
  });

  it('customers and sellers who sign up are never flagged', async () => {
    const c = await auth.register({ email: 'cust@somba.test', password: 'Customer-1234', name: 'Cust' });
    const s = await auth.register({ email: 'sell@somba.test', password: 'Seller-1234', name: 'Sell', role: 'seller' });
    expect(c.mustChangePassword).toBe(false);
    expect(s.mustChangePassword).toBe(false);
    expect((await reload(c.user.id)).mustChangePassword).toBe(false);
    expect((await reload(s.user.id)).mustChangePassword).toBe(false);
    expect(JSON.parse(Buffer.from(c.accessToken.split('.')[1], 'base64url').toString()).pwc).toBeUndefined();
  });

  it('the access token of a flagged account carries the claim, and the refreshed token keeps it until the password is changed', async () => {
    const made = await makeStaff();
    const login = (await auth.login({ email: 'rider@somba.test', password: made.tempPassword })) as { accessToken: string; refreshToken: string };
    expect(JSON.parse(Buffer.from(login.accessToken.split('.')[1], 'base64url').toString()).pwc).toBe(true);
    const again = await auth.refresh(login.refreshToken);
    expect(again.mustChangePassword).toBe(true);
    expect(JSON.parse(Buffer.from(again.accessToken.split('.')[1], 'base64url').toString()).pwc).toBe(true);
  });
});

describe('changing the temporary password', () => {
  it('needs the temporary password as the current one', async () => {
    const made = await makeStaff();
    await expect(auth.changePassword(made.id, 'not-the-temp', 'A-brand-new-pass-1')).rejects.toThrow('Current password is incorrect.');
    expect((await reload(made.id)).mustChangePassword).toBe(true);
  });

  it('refuses the temporary password itself as the new one, and a too-short one', async () => {
    const made = await makeStaff();
    await expect(auth.changePassword(made.id, made.tempPassword, made.tempPassword)).rejects.toThrow(/different from the temporary one/);
    await expect(auth.changePassword(made.id, made.tempPassword, 'short')).rejects.toThrow(/at least 8 characters/);
    expect((await reload(made.id)).mustChangePassword).toBe(true);
  });

  it('clears the flag, hands back unflagged tokens, ends the other sessions and the temporary password stops working', async () => {
    const made = await makeStaff();
    const first = (await auth.login({ email: 'rider@somba.test', password: made.tempPassword })) as { refreshToken: string; accessToken: string };
    const other = (await auth.login({ email: 'rider@somba.test', password: made.tempPassword })) as { refreshToken: string; accessToken: string };
    const done = await auth.changePassword(made.id, made.tempPassword, 'A-brand-new-pass-1');
    expect(done.mustChangePassword).toBe(false);
    expect(done.user.mustChangePassword).toBe(false);
    expect(JSON.parse(Buffer.from(done.accessToken.split('.')[1], 'base64url').toString()).pwc).toBeUndefined();
    expect((await reload(made.id)).mustChangePassword).toBe(false);
    // Other sessions: refresh and a socket handshake (verifyAccess + tokenVersion) both fail.
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow(/revoked/);
    await expect(auth.refresh(other.refreshToken)).rejects.toThrow(/revoked/);
    expect((await auth.verifyAccess(other.accessToken)).tokenVersion).not.toBe((await reload(made.id)).tokenVersion);
    // The new session keeps working.
    expect((await auth.refresh(done.refreshToken)).user.id).toBe(made.id);
    await expect(auth.login({ email: 'rider@somba.test', password: made.tempPassword })).rejects.toThrow(/Invalid email or password/);
    expect(await auth.login({ email: 'rider@somba.test', password: 'A-brand-new-pass-1' })).toMatchObject({ mustChangePassword: false });
  });

  it('an ordinary account may still pick any 8-character password (the new rule is for temporary passwords)', async () => {
    const c = await auth.register({ email: 'cust@somba.test', password: 'Customer-1234', name: 'Cust' });
    const out = await auth.changePassword(c.user.id, 'Customer-1234', 'Customer-1234');
    expect(out.mustChangePassword).toBe(false);
  });

  it('a password reset through the e-mail link also clears the flag', async () => {
    const made = await makeStaff();
    const verification = verificationService();
    const ver = verification as unknown as { issue: (u: string, k: string, s: string, b: boolean) => Promise<boolean> };
    await ver.issue(made.id, 'reset', 'secret-token', true);
    await verification.resetPassword('secret-token', 'Chosen-by-me-123');
    expect((await reload(made.id)).mustChangePassword).toBe(false);
  });
});

describe('an administrator re-issues a temporary password', () => {
  it('generates a new random password, flags the account again, ends every session, and the old password stops working', async () => {
    const made = await makeStaff();
    const chosen = await auth.changePassword(made.id, made.tempPassword, 'My-own-password-1');
    expect((await reload(made.id)).mustChangePassword).toBe(false);
    const before = (await reload(made.id)).tokenVersion;

    const out = await roles.reissuePassword(made.id);
    expect(out).toMatchObject({ id: made.id, email: 'rider@somba.test', role: 'rider' });
    expect(out.tempPassword).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(out.tempPassword).not.toBe(made.tempPassword);
    const row = await reload(made.id);
    expect(row.mustChangePassword).toBe(true);
    expect(row.tokenVersion).toBeGreaterThan(before);
    expect(row.passwordHash).not.toContain(out.tempPassword); // only the hash is stored
    await expect(auth.refresh(chosen.refreshToken)).rejects.toThrow(/revoked/);
    await expect(auth.login({ email: 'rider@somba.test', password: 'My-own-password-1' })).rejects.toThrow(/Invalid email or password/);
    expect(await auth.login({ email: 'rider@somba.test', password: out.tempPassword })).toMatchObject({ mustChangePassword: true });
    // Two re-issues never give the same password.
    expect((await roles.reissuePassword(made.id)).tempPassword).not.toBe(out.tempPassword);
  });

  it('burns reset links sent before it', async () => {
    const made = await makeStaff();
    const verification = verificationService();
    await (verification as unknown as { issue: (u: string, k: string, s: string, b: boolean) => Promise<boolean> }).issue(made.id, 'reset', 'old-link', true);
    await roles.reissuePassword(made.id);
    await expect(verification.resetPassword('old-link', 'Whatever-123456')).rejects.toThrow(/Invalid or expired link/);
  });

  it('is for staff, riders and administrators only: customers, sellers and unknown ids are refused and nothing changes', async () => {
    const c = await auth.register({ email: 'cust@somba.test', password: 'Customer-1234', name: 'Cust' });
    const s = await auth.register({ email: 'sell@somba.test', password: 'Seller-1234', name: 'Sell', role: 'seller' });
    for (const id of [c.user.id, s.user.id]) await expect(roles.reissuePassword(id)).rejects.toThrow(/Customers and sellers manage their own account/);
    await expect(roles.reissuePassword('nope')).rejects.toThrow('Account not found.');
    await expect(roles.reissuePassword('')).rejects.toThrow('Account not found.');
    expect((await reload(c.user.id)).mustChangePassword).toBe(false);
    expect(await auth.login({ email: 'cust@somba.test', password: 'Customer-1234' })).toBeTruthy();
  });
});

describe('the staff list', () => {
  it('shows who has not chosen a password of their own yet, and the re-issue broadcasts it', async () => {
    const events: { event: string; payload: unknown }[] = [];
    const rec = recordingEmitter();
    const svc = new RolesService(ds.getRepository(User), users, { ...rec, toRoles: (r: string[], event: string, payload: unknown) => void events.push({ event, payload }) } as never, ds.getRepository(Hub), undefined, ds.getRepository(VerificationToken));
    const made = await svc.createStaff({ email: 'a@somba.test', name: 'A', role: 'rider', hubId });
    expect((await svc.staff()).find((s) => s.id === made.id)).toMatchObject({ mustChangePassword: true });
    await auth.changePassword(made.id, made.tempPassword, 'My-own-password-1');
    expect((await svc.staff()).find((s) => s.id === made.id)).toMatchObject({ mustChangePassword: false });
    await svc.reissuePassword(made.id);
    expect((await svc.staff()).find((s) => s.id === made.id)).toMatchObject({ mustChangePassword: true });
    expect(events.at(-1)).toEqual({ event: 'roles:updated', payload: { id: made.id, role: 'rider', mustChangePassword: true } });
    expect(JSON.stringify(events)).not.toMatch(/tempPassword|passwordHash/);
  });
});

describe('an administrator corrects a staff e-mail', () => {
  it('normalises it, keeps the person signed in only by the new address, marks it unverified', async () => {
    const made = await makeStaff();
    const out = await roles.updateStaffEmail(made.id, '  New.Mail@Somba.TEST ');
    expect(out).toMatchObject({ email: 'new.mail@somba.test', previousEmail: 'rider@somba.test' });
    const row = await reload(made.id);
    expect(row.email).toBe('new.mail@somba.test');
    expect(row.emailHash).toBe(UsersService.emailHash('new.mail@somba.test'));
    expect(row.emailVerified).toBe(false);
    expect(await auth.login({ email: 'NEW.mail@somba.test', password: made.tempPassword })).toBeTruthy();
    await expect(auth.login({ email: 'rider@somba.test', password: made.tempPassword })).rejects.toThrow(/Invalid email or password/);
  });

  it('refuses an address another account already uses (any case), an invalid address, customers and sellers', async () => {
    const a = await makeStaff('rider', 'a@somba.test');
    await makeStaff('warehouse_staff', 'b@somba.test');
    const c = await auth.register({ email: 'cust@somba.test', password: 'Customer-1234', name: 'Cust' });
    await expect(roles.updateStaffEmail(a.id, 'B@somba.test')).rejects.toThrow('An account with this email already exists.');
    await expect(roles.updateStaffEmail(a.id, 'cust@somba.test')).rejects.toThrow('An account with this email already exists.');
    for (const bad of ['', 'no-at-sign', 'a b@c.d', 'x@y']) await expect(roles.updateStaffEmail(a.id, bad)).rejects.toThrow('Enter a valid email.');
    await expect(roles.updateStaffEmail(c.user.id, 'new@somba.test')).rejects.toThrow(/Customers and sellers manage their own account/);
    expect((await reload(a.id)).email).toBe('a@somba.test');
    expect((await reload(c.user.id)).email).toBe('cust@somba.test');
  });

  it('setting the same address again changes nothing', async () => {
    const a = await makeStaff('rider', 'a@somba.test');
    await ds.getRepository(User).update({ id: a.id }, { emailVerified: true });
    expect(await roles.updateStaffEmail(a.id, 'A@somba.test')).toMatchObject({ email: 'a@somba.test' });
    expect((await reload(a.id)).emailVerified).toBe(true);
  });

  it('burns links sent to the old address', async () => {
    const a = await makeStaff('rider', 'a@somba.test');
    const verification = verificationService();
    await (verification as unknown as { issue: (u: string, k: string, s: string, b: boolean) => Promise<boolean> }).issue(a.id, 'reset', 'old-link', true);
    await roles.updateStaffEmail(a.id, 'fixed@somba.test');
    await expect(verification.resetPassword('old-link', 'Whatever-123456')).rejects.toThrow(/Invalid or expired link/);
  });
});

describe('the migration', () => {
  it('adds the column with false for every existing user: nobody is locked out by the deploy', async () => {
    const old = new Ds({ type: 'better-sqlite3', database: ':memory:', synchronize: false });
    await old.initialize();
    await old.query(`CREATE TABLE "users" ("id" varchar(36) PRIMARY KEY NOT NULL, "role" varchar NOT NULL, "name" varchar NOT NULL)`);
    await old.query(`INSERT INTO "users" ("id","role","name") VALUES ('a','admin','Boss'), ('b','rider','Marc'), ('c','customer','Cust')`);
    const q = old.createQueryRunner();
    try {
      await new ForcedPasswordChange1793410000001().up(q);
      await new ForcedPasswordChange1793410000001().up(q); // twice is harmless
      expect(await old.query(`SELECT id, mustChangePassword AS f FROM users ORDER BY id`)).toEqual([
        { id: 'a', f: 0 },
        { id: 'b', f: 0 },
        { id: 'c', f: 0 },
      ]);
      await old.query(`INSERT INTO "users" ("id","role","name") VALUES ('d','rider','New')`);
      expect(await old.query(`SELECT mustChangePassword AS f FROM users WHERE id = 'd'`)).toEqual([{ f: 0 }]);
      await new ForcedPasswordChange1793410000001().down(q);
      expect((await old.query(`PRAGMA table_info("users")`)).map((c: { name: string }) => c.name)).not.toContain('mustChangePassword');
    } finally {
      await q.release();
      await old.destroy();
    }
  });
});

describe('the socket guard (one place for every event of every gateway)', () => {
  function socketOf(user: { id: string; role: string; mustChangePassword?: boolean } | undefined) {
    const middleware: { fn?: (p: unknown[], next: (e?: Error) => void) => void } = {};
    const socket = { data: { user }, use: (fn: never) => void (middleware.fn = fn) };
    guardPasswordChange(socket as never);
    const send = (event: string, body: unknown = {}) => {
      const ack = jest.fn();
      const next = jest.fn();
      middleware.fn!([event, body, ack], next);
      return { ack, next };
    };
    return { send, socket };
  }

  const events = ['orders:list', 'orders:updateStatus', 'payouts:approve', 'roles:createStaff', 'roles:resetPassword', 'settings:set', 'warehouse:parcels', 'delivery:updateStatus', 'rider:tasks', 'auth:2fa:status', 'auth:2fa:setup', 'me:update', 'me:setPrefs', 'notifications:list', 'devices:register', 'settings:get', 'anything:at-all'];

  it.each(events)('refuses %s with password_change_required and never lets it reach a handler', (event) => {
    const { send } = socketOf({ id: 'u1', role: 'rider', mustChangePassword: true });
    const { ack, next } = send(event);
    expect(next).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith({ ok: false, error: expect.stringMatching(/new password/), code: PASSWORD_CHANGE_REQUIRED });
  });

  it('lets exactly the change, the own profile and the sign-out calls through', () => {
    expect([...PASSWORD_CHANGE_OPEN_EVENTS].sort()).toEqual(['devices:unregister', 'me:changePassword', 'me:get']);
    const { send } = socketOf({ id: 'u1', role: 'warehouse_staff', mustChangePassword: true });
    for (const e of PASSWORD_CHANGE_OPEN_EVENTS) {
      const { next, ack } = send(e);
      expect(next).toHaveBeenCalled();
      expect(ack).not.toHaveBeenCalled();
    }
  });

  it('an event sent without an ack callback is dropped quietly', () => {
    const { socket } = socketOf({ id: 'u1', role: 'rider', mustChangePassword: true });
    expect(socket).toBeTruthy();
    const next = jest.fn();
    (socket as unknown as { use: (f: never) => void }).use = () => undefined;
    const mw: { fn?: (p: unknown[], n: () => void) => void } = {};
    guardPasswordChange({ data: { user: { id: 'u1', role: 'rider', mustChangePassword: true } }, use: (fn: never) => void (mw.fn = fn) } as never);
    expect(() => mw.fn!(['orders:list', {}], next)).not.toThrow();
    expect(next).not.toHaveBeenCalled();
  });

  it('does not touch accounts without the flag, nor guests', () => {
    for (const user of [{ id: 'u2', role: 'rider' }, { id: 'u3', role: 'customer', mustChangePassword: false }, { id: 'guest', role: 'guest' }, undefined]) {
      const { send } = socketOf(user as never);
      const { next, ack } = send('orders:list');
      expect(next).toHaveBeenCalled();
      expect(ack).not.toHaveBeenCalled();
    }
  });
});

describe('the REST guard', () => {
  const ctxFor = (handler: object, klass: object = class {}) => ({ getHandler: () => handler, getClass: () => klass }) as unknown as ExecutionContext;
  const guard = new JwtAuthGuard(new Reflector());
  const run = (user: object | false, handler: object) => guard.handleRequest(null, user as never, undefined, ctxFor(handler));

  it('refuses a flagged account with 403 and the code, except on the routes marked open', () => {
    class Routes {
      secret() {}
      @AllowPendingPasswordChange()
      me() {}
    }
    const flagged = { id: 'u1', role: 'rider', mustChangePassword: true };
    try {
      run(flagged, Routes.prototype.secret);
      throw new Error('should have refused');
    } catch (e) {
      expect((e as { getStatus: () => number }).getStatus()).toBe(403);
      expect((e as { getResponse: () => unknown }).getResponse()).toMatchObject({ code: PASSWORD_CHANGE_REQUIRED });
    }
    expect(run(flagged, Routes.prototype.me)).toBe(flagged);
    const plain = { id: 'u2', role: 'rider', mustChangePassword: false };
    expect(run(plain, Routes.prototype.secret)).toBe(plain);
  });

  it('an unauthenticated request is still 401 (the base guard decides first)', () => {
    expect(() => run(false, () => undefined)).toThrow(/Unauthorized/);
  });

  it('the strategy reads the claim from the access token', () => {
    const strat = new JwtStrategy({ get: () => 'access-secret' } as never);
    expect(strat.validate({ sub: 'u1', role: 'rider', email: 'a@b.c', typ: 'access', pwc: true })).toMatchObject({ id: 'u1', mustChangePassword: true });
    expect(strat.validate({ sub: 'u1', role: 'rider', email: 'a@b.c', typ: 'access' })).not.toHaveProperty('mustChangePassword');
  });
});

describe('gateway', () => {
  const as = (role: string, id = 'a1') => ({ id: 'sock-1', data: { user: { id, role, name: `${role} name` } } }) as never;
  let audit: { record: jest.Mock };
  let kicked: string[];
  let gw: RealtimeGateway;

  beforeEach(() => {
    audit = { record: jest.fn(async () => undefined) };
    kicked = [];
    const server = { in: (room: string) => ({ disconnectSockets: () => void kicked.push(room), fetchSockets: async () => [{ id: 'sock-1', disconnect: () => kicked.push('self') }, { id: 'sock-2', disconnect: () => kicked.push(`${room}#other`) }] }) };
    gw = Object.assign(Object.create(RealtimeGateway.prototype), { audit, roles, auth, users, server, logger: { log: () => undefined, warn: () => undefined } });
  });

  it('roles:resetPassword: super admin only, never oneself; the password is in the reply but not in the audit; sessions and sockets end', async () => {
    const made = await makeStaff();
    for (const role of ['admin_operations', 'admin_finance', 'warehouse_staff', 'rider', 'customer']) {
      expect(await gw.rolesResetPassword(as(role), { userId: made.id })).toEqual({ ok: false, error: 'Super admin only.' });
    }
    expect(await gw.rolesResetPassword(as('admin', made.id), { userId: made.id })).toMatchObject({ ok: false, error: expect.stringMatching(/your own password/) });
    expect(audit.record).not.toHaveBeenCalled();
    const before = (await reload(made.id)).tokenVersion;

    const res = await gw.rolesResetPassword(as('admin'), { userId: made.id });
    expect(res).toMatchObject({ ok: true, data: { id: made.id, role: 'rider', tempPassword: expect.any(String) } });
    const password = (res as { data: { tempPassword: string } }).data.tempPassword;
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'staff.password_reissued', entity: 'user', entityId: made.id, actor: 'admin name' });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain(password);
    expect((await reload(made.id)).tokenVersion).toBeGreaterThan(before + 0); // revoked
    expect(kicked).toContain(RealtimeEmitter.userRoom(made.id));
    expect((await reload(made.id)).mustChangePassword).toBe(true);
  });

  it('roles:resetPassword for a customer is refused and audits nothing', async () => {
    const c = await auth.register({ email: 'cust@somba.test', password: 'Customer-1234', name: 'Cust' });
    expect(await gw.rolesResetPassword(as('admin'), { userId: c.user.id })).toMatchObject({ ok: false });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('roles:updateStaff: super admin only, never oneself, audited with old and new address', async () => {
    const made = await makeStaff();
    expect(await gw.rolesUpdateStaff(as('admin_operations'), { userId: made.id, email: 'x@somba.test' })).toEqual({ ok: false, error: 'Super admin only.' });
    expect(await gw.rolesUpdateStaff(as('admin', made.id), { userId: made.id, email: 'x@somba.test' })).toMatchObject({ ok: false, error: expect.stringMatching(/your own e-mail/) });
    expect(audit.record).not.toHaveBeenCalled();
    const res = await gw.rolesUpdateStaff(as('admin'), { userId: made.id, email: 'Fixed@Somba.test' });
    expect(res).toEqual({ ok: true, data: { id: made.id, email: 'fixed@somba.test', role: 'rider' } });
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'staff.email_changed', detail: 'rider rider@somba.test -> fixed@somba.test' });
    expect(await gw.rolesUpdateStaff(as('admin'), { userId: made.id, email: 'bad' })).toMatchObject({ ok: false, error: 'Enter a valid email.' });
  });

  it('a flagged account connects but joins only its own room and sees mustChangePassword in `ready`; an unflagged one joins its role', async () => {
    const made = await makeStaff();
    const login = (await auth.login({ email: 'rider@somba.test', password: made.tempPassword })) as { accessToken: string };
    const joined: string[] = [];
    const emitted: [string, unknown][] = [];
    const client = { handshake: { auth: { token: login.accessToken }, headers: {} }, data: {}, join: async (r: string) => void joined.push(r), emit: (e: string, p: unknown) => void emitted.push([e, p]), disconnect: jest.fn() };
    await gw.handleConnection(client as never);
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(joined).toEqual([RealtimeEmitter.userRoom(made.id)]);
    expect((client.data as { user: { mustChangePassword?: boolean } }).user.mustChangePassword).toBe(true);
    expect(emitted[0]).toMatchObject(['ready', { user: { mustChangePassword: true } }]);

    // The change lifts the hold on this socket, joins the role room and ends the other sockets.
    (client as unknown as { id: string }).id = 'sock-1';
    const res = await gw.meChangePassword(client as never, { current: made.tempPassword, next: 'A-brand-new-pass-1' });
    expect(res).toMatchObject({ ok: true, data: { mustChangePassword: false } });
    expect((client.data as { user: { mustChangePassword?: boolean } }).user.mustChangePassword).toBeUndefined();
    expect(joined).toContain(RealtimeEmitter.roleRoom('rider'));
    expect(kicked).toContain(`${RealtimeEmitter.userRoom(made.id)}#other`);
    expect(kicked).not.toContain('self');
    expect(audit.record.mock.calls[0][0]).toMatchObject({ action: 'password.changed_first' });
    expect(JSON.stringify(audit.record.mock.calls)).not.toContain('A-brand-new-pass-1');

    const plain = await auth.register({ email: 'cust@somba.test', password: 'Customer-1234', name: 'Cust' });
    const joined2: string[] = [];
    await gw.handleConnection({ handshake: { auth: { token: plain.accessToken }, headers: {} }, data: {}, join: async (r: string) => void joined2.push(r), emit: () => undefined, disconnect: jest.fn() } as never);
    expect(joined2).toEqual([RealtimeEmitter.userRoom(plain.user.id), RealtimeEmitter.roleRoom('customer')]);
  });

  it('a wrong current password through the socket stays refused, and the hold stays', async () => {
    const made = await makeStaff();
    const client = as('rider', made.id);
    (client as unknown as { data: { user: { mustChangePassword: boolean } } }).data.user.mustChangePassword = true;
    expect(await gw.meChangePassword(client, { current: 'wrong-one', next: 'A-brand-new-pass-1' })).toEqual({ ok: false, error: 'Current password is incorrect.' });
    expect((client as unknown as { data: { user: { mustChangePassword: boolean } } }).data.user.mustChangePassword).toBe(true);
    expect((await reload(made.id)).mustChangePassword).toBe(true);
  });
});
