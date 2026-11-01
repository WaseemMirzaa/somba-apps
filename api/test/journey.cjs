/* Helpers for smokes that are not ABOUT routing but need a parcel to travel: an order's journey is
 * seller --pickup--> hub --(transfer)--> hub --delivery--> customer, and riders never accept tasks themselves,
 * so a smoke lets an admin assign and scan the legs and hand the delivery to its rider. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const req = (s, ev, b = {}) => new Promise((r) => s.emit(ev, b, r));

/** Id of a demo warehouse by name (the seed's Entrepôt Kinshasa covers the whole province, holds the demo rider and serves every plain Kinshasa address). */
async function hubId(admin, name = 'Entrepôt Kinshasa') {
  return ((await req(admin.sock, 'hubs:list')).data ?? []).find((h) => h.name === name)?.id ?? null;
}

/** The order's tasks (admins see every warehouse; newest 200 tasks). */
async function tasksOf(admin, orderId) {
  return ((await req(admin.sock, 'delivery:list', { limit: 500 })).data ?? []).filter((t) => t.orderId === orderId);
}

/**
 * Walk the order's pickup / transfer legs: assign each to `rider` (who must work at the leg's warehouse) and scan it in,
 * until the delivery leg exists. Returns that delivery task; when `assign` is not false it is assigned to `rider` too.
 */
async function toDelivery(admin, rider, orderId, opts = {}) {
  for (let i = 0; i < 14; i++) {
    const live = (await tasksOf(admin, orderId)).filter((t) => t.status !== 'failed');
    const d = live.find((t) => t.kind === 'delivery');
    if (d) {
      if (d.status === 'unassigned' && opts.assign !== false) {
        const a = await req(admin.sock, 'logistics:assign', { taskId: d.id, riderId: rider.user.id });
        if (!a.ok) throw new Error(`assign delivery: ${a.error}`);
        return { ...d, status: 'assigned', riderId: rider.user.id };
      }
      return d;
    }
    const p = live.find((t) => ['pickup', 'transfer'].includes(t.kind) && t.status !== 'delivered');
    if (!p) {
      await sleep(250);
      continue;
    }
    if (p.status === 'unassigned') {
      const a = await req(admin.sock, 'logistics:assign', { taskId: p.id, riderId: rider.user.id });
      if (!a.ok) throw new Error(`assign ${p.kind}: ${a.error}`);
    }
    await req(rider.sock, 'delivery:updateStatus', { taskId: p.id, status: 'picked_up' }); // the rider collects it first
    const s = await req(admin.sock, 'logistics:scanIn', { taskId: p.id });
    if (!s.ok) throw new Error(`scan in ${p.kind}: ${s.error}`);
  }
  throw new Error(`no delivery leg appeared for order ${orderId}`);
}

/** Scan the order's pickups in (after a rider collected them) until its delivery leg exists. */
async function receiveAtHub(admin, orderId, rider) {
  for (let i = 0; i < 14; i++) {
    const live = (await tasksOf(admin, orderId)).filter((t) => t.status !== 'failed');
    const d = live.find((t) => t.kind === 'delivery');
    if (d) return d;
    const p = live.find((t) => ['pickup', 'transfer'].includes(t.kind) && t.status !== 'delivered');
    if (!p) {
      await sleep(250);
      continue;
    }
    // A parcel nobody collected cannot be scanned in: the rider collects it first.
    if (!rider) throw new Error(`receiveAtHub needs a rider to collect the ${p.kind}`);
    if (p.status === 'unassigned') {
      const a = await req(admin.sock, 'logistics:assign', { taskId: p.id, riderId: rider.user.id });
      if (!a.ok) throw new Error(`assign ${p.kind}: ${a.error}`);
    }
    await req(rider.sock, 'delivery:updateStatus', { taskId: p.id, status: 'picked_up' });
    const s = await req(admin.sock, 'logistics:scanIn', { taskId: p.id });
    if (!s.ok) throw new Error(`scan in ${p.kind}: ${s.error}`);
  }
  throw new Error(`no delivery leg appeared for order ${orderId}`);
}

module.exports = { hubId, tasksOf, toDelivery, receiveAtHub };
