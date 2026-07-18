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

  // Snapshot-line checkout (a storefront on its own catalog, no productId).
  const adminSawSnapshot = waitFor<any>(aSock, 'order:created');
  const snapOrder = await emit<any>(cSock, 'orders:create', {
    items: [
      { name: 'Samsung Galaxy S24 Ultra', priceUsd: 1199, qty: 1, variant: 'Titanium' },
    ],
    paymentMethod: 'stripe_card',
    deliveryFeeUsd: 0,
  });
  check(
    'snapshot-line order created (no productId)',
    !!snapOrder.id && snapOrder.totalUsd === 1199,
  );
  const snapPushed = await adminSawSnapshot;
  check('admin saw snapshot order LIVE', snapPushed.id === snapOrder.id);

  // ---- Wallet + payments ----
  const startBal = (await emit<{ balance: number }>(cSock, 'wallet:get')).balance;
  check(`customer wallet has a balance ($${startBal})`, startBal > 0);

  const walletUpdated = waitFor<{ balance: number }>(cSock, 'wallet:updated');
  await emit(cSock, 'wallet:topup', { amountUsd: 100, method: 'airtel_money' });
  const afterTopup = await walletUpdated;
  check('wallet top-up pushed new balance live', afterTopup.balance === startBal + 100);

  // Pay for an order with the wallet — balance must drop live.
  const walletDebited = waitFor<{ balance: number }>(cSock, 'wallet:updated');
  const walletOrder = await emit<any>(cSock, 'orders:create', {
    items: [{ name: 'Wallet Item', priceUsd: 40, qty: 1 }],
    paymentMethod: 'wallet',
    deliveryFeeUsd: 0,
  });
  check('wallet order confirmed immediately', walletOrder.status === 'confirmed');
  const afterDebit = await walletDebited;
  check('wallet debited live on payment', afterDebit.balance === afterTopup.balance - 40);

  const payments = await emit<any[]>(cSock, 'payments:list');
  check(`customer has ${payments.length} payment records`, payments.length >= 1);

  // Admin/finance refund to wallet — balance must rise live.
  const walletRefunded = waitFor<{ balance: number }>(cSock, 'wallet:updated');
  await emit(aSock, 'orders:refund', { orderId: walletOrder.id, toWallet: true });
  const afterRefund = await walletRefunded;
  check('refund credited wallet live', afterRefund.balance === afterDebit.balance + 40);

  // Insufficient-funds guard.
  let rejected = false;
  try {
    await emit(cSock, 'orders:create', {
      items: [{ name: 'Too expensive', priceUsd: 999999, qty: 1 }],
      paymentMethod: 'wallet',
      deliveryFeeUsd: 0,
    });
  } catch {
    rejected = true;
  }
  check('wallet order rejected when funds insufficient', rejected);

  // ---- Payouts (seller ⇄ finance) ----
  const seller = await login('seller@somba.app');
  const sSock = await connect(seller.token);
  const financeSawPayout = waitFor<any>(aSock, 'payout:created');
  const payout = await emit<any>(sSock, 'payouts:request', {
    amountUsd: 120,
    method: 'bank',
  });
  check('seller requested a payout', payout.status === 'requested');
  const payoutSeen = await financeSawPayout;
  check('admin/finance saw payout:created LIVE', payoutSeen.id === payout.id);

  const sellerBalBefore = (await emit<{ balance: number }>(sSock, 'wallet:get')).balance;
  const sellerCredited = waitFor<{ balance: number }>(sSock, 'wallet:updated');
  await emit(aSock, 'payouts:approve', { payoutId: payout.id });
  const sellerAfter = await sellerCredited;
  check('approved payout credited seller wallet live', sellerAfter.balance === sellerBalBefore + 120);

  // ---- Disputes / returns (customer ⇄ admin) ----
  const adminSawDispute = waitFor<any>(aSock, 'dispute:created');
  const dispute = await emit<any>(cSock, 'disputes:open', {
    orderId: created.id,
    type: 'return',
    reason: 'Item arrived damaged',
  });
  check('customer opened a return', dispute.status === 'open');
  const disputeSeen = await adminSawDispute;
  check('admin saw dispute:created LIVE', disputeSeen.id === dispute.id);

  const custDisputeResolved = waitFor<any>(cSock, 'dispute:updated');
  await emit(aSock, 'disputes:resolve', { disputeId: dispute.id, refund: false });
  const resolved = await custDisputeResolved;
  check('customer got dispute resolution live', resolved.status === 'resolved');

  sSock.close();

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
