import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { DataSource } from 'typeorm';
import { ENTITIES, User } from '../database/entities';
import { AccountDeletionService } from '../auth/account-deletion.service';
import { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

/**
 * A rider's own account, on a real (in-memory SQLite) schema. The rider app and the web rider portal edit name and
 * phone with `me:update` and change the password with `me:changePassword`; both act on the signed-in account only
 * (the socket's user id, never an id from the request), and neither can touch the email, the role or the home warehouse.
 */
describe('a rider edits their own account', () => {
  let ds: DataSource;
  let users: UsersService;
  let auth: AuthService;
  let rider: User;
  let other: User;

  const config = { get: (k: string) => ({ 'jwt.secret': 's3cret', 'jwt.refreshSecret': 'r3fresh', 'jwt.accessTtl': '15m', 'jwt.refreshTtl': '30d' })[k] };

  beforeEach(async () => {
    ds = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ENTITIES, synchronize: true });
    await ds.initialize();
    users = new UsersService(ds.getRepository(User));
    auth = new AuthService(users, new JwtService({}), config as never, new AccountDeletionService(ds));
    const make = async (email: string, role: User['role'], name: string, hubId: string | null) =>
      users.create({ email, passwordHash: await bcrypt.hash('Somba@2026', 4), name, role, phone: '+243810000000' }).then((u) => {
        u.hubId = hubId;
        return users.save(u);
      });
    rider = await make('rider@t.test', 'rider', 'Jean Rider', 'hub-1');
    other = await make('other@t.test', 'rider', 'Paul Other', 'hub-2');
  });
  afterEach(async () => ds.destroy());

  const fresh = (id: string) => users.findById(id) as Promise<User>;

  describe('me:update (name and phone)', () => {
    it('saves a new name and phone, trimmed, and answers with the public account', async () => {
      const saved = await users.updateProfile(rider.id, { name: '  Jean-Pierre Mukendi ', phone: ' +243 81 234 5678 ' });
      expect(saved).toMatchObject({ name: 'Jean-Pierre Mukendi', phone: '+243 81 234 5678' });
      expect(UsersService.toPublic(await fresh(rider.id))).toMatchObject({ name: 'Jean-Pierre Mukendi', phone: '+243 81 234 5678', role: 'rider', email: 'rider@t.test', hubId: 'hub-1' });
    });

    it('a patch with only the name leaves the phone alone, and the phone can be cleared', async () => {
      await users.updateProfile(rider.id, { name: 'Jean R.' });
      expect(await fresh(rider.id)).toMatchObject({ name: 'Jean R.', phone: '+243810000000' });
      await users.updateProfile(rider.id, { phone: '' });
      expect((await fresh(rider.id)).phone).toBeNull();
    });

    it('refuses a name that is too short or too long and a phone that is not a number, saving nothing', async () => {
      await expect(users.updateProfile(rider.id, { name: 'J' })).rejects.toThrow('Name must be 2–80 characters.');
      await expect(users.updateProfile(rider.id, { name: 'x'.repeat(81) })).rejects.toThrow('Name must be 2–80 characters.');
      await expect(users.updateProfile(rider.id, { name: 'Jean Ok', phone: 'call me' })).rejects.toThrow('Enter a valid phone number.');
      expect(await fresh(rider.id)).toMatchObject({ name: 'Jean Rider', phone: '+243810000000' });
    });

    it('a new phone number is no longer verified', async () => {
      await ds.getRepository(User).update({ id: rider.id }, { phoneVerified: true });
      await users.updateProfile(rider.id, { name: 'Jean Rider' });
      expect((await fresh(rider.id)).phoneVerified).toBe(true);
      await users.updateProfile(rider.id, { phone: '+243 99 111 2222' });
      expect((await fresh(rider.id)).phoneVerified).toBe(false);
    });

    it('cannot change the email, role, warehouse, wallet, active flag or password, whatever the request carries', async () => {
      const before = await fresh(rider.id);
      const sneaky = { name: 'Jean Two', email: 'evil@t.test', role: 'admin', hubId: 'hub-2', walletBalance: 9999, active: false, tokenVersion: 7, passwordHash: 'x', emailHash: 'y' };
      await users.updateProfile(rider.id, sneaky as never);
      const after = await fresh(rider.id);
      expect(after.name).toBe('Jean Two');
      expect([after.email, after.emailHash, after.role, after.hubId, after.walletBalance, after.active, after.tokenVersion, after.passwordHash]).toEqual([
        before.email,
        before.emailHash,
        before.role,
        before.hubId,
        before.walletBalance,
        before.active,
        before.tokenVersion,
        before.passwordHash,
      ]);
    });

    it('edits only the account it is given (the gateway passes the socket user, so another rider is never touched)', async () => {
      await users.updateProfile(rider.id, { name: 'Jean Changed', phone: '+243 80 000 0000' });
      expect(await fresh(other.id)).toMatchObject({ name: 'Paul Other', phone: '+243810000000' });
    });
  });

  describe('me:changePassword', () => {
    it('needs the current password and at least 8 characters, and changes nothing on a refusal', async () => {
      await expect(auth.changePassword(rider.id, 'wrong', 'Another@2026')).rejects.toThrow('Current password is incorrect.');
      await expect(auth.changePassword(rider.id, 'Somba@2026', 'short')).rejects.toThrow('New password must be at least 8 characters.');
      expect((await fresh(rider.id)).tokenVersion).toBe(0);
      await expect(auth.login({ email: 'rider@t.test', password: 'Somba@2026' })).resolves.toMatchObject({ user: { id: rider.id } });
    });

    it('the new password signs in, the old one does not, and the answer carries fresh tokens', async () => {
      const first = await auth.login({ email: 'rider@t.test', password: 'Somba@2026' });
      const res = await auth.changePassword(rider.id, 'Somba@2026', 'Another@2026');
      expect(res.user).toMatchObject({ id: rider.id, role: 'rider' });
      await expect(auth.login({ email: 'rider@t.test', password: 'Somba@2026' })).rejects.toThrow('Invalid email or password.');
      await expect(auth.login({ email: 'rider@t.test', password: 'Another@2026' })).resolves.toMatchObject({ user: { id: rider.id } });
      // the tokens of the answer keep this phone signed in...
      expect((await auth.refresh(res.refreshToken)).user.id).toBe(rider.id);
      // ...and every other phone (the earlier session) is signed out
      await expect(auth.refresh((first as { refreshToken: string }).refreshToken)).rejects.toThrow('Session has been revoked.');
    });

    it('does not touch another rider\'s password or sessions', async () => {
      const theirs = (await auth.login({ email: 'other@t.test', password: 'Somba@2026' })) as { refreshToken: string };
      await auth.changePassword(rider.id, 'Somba@2026', 'Another@2026');
      await expect(auth.refresh(theirs.refreshToken)).resolves.toMatchObject({ user: { id: other.id } });
    });
  });

  describe('a revoked or switched-off rider session', () => {
    it('a revoked session cannot refresh: 401 "Session has been revoked." (the app signs the rider out)', async () => {
      const login = (await auth.login({ email: 'rider@t.test', password: 'Somba@2026' })) as { refreshToken: string; accessToken: string };
      await auth.revokeSessions(rider.id);
      await expect(auth.refresh(login.refreshToken)).rejects.toMatchObject({ status: 401, message: 'Session has been revoked.' });
      // the access token still verifies as a signature, but carries the old version: the socket handshake compares it
      const payload = await auth.verifyAccess(login.accessToken);
      expect(payload.tokenVersion).not.toBe((await fresh(rider.id)).tokenVersion);
    });

    it('a rider an admin switched off cannot refresh or sign in: "This account has been suspended."', async () => {
      const login = (await auth.login({ email: 'rider@t.test', password: 'Somba@2026' })) as { refreshToken: string };
      await ds.getRepository(User).update({ id: rider.id }, { active: false });
      await expect(auth.refresh(login.refreshToken)).rejects.toMatchObject({ status: 401, message: 'This account has been suspended. Contact support.' });
      await expect(auth.login({ email: 'rider@t.test', password: 'Somba@2026' })).rejects.toMatchObject({ status: 401 });
    });
  });
});
