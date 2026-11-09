import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';
import { io as connect, Socket as ClientSocket } from 'socket.io-client';
import { DataSource } from 'typeorm';
import { AccountDeletionService } from '../auth/account-deletion.service';
import { AuthService } from '../auth/auth.service';
import { Order, User } from '../database/entities';
import { testDb } from '../testing/test-db';
import { UsersService } from '../users/users.service';
import { RealtimeEmitter } from './realtime-emitter';
import { RealtimeGateway } from './realtime.gateway';

/**
 * `me:delete` / `me:deleteCheck` as a client calls them over a real Socket.IO connection (audit C-04): the refusal comes
 * from the data layer, so a raw socket call, with no app in front, is refused exactly the same way, and a deletion that
 * goes through drops every open connection of the account.
 */
const PASSWORD = 'Password-123';
const config = { get: (k: string) => (k === 'jwt.secret' ? 'access-secret' : '15m') };

let ds: DataSource;
let http: HttpServer;
let io: Server;
let users: UsersService;
let clients: ClientSocket[];
let spies: { forgetBuyer: jest.Mock; unregisterUser: jest.Mock; removeAddress: jest.Mock };
let seq = 0;

beforeEach(async () => {
  ds = await testDb();
  users = new UsersService(ds.getRepository(User));
  const auth = new AuthService(users, new JwtService({}), config as never, new AccountDeletionService(ds));
  spies = { forgetBuyer: jest.fn(async () => undefined), unregisterUser: jest.fn(async () => undefined), removeAddress: jest.fn(async () => undefined) };
  http = createServer();
  io = new Server(http);
  const gw = Object.assign(Object.create(RealtimeGateway.prototype), {
    auth,
    server: io,
    kit: { account: { check: async () => undefined, finish: async () => undefined }, chat: { forgetBuyer: spies.forgetBuyer } },
    addresses: { list: async () => [{ id: 'a1' }], remove: spies.removeAddress },
    push: { unregisterUser: spies.unregisterUser },
  }) as RealtimeGateway;
  // The same room names and handlers the real gateway uses; the user comes from the handshake like `handleConnection` sets it.
  io.on('connection', async (socket) => {
    const id = String(socket.handshake.auth.id);
    (socket.data as { user: unknown }).user = { id, role: 'customer', name: 'Marie' };
    await socket.join(RealtimeEmitter.userRoom(id));
    socket.on('me:delete', async (body: unknown, ack: (r: unknown) => void) => ack(await gw.meDelete(socket as never, body as never)));
    socket.on('me:deleteCheck', async (_b: unknown, ack: (r: unknown) => void) => ack(await gw.meDeleteCheck(socket as never)));
    socket.emit('ready');
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

const open = async (id: string) => {
  const c = connect(`http://localhost:${(http.address() as AddressInfo).port}`, { auth: { id }, transports: ['websocket'], forceNew: true });
  clients.push(c);
  await new Promise<void>((r) => c.once('ready', () => r()));
  return c;
};
const call = (c: ClientSocket, event: string, body: unknown = {}) => new Promise<any>((r) => c.emit(event, body, r));
async function customer(walletBalance: number) {
  const u = await users.create({ email: `c${++seq}@x.test`, passwordHash: await bcrypt.hash(PASSWORD, 4), name: 'Marie', role: 'customer' });
  u.walletBalance = walletBalance;
  return users.save(u);
}

describe('me:delete over the socket', () => {
  it('is refused with money in the wallet: the reason in words, the code and the list; nothing is erased', async () => {
    const u = await customer(204);
    const c = await open(u.id);
    const ack = await call(c, 'me:delete', { password: PASSWORD });
    expect(ack).toMatchObject({
      ok: false,
      code: 'account_blocked',
      blockers: [{ kind: 'wallet_balance', count: 1, amountUsd: 204 }],
    });
    expect(ack.error).toContain('Your wallet still holds $204.00: spend it or ask support to pay it out first.');
    expect(await ds.getRepository(User).findOneByOrFail({ id: u.id })).toMatchObject({ active: true, name: 'Marie', walletBalance: 204 });
    expect(spies.forgetBuyer).not.toHaveBeenCalled();
    expect(spies.removeAddress).not.toHaveBeenCalled();
    expect(spies.unregisterUser).not.toHaveBeenCalled();
    expect(c.connected).toBe(true);
  });

  it('is refused with an order on the road, over a second raw connection too', async () => {
    const u = await customer(0);
    await ds.getRepository(Order).save(ds.getRepository(Order).create({ reference: 'SOM-1', customerId: u.id, customerName: 'Marie', status: 'out_for_delivery', shippingAddress: '{"line1":"1 rue"}' }));
    const ack = await call(await open(u.id), 'me:delete', { password: PASSWORD });
    expect(ack).toMatchObject({ ok: false, code: 'account_blocked', blockers: [{ kind: 'open_order', count: 1 }] });
    await expect(ds.getRepository(Order).findOneByOrFail({ reference: 'SOM-1' })).resolves.toMatchObject({ customerName: 'Marie', shippingAddress: '{"line1":"1 rue"}' });
  });

  it('me:deleteCheck lists the reasons without changing anything', async () => {
    const u = await customer(204);
    const c = await open(u.id);
    expect(await call(c, 'me:deleteCheck')).toEqual({ ok: true, data: { canDelete: false, blockers: [{ kind: 'wallet_balance', count: 1, amountUsd: 204 }] } });
    expect((await ds.getRepository(User).findOneByOrFail({ id: u.id })).active).toBe(true);
    const free = await customer(0);
    expect(await call(await open(free.id), 'me:deleteCheck')).toEqual({ ok: true, data: { canDelete: true, blockers: [] } });
  });

  it('with nothing outstanding it works and signs out every open connection of the account, not only this one', async () => {
    const u = await customer(0);
    const bystander = await customer(0);
    const phone = await open(u.id);
    const web = await open(u.id);
    const other = await open(bystander.id);
    const dropped = Promise.all([phone, web].map((c) => new Promise<void>((r) => c.once('disconnect', () => r()))));
    const ack = await call(phone, 'me:delete', { password: PASSWORD });
    expect(ack).toEqual({ ok: true, data: { deleted: true } });
    await dropped;
    expect(phone.connected).toBe(false);
    expect(web.connected).toBe(false);
    expect(other.connected).toBe(true);
    expect(spies.forgetBuyer).toHaveBeenCalledWith(u.id);
    expect(spies.removeAddress).toHaveBeenCalled();
    expect(spies.unregisterUser).toHaveBeenCalledWith(u.id);
    expect(await ds.getRepository(User).findOneByOrFail({ id: u.id })).toMatchObject({ active: false, name: 'Deleted user' });
  });
});
