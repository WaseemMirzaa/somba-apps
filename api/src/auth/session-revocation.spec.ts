import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { INestApplication, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import { Server } from 'socket.io';
import { io as connect, Socket as ClientSocket } from 'socket.io-client';
import { DataSource } from 'typeorm';
import { AuditLog, DeliveryTask, Hub, RefreshToken, User } from '../database/entities';
import { RolesService } from '../ops/roles.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { testDb } from '../testing/test-db';
import { UsersService } from '../users/users.service';
import { AccountDeletionService } from './account-deletion.service';
import { AuthController } from './auth.controller';
import { AuthService, JwtPayload } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { REFRESH_REUSE_GRACE_MS, SessionsService } from './sessions.service';
import { totpCode } from './totp';
import { TwoFaGateway } from './twofa.gateway';
import { TwoFaService } from './twofa.service';
import { VerificationService } from './verification.service';

/**
 * Session revocation and refresh rotation, end to end (audit A-02, A-09, AD-03): real Socket.IO clients against the
 * real handshake (`RealtimeGateway.handleConnection`), the real AuthService / VerificationService / SessionsService on
 * an in-memory database, and the real REST controller behind the real JWT strategy.
 */
const PASSWORD = 'Password-123';
let accessTtl = '15m';
const settings: Record<string, string> = { 'jwt.secret': 'access-secret', 'jwt.refreshSecret': 'refresh-secret', 'jwt.refreshTtl': '30d' };
const config = { get: (k: string) => (k === 'jwt.accessTtl' ? accessTtl : settings[k]) };

let ds: DataSource;
let http: HttpServer;
let io: Server;
let users: UsersService;
let jwt: JwtService;
let sessions: SessionsService;
let auth: AuthService;
let twofa: TwoFaService;
let verification: VerificationService;
let gw: RealtimeGateway;
let twofaGw: TwoFaGateway;
let roles: RolesService;
let clients: ClientSocket[];
let seq = 0;

beforeEach(async () => {
  accessTtl = '15m';
  ds = await testDb();
  users = new UsersService(ds.getRepository(User));
  jwt = new JwtService({});
  const emitter = new RealtimeEmitter();
  sessions = new SessionsService(ds.getRepository(User), ds.getRepository(RefreshToken), ds.getRepository(AuditLog), emitter);
  twofa = new TwoFaService(users, jwt, config as never, { toUser: async () => undefined } as never);
  auth = new AuthService(users, jwt, config as never, new AccountDeletionService(ds), twofa, sessions);
  verification = new VerificationService(ds.getRepository('VerificationToken') as never, users, { emailConfigured: true, sendEmail: async () => ({ sent: true }) } as never, sessions);
  roles = new RolesService(ds.getRepository(User), users, emitter, ds.getRepository(Hub), ds.getRepository(DeliveryTask));
  http = createServer();
  io = new Server(http);
  emitter.register(io);
  const audit = { record: jest.fn(async (e: Partial<AuditLog>) => ds.getRepository(AuditLog).save(ds.getRepository(AuditLog).create(e))) };
  // The gateway has dozens of collaborators; the handshake, `auth:reauth`, `me:changePassword` and `staff:setActive` use these.
  gw = Object.assign(Object.create(RealtimeGateway.prototype), {
    auth,
    users,
    roles,
    audit,
    server: io,
    logger: new Logger('test'),
    throttle: { release: () => undefined },
  }) as RealtimeGateway;
  twofaGw = new TwoFaGateway(twofa, users, { get: async () => null } as never, { membership: async () => null } as never, { required: async () => false } as never, audit as never, auth);
  io.on('connection', async (socket) => {
    socket.on('disconnect', () => gw.handleDisconnect(socket as never));
    const bind = (event: string, fn: (body: unknown) => Promise<unknown>) => socket.on(event, async (body: unknown, ack: (r: unknown) => void) => ack(await fn(body)));
    bind('auth:reauth', (b) => gw.authReauth(socket as never, b as never));
    bind('me:changePassword', (b) => gw.meChangePassword(socket as never, b as never));
    bind('staff:setActive', (b) => gw.staffSetActive(socket as never, b as never));
    bind('auth:2fa:enable', (b) => twofaGw.enable(socket as never, b as never));
    bind('auth:2fa:setup', () => twofaGw.setup(socket as never));
    bind('whoami', async () => ({ ok: true, data: (socket.data as { user?: unknown }).user }));
    await gw.handleConnection(socket as never);
  });
  await new Promise<void>((r) => http.listen(0, r));
  clients = [];
});

afterEach(async () => {
  clients.forEach((c) => c.close());
  io.close();
  await new Promise((r) => http.close(r));
  await ds.destroy();
});

const port = () => (http.address() as AddressInfo).port;

/** Open a socket with this access token and wait for `ready` (or reject on `unauthorized`). */
async function open(token: string): Promise<ClientSocket> {
  const c = connect(`http://localhost:${port()}`, { auth: { token }, transports: ['websocket'], forceNew: true, reconnection: false });
  clients.push(c);
  await new Promise<void>((resolve, reject) => {
    c.once('ready', () => resolve());
    c.once('unauthorized', (e: { message: string }) => reject(new Error(e.message)));
  });
  return c;
}
const dropped = (c: ClientSocket) => new Promise<string>((r) => (c.connected ? c.once('disconnect', (reason) => r(reason)) : r('already')));
const call = (c: ClientSocket, event: string, body: unknown = {}) => new Promise<any>((r) => c.emit(event, body, r));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function account(role: User['role'] = 'customer', name = `user${++seq}`) {
  return users.create({ email: `${name}@x.test`, passwordHash: await bcrypt.hash(PASSWORD, 4), name, role });
}
async function signIn(u: User) {
  return (await auth.login({ email: u.email, password: PASSWORD })) as { accessToken: string; refreshToken: string };
}
const jtiOf = (t: string) => jwt.decode<JwtPayload>(t).jti;

describe('A-02: a revocation closes every open socket of the account at once', () => {
  it('a password reset drops the sockets that were open before it (the attacker\'s too); other accounts stay', async () => {
    const victim = await account();
    const bystander = await account();
    const victimPhone = await open((await signIn(victim)).accessToken);
    const attacker = await open((await signIn(victim)).accessToken);
    const other = await open((await signIn(bystander)).accessToken);
    await sleep(50);
    expect(victimPhone.connected && attacker.connected).toBe(true);

    const gone = Promise.all([dropped(victimPhone), dropped(attacker)]);
    const sent = await verification.forgotPassword(victim.email);
    await verification.resetPassword(sent.devToken as string, 'Brand-new-pass-1');
    expect(await gone).toEqual(['io server disconnect', 'io server disconnect']);
    expect(other.connected).toBe(true);
  });

  it('"sign out everywhere" drops every socket, and the same access token cannot open a new one', async () => {
    const u = await account();
    const t = await signIn(u);
    const a = await open(t.accessToken);
    const b = await open((await signIn(u)).accessToken);
    const gone = Promise.all([dropped(a), dropped(b)]);
    await auth.revokeSessions(u.id);
    await gone;
    await expect(open(t.accessToken)).rejects.toThrow('Invalid or missing token.');
    await expect(auth.refresh(t.refreshToken)).rejects.toThrow('Session has been revoked.');
  });

  it('changing the password keeps the socket that asked and drops the others; the fresh tokens work', async () => {
    const u = await account();
    const here = await open((await signIn(u)).accessToken);
    const elsewhere = await open((await signIn(u)).accessToken);
    const gone = dropped(elsewhere);
    const res = await call(here, 'me:changePassword', { current: PASSWORD, next: 'Another-pass-2' });
    expect(res).toMatchObject({ ok: true, data: { accessToken: expect.any(String), refreshToken: expect.any(String) } });
    expect(await gone).toBe('io server disconnect');
    await sleep(50);
    expect(here.connected).toBe(true);
    // This device renews its socket with the fresh token and goes on.
    expect(await call(here, 'auth:reauth', { token: res.data.accessToken })).toMatchObject({ ok: true });
    await expect(auth.refresh(res.data.refreshToken)).resolves.toMatchObject({ accessToken: expect.any(String) });
  });

  it('turning two-factor on drops the other devices and hands this one fresh tokens', async () => {
    const u = await account('seller');
    const here = await open((await signIn(u)).accessToken);
    const old = await signIn(u);
    const elsewhere = await open(old.accessToken);
    const setup = await call(here, 'auth:2fa:setup');
    const gone = dropped(elsewhere);
    const res = await call(here, 'auth:2fa:enable', { code: totpCode(setup.data.secret) });
    expect(res).toMatchObject({ ok: true, data: { enabled: true, recoveryCodes: expect.any(Array), accessToken: expect.any(String), refreshToken: expect.any(String) } });
    await gone;
    await sleep(50);
    expect(here.connected).toBe(true);
    await expect(auth.refresh(old.refreshToken)).rejects.toThrow('Session has been revoked.');
    await expect(auth.refresh(res.data.refreshToken)).resolves.toMatchObject({ accessToken: expect.any(String) });
  });
});

describe('A-02 / A-16: REST checks the session too', () => {
  let app: INestApplication;
  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]), PassportModule],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: UsersService, useValue: users },
        { provide: VerificationService, useValue: verification },
        { provide: ConfigService, useValue: config },
        JwtStrategy,
      ],
    }).compile();
    app = mod.createNestApplication();
    await app.listen(0);
  });
  afterEach(async () => app.close());
  const me = (token: string) => request(app.getHttpServer()).get('/api/v1/auth/me').set('authorization', `Bearer ${token}`);

  it('an access token is refused after "sign out everywhere", even though it has not expired', async () => {
    const u = await account();
    const t = await signIn(u);
    expect((await me(t.accessToken)).status).toBe(200);
    expect((await request(app.getHttpServer()).post('/api/v1/auth/logout-all').set('authorization', `Bearer ${t.accessToken}`)).status).toBe(200);
    const after = await me(t.accessToken);
    expect(after.status).toBe(401);
    expect(after.body.message).toBe('Session has been revoked.');
  });

  it('an access token of an account that was switched off (or deleted) is refused', async () => {
    const u = await account('admin_finance');
    const t = await signIn(u);
    await ds.getRepository(User).update({ id: u.id }, { active: false });
    const after = await me(t.accessToken);
    expect(after.status).toBe(401);
    expect(after.body.message).toBe('This account has been suspended. Contact support.');
  });
});

describe('A-09: refresh tokens rotate, and a reused one ends every session', () => {
  it('each refresh hands out a new refresh token; the newest keeps working', async () => {
    const u = await account();
    let t = (await signIn(u)).refreshToken;
    const seen = new Set([jtiOf(t)]);
    for (let i = 0; i < 4; i++) {
      t = (await auth.refresh(t)).refreshToken;
      expect(jtiOf(t)).toBeTruthy();
      seen.add(jtiOf(t));
    }
    expect(seen.size).toBe(5);
    const rows = await ds.getRepository(RefreshToken).find({ where: { userId: u.id } });
    expect(new Set(rows.map((r) => r.familyId)).size).toBe(1); // one sign-in, one family
  });

  it('inside the grace window the replaced token is answered with the SAME successor (a reload, a retry)', async () => {
    const u = await account();
    const first = (await signIn(u)).refreshToken;
    const a = await auth.refresh(first);
    const b = await auth.refresh(first);
    expect(jtiOf(b.refreshToken)).toBe(jtiOf(a.refreshToken));
    expect(jwt.decode<JwtPayload>(b.refreshToken).exp).toBe(jwt.decode<JwtPayload>(a.refreshToken).exp);
    await expect(auth.refresh(b.refreshToken)).resolves.toMatchObject({ accessToken: expect.any(String) });
  });

  it('two refreshes at the same moment with one token (two tabs) both succeed and agree; nobody is signed out', async () => {
    const u = await account();
    const first = (await signIn(u)).refreshToken;
    const [a, b] = await Promise.all([auth.refresh(first), auth.refresh(first)]);
    expect(jtiOf(a.refreshToken)).toBe(jtiOf(b.refreshToken));
    await expect(auth.refresh(a.refreshToken)).resolves.toBeTruthy();
    expect(await ds.getRepository(AuditLog).count({ where: { action: 'session.refresh_reuse' } })).toBe(0);
  });

  it(`after the grace (${REFRESH_REUSE_GRACE_MS / 1000} s) a reused token is refused, every session ends (sockets too) and it is audited`, async () => {
    const u = await account();
    const stolen = (await signIn(u)).refreshToken;
    const owner = await auth.refresh(stolen); // the owner refreshed; the thief still has the old token
    const otherDevice = await signIn(u);
    const socket = await open(otherDevice.accessToken);
    // Move the use back in time instead of waiting.
    await ds.getRepository(RefreshToken).update({ id: jtiOf(stolen) }, { usedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 5_000) });

    const gone = dropped(socket);
    await expect(auth.refresh(stolen)).rejects.toThrow('Session has been revoked.');
    await gone;
    // The whole family and every other session of the account are gone: the owner's new token, the other device's.
    await expect(auth.refresh(owner.refreshToken)).rejects.toThrow(UnauthorizedException);
    await expect(auth.refresh(otherDevice.refreshToken)).rejects.toThrow(UnauthorizedException);
    const log = await ds.getRepository(AuditLog).findOneOrFail({ where: { action: 'session.refresh_reuse' } });
    expect(log).toMatchObject({ entity: 'user', entityId: u.id, actor: u.name, role: 'customer' });
    // A new sign-in works as usual.
    await expect(signIn(u)).resolves.toMatchObject({ refreshToken: expect.any(String) });
  });

  it('a refresh token issued before rotation (no jti) still works until it expires, so nobody is signed out by the deploy', async () => {
    const u = await account();
    const legacy = await jwt.signAsync({ sub: u.id, role: 'customer', email: u.email, tokenVersion: 0, typ: 'refresh' }, { secret: 'refresh-secret', expiresIn: '30d' });
    const a = await auth.refresh(legacy);
    const b = await auth.refresh(legacy);
    expect(jtiOf(a.refreshToken)).toBeTruthy(); // traded for a tracked token
    expect(jtiOf(b.refreshToken)).not.toBe(jtiOf(a.refreshToken));
    await expect(auth.refresh(a.refreshToken)).resolves.toBeTruthy();
  });

  it('a token whose record is unknown is refused without touching the account', async () => {
    const u = await account();
    const forged = await jwt.signAsync({ sub: u.id, role: 'customer', email: u.email, tokenVersion: 0, typ: 'refresh', jti: 'no-such-id' }, { secret: 'refresh-secret', expiresIn: '30d' });
    await expect(auth.refresh(forged)).rejects.toThrow('Session has been revoked.');
    expect((await users.findById(u.id))!.tokenVersion).toBe(0);
  });
});

describe('A-02: an open socket lives only as long as its access token', () => {
  beforeEach(() => {
    gw.reauthTiming = { leadMs: 1_000, graceMs: 600 };
  });

  it('a socket that does not renew is asked to (`reauth`), then told `unauthorized` (token_expired) and closed', async () => {
    accessTtl = '2s';
    const u = await account();
    const c = await open((await signIn(u)).accessToken);
    const asked = new Promise<{ reason: string }>((r) => c.once('reauth', r));
    const told = new Promise<{ reason: string }>((r) => c.once('unauthorized', r));
    const gone = dropped(c);
    expect(await asked).toMatchObject({ reason: 'token_expiring' });
    expect(await told).toMatchObject({ reason: 'token_expired' });
    expect(await gone).toBe('io server disconnect');
  });

  it('a long session that answers `reauth` with a fresh token stays on the same connection, round after round', async () => {
    accessTtl = '3s';
    gw.reauthTiming = { leadMs: 1_500, graceMs: 1_500 }; // roomy enough for a loaded CI machine
    const u = await account();
    let tokens = await signIn(u);
    const c = await open(tokens.accessToken);
    let renewals = 0;
    c.on('reauth', async () => {
      tokens = await auth.refresh(tokens.refreshToken); // what the apps do: rotate, then renew the socket
      const ack = await call(c, 'auth:reauth', { token: tokens.accessToken });
      if (ack.ok) renewals++;
    });
    let closed = false;
    c.on('disconnect', () => (closed = true));
    await sleep(7_000); // well past the first token's expiry plus grace (3 s + 1.5 s)
    expect(closed).toBe(false);
    expect(renewals).toBeGreaterThanOrEqual(2);
    expect(await call(c, 'whoami')).toMatchObject({ ok: true, data: { id: u.id } });
  }, 15_000);

  it('`auth:reauth` refuses a token of another account, a garbage token and a token of a revoked session', async () => {
    const u = await account();
    const other = await account();
    const t = await signIn(u);
    const c = await open(t.accessToken);
    expect(await call(c, 'auth:reauth', { token: (await signIn(other)).accessToken })).toEqual({ ok: false, error: 'This token belongs to another account.' });
    expect(await call(c, 'auth:reauth', { token: 'garbage' })).toEqual({ ok: false, error: 'Invalid or expired token.' });
    // A token minted before the account's sessions were revoked (the socket itself is closed by the revocation).
    await ds.getRepository(User).increment({ id: u.id }, 'tokenVersion', 1);
    expect(await call(c, 'auth:reauth', { token: t.accessToken })).toEqual({ ok: false, error: 'Session has been revoked.' });
  });

  it('past the deadline, any event closes the socket instead of being served (even if a timer were late)', async () => {
    gw.reauthTiming = { leadMs: 0, graceMs: 60_000 };
    const u = await account();
    const c = await open((await signIn(u)).accessToken);
    const sock = [...io.sockets.sockets.values()].find((s) => (s.data as { user?: { id: string } }).user?.id === u.id)!;
    (sock.data as { authDeadline: number }).authDeadline = Date.now() - 1;
    const told = new Promise<{ reason: string }>((r) => c.once('unauthorized', r));
    const gone = dropped(c);
    const served = jest.fn();
    c.emit('whoami', {}, served);
    expect(await told).toMatchObject({ reason: 'token_expired' });
    expect(await gone).toBe('io server disconnect');
    expect(served).not.toHaveBeenCalled();
  });
});

describe('AD-03: department admins can be switched off and back on by a super admin', () => {
  it('suspending a finance admin drops their sockets, blocks sign-in and REST, is audited; restoring lets them back in', async () => {
    const boss = await account('admin', 'boss');
    const fin = await account('admin_finance', 'fin');
    const finSocket = await open((await signIn(fin)).accessToken);
    const bossSocket = await open((await signIn(boss)).accessToken);
    const gone = dropped(finSocket);
    expect(await call(bossSocket, 'staff:setActive', { userId: fin.id, active: false })).toMatchObject({ ok: true, data: { id: fin.id, role: 'admin_finance', active: false } });
    await gone;
    await expect(signIn(fin)).rejects.toThrow('This account has been suspended. Contact support.');
    const audit = await ds.getRepository(AuditLog).findOneOrFail({ where: { action: 'staff.deactivate', entityId: fin.id } });
    expect(audit).toMatchObject({ actor: 'boss', role: 'admin', detail: 'admin_finance fin@x.test' });

    expect(await call(bossSocket, 'staff:setActive', { userId: fin.id, active: true })).toMatchObject({ ok: true, data: { active: true } });
    expect(await ds.getRepository(AuditLog).count({ where: { action: 'staff.reactivate', entityId: fin.id } })).toBe(1);
    await expect(signIn(fin)).resolves.toMatchObject({ accessToken: expect.any(String) });
  });

  it('every department role can be switched off', async () => {
    const boss = await account('admin', 'boss2');
    const bossSocket = await open((await signIn(boss)).accessToken);
    for (const role of ['admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation'] as const) {
      const u = await account(role);
      expect(await call(bossSocket, 'staff:setActive', { userId: u.id, active: false })).toMatchObject({ ok: true, data: { role, active: false } });
      expect((await users.findById(u.id))!.active).toBe(false);
    }
  });

  it('a super admin cannot switch themselves off, nor the last active super admin; a second super admin can be', async () => {
    const boss = await account('admin', 'solo');
    const bossSocket = await open((await signIn(boss)).accessToken);
    expect(await call(bossSocket, 'staff:setActive', { userId: boss.id, active: false })).toEqual({ ok: false, error: 'You cannot switch off your own account.' });
    // Another super admin exists but is already switched off: `solo` is the last active one (asked by that other account's
    // id through the service, since a switched-off admin has no socket).
    const second = await account('admin', 'second');
    await expect(roles.setStaffActive(boss.id, false, second.id)).resolves.toMatchObject({ active: false }); // two active: allowed
    await expect(roles.setStaffActive(second.id, false, 'someone-else')).rejects.toThrow('You cannot switch off the last active super admin.');
    expect((await users.findById(second.id))!.active).toBe(true);
    await ds.getRepository(User).update({ id: boss.id }, { active: true });
    // Only the super admin may do it at all.
    const fin = await account('admin_finance');
    const finSocket = await open((await signIn(fin)).accessToken);
    expect(await call(finSocket, 'staff:setActive', { userId: second.id, active: false })).toEqual({ ok: false, error: 'Super admin only.' });
  });
});
