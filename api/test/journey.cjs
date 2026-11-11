/* Helpers for smokes that are not ABOUT routing but need a parcel to travel: an order's journey is
 * seller --pickup--> hub --(transfer)--> hub --delivery--> customer, and riders never accept tasks themselves,
 * so a smoke lets an admin assign and scan the legs and hand the delivery to its rider. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rawReq = (s, ev, b = {}) => new Promise((r) => s.emit(ev, b, r));
let req = rawReq; // wrapped with the box scans below, once `withScans` exists

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

/**
 * Parcel scanning (`requireParcelScan`, on by default): a smoke that is not ABOUT scanning wraps its `req` with this, so each move
 * that needs the boxes scanned first gets them, the way the people do it.
 *   - a rider's `delivery:updateStatus` picked_up / delivered: the rider scans every box (pickup / dropoff stage) on that socket first;
 *   - the desk's `logistics:scanIn` / `dispatchTransfer` / `scanOut` by `taskId`: staff scan each box BY CODE (the last one completes the leg);
 *   - `logistics:dispatchRun` / `receiveRun`: the boxes of every parcel of the run are scanned out / marked in first (`opts.admin` marks
 *     the arrival by hand with a reason, as a desk admin may).
 * Legs without parcels (nothing was marked ready through the seller) pass straight through. Scanning itself is tested in parcel-scan-smoke.cjs.
 */
function withScans(raw, opts = {}) {
  const riderScanAll = async (sock, taskId, stage) => {
    const l = await raw(sock, 'rider:legParcels', { taskId });
    if (!l?.ok) return;
    for (const p of l.data.parcels) {
      if (stage === 'pickup' ? p.pickupScannedAt : p.dropoffScannedAt) continue;
      await raw(sock, 'rider:scanParcel', { taskId, code: p.code, stage });
    }
  };
  const staffScanAll = async (sock, taskId, mode) => {
    const l = await raw(sock, 'logistics:legParcels', { taskId });
    if (!l?.ok) return null;
    let last = null;
    for (const p of l.data.parcels.filter((x) => (mode === 'in' ? !x.dropoffScannedAt : !x.pickupScannedAt))) {
      last = await raw(sock, mode === 'in' ? 'logistics:scanIn' : 'logistics:dispatchTransfer', { code: p.code });
    }
    return last;
  };
  const runTasks = async (sock, runId) => (((await raw(sock, 'logistics:runs', {}))?.data ?? []).find((r) => r.id === runId)?.taskIds ?? []);
  return async (sock, ev, b = {}) => {
    if (ev === 'delivery:updateStatus' && (b.status === 'picked_up' || b.status === 'delivered')) await riderScanAll(sock, b.taskId, b.status === 'picked_up' ? 'pickup' : 'dropoff');
    if ((ev === 'logistics:scanIn' || ev === 'warehouse:receive') && b.taskId && !b.code) {
      const r = await staffScanAll(sock, b.taskId, 'in');
      // `warehouse:receive` (the old name) answers the task itself, `logistics:scanIn` { task, next }.
      if (r?.ok && r.data?.completed) return ev === 'warehouse:receive' ? { ok: true, data: r.data.task } : r;
    }
    if ((ev === 'logistics:dispatchTransfer' || ev === 'logistics:scanOut') && b.taskId && !b.code) {
      const r = await staffScanAll(sock, b.taskId, 'out');
      if (r?.ok && r.data?.completed) return r;
    }
    if (ev === 'logistics:dispatchRun' && b.runId) for (const id of await runTasks(sock, b.runId)) await staffScanAll(sock, id, 'out');
    if (ev === 'logistics:receiveRun' && b.runId && opts.admin) {
      for (const id of Array.isArray(b.taskIds) && b.taskIds.length ? b.taskIds : await runTasks(sock, b.runId)) {
        const l = await raw(opts.admin.sock, 'logistics:legParcels', { taskId: id });
        for (const p of l?.data?.parcels ?? []) if (!p.dropoffScannedAt) await raw(opts.admin.sock, 'logistics:markParcel', { taskId: id, code: p.code, stage: 'dropoff', reason: 'smoke: run arrived' });
      }
    }
    return raw(sock, ev, b);
  };
}

req = withScans(rawReq);

module.exports = { hubId, tasksOf, toDelivery, receiveAtHub, withScans };
