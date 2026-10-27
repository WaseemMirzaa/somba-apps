/**
 * Multi-warehouse routes as pure functions: the shortest chain of lanes between two warehouses, by transit time.
 * No I/O, so the router, the scan-in logic and the specs share one definition.
 */

export interface LaneEdge {
  fromHubId: string;
  toHubId: string;
  transitHours: number;
  /** What one parcel pays for this hop; null = the transfer-fee setting. */
  costUsd: number | null;
}

export interface PlannedHop {
  fromHubId: string;
  toHubId: string;
  transitHours: number;
  costUsd: number | null;
}

export interface PlannedRoute {
  hops: PlannedHop[];
  /** Total transit of the lanes used (0 for a direct transfer with no lane behind it). */
  totalHours: number;
  /** One hop (or none): origin and destination are the same warehouse, or the transfer goes straight there. */
  direct: boolean;
  /** Are any active lanes configured at all? With none, every transfer is direct. */
  lanesConfigured: boolean;
  /**
   * false = lanes exist but none connects the two warehouses: the route is a direct hop anyway and admins are told.
   * true otherwise (including "no lanes configured", where direct is the rule).
   */
  connected: boolean;
}

/** The warehouses on a route, origin first: `[A, B, C]` for hops A->B, B->C (`[A]` when nothing to travel). */
export function hubsOnRoute(hops: readonly PlannedHop[], from?: string): string[] {
  if (!hops.length) return from ? [from] : [];
  return [hops[0].fromHubId, ...hops.map((h) => h.toHubId)];
}

/**
 * The route from `from` to `to` over `edges` (active lanes between active warehouses only).
 * Dijkstra by transit hours; ties go to the chain with fewer hops, then to the lower warehouse ids, so the choice is stable.
 */
export function planRoute(edges: readonly LaneEdge[], from: string, to: string): PlannedRoute {
  const lanesConfigured = edges.length > 0;
  if (from === to) return { hops: [], totalHours: 0, direct: true, lanesConfigured, connected: true };
  const direct: PlannedHop = { fromHubId: from, toHubId: to, transitHours: 0, costUsd: null };
  if (!lanesConfigured) return { hops: [direct], totalHours: 0, direct: true, lanesConfigured, connected: true };

  const out = new Map<string, LaneEdge[]>();
  for (const e of edges) out.set(e.fromHubId, [...(out.get(e.fromHubId) ?? []), e]);
  const best = new Map<string, { hours: number; hops: number; via: LaneEdge | null }>([[from, { hours: 0, hops: 0, via: null }]]);
  const done = new Set<string>();
  for (;;) {
    let cur: string | null = null;
    for (const [id, d] of best) {
      if (done.has(id)) continue;
      const c = cur ? (best.get(cur) as { hours: number; hops: number }) : null;
      if (!c || d.hours < c.hours - 1e-9 || (Math.abs(d.hours - c.hours) <= 1e-9 && (d.hops < c.hops || (d.hops === c.hops && id < (cur as string))))) cur = id;
    }
    if (!cur) break;
    done.add(cur);
    if (cur === to) break;
    const here = best.get(cur) as { hours: number; hops: number };
    for (const e of out.get(cur) ?? []) {
      if (done.has(e.toHubId)) continue;
      const cand = { hours: here.hours + Math.max(0, e.transitHours), hops: here.hops + 1, via: e };
      const have = best.get(e.toHubId);
      if (!have || cand.hours < have.hours - 1e-9 || (Math.abs(cand.hours - have.hours) <= 1e-9 && cand.hops < have.hops)) best.set(e.toHubId, cand);
    }
  }
  const reached = best.get(to);
  if (!reached || !done.has(to)) return { hops: [direct], totalHours: 0, direct: true, lanesConfigured, connected: false };
  const hops: PlannedHop[] = [];
  for (let at = to; at !== from; ) {
    const via = (best.get(at) as { via: LaneEdge }).via;
    hops.unshift({ fromHubId: via.fromHubId, toHubId: via.toHubId, transitHours: via.transitHours, costUsd: via.costUsd ?? null });
    at = via.fromHubId;
  }
  return { hops, totalHours: hops.reduce((t, h) => t + h.transitHours, 0), direct: hops.length === 1, lanesConfigured, connected: true };
}

/** The reverse of a recorded route (`[A, B, C]` -> `[C, B, A]`) as hops, when every reversed hop is still a usable lane. */
export function reverseOverLanes(edges: readonly LaneEdge[], hubs: readonly string[]): PlannedHop[] | null {
  if (hubs.length < 2) return null;
  const back = [...hubs].reverse();
  const hops: PlannedHop[] = [];
  for (let i = 0; i < back.length - 1; i++) {
    const e = edges.find((x) => x.fromHubId === back[i] && x.toHubId === back[i + 1]);
    if (!e) return null;
    hops.push({ fromHubId: e.fromHubId, toHubId: e.toHubId, transitHours: e.transitHours, costUsd: e.costUsd ?? null });
  }
  return hops;
}
