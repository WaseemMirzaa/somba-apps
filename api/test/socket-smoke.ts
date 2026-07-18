/* eslint-disable no-console */
/**
 * End-to-end smoke test proving the real-time interconnection:
 *   customer places order  →  admin dashboard + warehouse see it live
 *   rider accepts + advances delivery  →  customer order status updates live
 *   rider streams location  →  customer receives live position
 *
 * Requires the API running (npm run start:dev) and a seeded DB (npm run seed).
 */
import { io, Socket } from 'socket.io-client';

const API = process.env.SMOKE_API ?? 'http://localhost:3001';
const PASSWORD = 'Somba@2026';

async function login(email: string): Promise<{ token: string; id: string }> {
  const res = await fetch(`${API}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login ${email} failed: ${res.status}`);
  const json = (await res.json()) as {
    accessToken: string;
    user: { id: string };
  };
  return { token: json.accessToken, id: json.user.id };
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = io(API, { auth: { token }, transports: ['websocket'] });
    socket.on('ready', () => resolve(socket));
    socket.on('unauthorized', (m) => reject(new Error(`unauthorized: ${m?.message}`)));
    socket.on('connect_error', (e) => reject(e));
    setTimeout(() => reject(new Error('connect timeout')), 5000);
  });
}

function emit<T>(socket: Socket, event: string, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.timeout(5000).emit(event, body ?? {}, (err: Error | null, res: any) => {
      if (err) return reject(err);
      if (res && res.ok === false) return reject(new Error(res.error));
      resolve(res.data as T);
    });
  });
}

function waitFor<T>(socket: Socket, event: string, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

let passed = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? '✅' : '❌'} ${name}`);
  if (cond) passed++;
  else throw new Error(`assertion failed: ${name}`);
}

async function main() {
  console.log(`\n▶ Somba realtime smoke test against ${API}\n`);

  const customer = await login('customer@somba.app');
  const admin = await login('admin@somba.app');
  const rider = await login('rider@somba.app');
  check('logged in customer/admin/rider over REST', true);

  const cSock = await connect(customer.token);
  const aSock = await connect(admin.token);
  const rSock = await connect(rider.token);
  check('all three opened authenticated sockets', true);

  const products = await emit<any[]>(cSock, 'products:list');
  check(`customer fetched ${products.length} products over socket`, products.length > 0);

  // Admin dashboard listens for the new order pushed in real time.
  const adminSawOrder = waitFor<any>(aSock, 'order:created');
  const created = await emit<any>(cSock, 'orders:create', {
    items: [{ productId: products[0].id, qty: 2 }],
    paymentMethod: 'cod',
    deliveryFeeUsd: 3,
    shippingAddress: JSON.stringify({ city: 'Kinshasa', line1: '12 Ave du Commerce' }),
  });
  check('order created + acked to customer', !!created.id && created.status === 'pending');
  const pushed = await adminSawOrder;
  check('admin dashboard received order:created LIVE', pushed.id === created.id);

  // Rider claims and advances the delivery; customer status follows live.
  const unassigned = await emit<any[]>(rSock, 'delivery:unassigned');
  const task = unassigned.find((t) => t.orderId === created.id);
  check('rider sees the unassigned delivery task', !!task);

  const custStatusUpdate = waitFor<any>(cSock, 'order:updated');
  await emit(rSock, 'delivery:accept', { taskId: task.id });
  const afterAccept = await custStatusUpdate;
  check('customer got order:updated when rider accepted', afterAccept.id === created.id);

  const custOutForDelivery = waitFor<any>(cSock, 'order:updated');
  await emit(rSock, 'delivery:updateStatus', { taskId: task.id, status: 'in_transit' });
  const ofd = await custOutForDelivery;
  check('customer order → out_for_delivery live', ofd.status === 'out_for_delivery');

  // Live rider location stream.
  const custLoc = waitFor<any>(cSock, 'delivery:location');
  await emit(rSock, 'delivery:location', { taskId: task.id, lat: -4.325, lng: 15.322 });
  const loc = await custLoc;
  check('customer received live rider location', loc.lat === -4.325 && loc.lng === 15.322);

  // Notifications were persisted + pushed.
  const notifs = await emit<any[]>(cSock, 'notifications:list');
  check(`customer has ${notifs.length} realtime notifications`, notifs.length >= 2);

  cSock.close();
  aSock.close();
  rSock.close();
  console.log(`\n🎉 All ${passed} checks passed.\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error('\n💥 Smoke test failed:', err.message);
  process.exit(1);
});
