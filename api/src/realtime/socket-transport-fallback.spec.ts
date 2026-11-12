import { createServer, request as httpRequest, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import { Server } from 'socket.io';
import { io as connect, Socket as ClientSocket } from 'socket.io-client';

/**
 * A network that refuses the websocket upgrade (a mobile-data proxy, a firewall, a reverse proxy without the Upgrade
 * headers) must not cut the web shop off. The shop's client options are the ones in
 * web/src/lib/realtime/transports.ts (kept in step by hand: the web test asserts them, this spec proves they work).
 *
 * The "front" below is a proxy like nginx WITHOUT the upgrade headers: plain requests are passed on, an upgrade is
 * dropped. The API behind it is a real Socket.IO server that reads the token from the connect packet, as the gateway does.
 */
const WEB_CLIENT = { transports: ['polling', 'websocket'], upgrade: true, rememberUpgrade: true };

let api: HttpServer;
let io: Server;
let front: HttpServer;
let url: string;
const clients: ClientSocket[] = [];

beforeEach(async () => {
  api = createServer();
  io = new Server(api, { cors: { origin: true, credentials: true } });
  io.on('connection', (socket) => {
    const token = (socket.handshake.auth as { token?: string }).token;
    socket.emit('ready', { user: token ? { id: token } : { id: 'guest' }, transport: socket.conn.transport.name });
    socket.on('echo', (body: unknown, ack: (r: unknown) => void) => ack({ ok: true, data: body }));
  });
  await new Promise<void>((r) => api.listen(0, r));
  const apiPort = (api.address() as AddressInfo).port;

  front = createServer((req, res) => {
    const up = httpRequest({ host: '127.0.0.1', port: apiPort, path: req.url, method: req.method, headers: { ...req.headers, connection: 'close' } }, (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    });
    req.pipe(up);
  });
  front.on('upgrade', (_req, socket) => socket.destroy()); // the upgrade never reaches the API
  await new Promise<void>((r) => front.listen(0, r));
  url = `http://127.0.0.1:${(front.address() as AddressInfo).port}`;
});
afterEach(async () => {
  clients.forEach((c) => c.close());
  clients.length = 0;
  io.close();
  await new Promise((r) => front.close(r));
});

const open = (opts: Record<string, unknown>) => {
  const c = connect(url, { forceNew: true, reconnection: false, ...opts });
  clients.push(c);
  return c;
};
const ready = (c: ClientSocket) => new Promise<any>((res, rej) => {
  c.once('ready', res);
  c.once('connect_error', rej);
});
const call = (c: ClientSocket, event: string, body: unknown) => new Promise<any>((r) => c.emit(event, body, r));

describe('socket transport behind a proxy that drops the websocket upgrade', () => {
  it('the old websocket-only client never connects (the bug)', async () => {
    const c = open({ transports: ['websocket'] });
    await expect(ready(c)).rejects.toBeTruthy();
    expect(c.connected).toBe(false);
  });

  it('the shop client connects over polling and answers requests', async () => {
    const c = open(WEB_CLIENT);
    const hello = await ready(c);
    expect(hello.user.id).toBe('guest');
    expect(hello.transport).toBe('polling');
    expect(await call(c, 'echo', { n: 1 })).toEqual({ ok: true, data: { n: 1 } });
    // the upgrade probe is refused: the connection stays on polling and keeps working
    await new Promise((r) => setTimeout(r, 400));
    expect(c.connected).toBe(true);
    expect(c.io.engine.transport.name).toBe('polling');
    expect(await call(c, 'echo', { n: 2 })).toEqual({ ok: true, data: { n: 2 } });
  });

  it('the token reaches the server on polling too, from the connect packet and not from the URL', async () => {
    const c = open({ ...WEB_CLIENT, auth: (cb: (d: object) => void) => cb({ token: 'user-42' }) });
    const hello = await ready(c);
    expect(hello.user.id).toBe('user-42');
    expect(hello.transport).toBe('polling');
  });
});

describe('socket transport on a network that allows the upgrade', () => {
  it('the shop client upgrades to a websocket', async () => {
    const direct = connect(`http://127.0.0.1:${(api.address() as AddressInfo).port}`, { ...WEB_CLIENT, forceNew: true, reconnection: false });
    clients.push(direct);
    await ready(direct);
    // the upgrade runs in the background: wait for it (it may already be done)
    for (let i = 0; i < 100 && direct.io.engine.transport.name !== 'websocket'; i++) await new Promise((r) => setTimeout(r, 100));
    expect(direct.io.engine.transport.name).toBe('websocket');
    expect(await call(direct, 'echo', 'x')).toEqual({ ok: true, data: 'x' });
  });
});
