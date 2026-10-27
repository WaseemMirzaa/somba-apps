/**
 * The driver's transfer runs (UC-11, docs/contracts/areas.md): one card per run instead of one task per parcel. This is the
 * web twin of the Flutter rider app (`rider-app/lib/services/rider_store.dart`, `TransferRun` in `models.dart`, `_runCard` in
 * `deliveries_screen.dart`) and uses the same words (`rider-app/lib/l10n/messages.dart`, same keys), so a rider who uses both reads the
 * same thing. Pure functions only; the live hook is `rider-runs-live.ts`.
 *
 * No imports: `npm test` loads this file on its own.
 */

export type RunStatus = "planned" | "dispatched" | "arrived" | "closed";

/** A run as `rider:runs` and the `run:updated` push send it (`Run` in the contract), read defensively. */
export interface RiderRun {
  id: string;
  reference: string;
  fromHubId: string | null;
  fromHubName: string | null;
  toHubId: string | null;
  toHubName: string | null;
  riderId: string | null;
  riderName: string | null;
  status: RunStatus;
  taskIds: string[];
  count: number;
  receivedCount: number;
  missingCount: number;
  /** The driver reported the run on the road (`Run.inTransit`); false when the payload does not say (older servers). */
  inTransit: boolean;
  hop: number | null;
  hops: number | null;
}

/** What a run needs to know about a parcel (a rider task). */
export interface RunParcel {
  id: string;
  status: string;
  runId?: string | null;
  hop?: number | null;
  hops?: number | null;
}

const STATUSES: readonly string[] = ["planned", "dispatched", "arrived", "closed"];
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const whole = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : 0);

/** One run from a payload; null when it has no id. A server that reports the road as a status of its own reads as "dispatched, on the road". */
export function parseRun(raw: unknown): RiderRun | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as Record<string, unknown>;
  if (typeof j.id !== "string" || !j.id) return null;
  const ids = Array.isArray(j.taskIds) ? j.taskIds.filter((e): e is string => typeof e === "string" && e !== "") : [];
  const rawStatus = text(j.status) ?? "planned";
  return {
    id: j.id,
    reference: text(j.reference) ?? "",
    fromHubId: text(j.fromHubId),
    fromHubName: text(j.fromHubName),
    toHubId: text(j.toHubId),
    toHubName: text(j.toHubName),
    riderId: text(j.riderId),
    riderName: text(j.riderName),
    status: rawStatus === "in_transit" ? "dispatched" : STATUSES.includes(rawStatus) ? (rawStatus as RunStatus) : "planned",
    taskIds: ids,
    count: typeof j.count === "number" ? whole(j.count) : ids.length,
    receivedCount: whole(j.receivedCount),
    missingCount: whole(j.missingCount),
    // `inTransit` is the contract's flag; an older payload may only carry the time, or report the road as a status.
    inTransit: typeof j.inTransit === "boolean" ? j.inTransit : rawStatus === "in_transit" || text(j.inTransitAt) !== null,
    hop: typeof j.hop === "number" ? Math.trunc(j.hop) : null,
    hops: typeof j.hops === "number" ? Math.trunc(j.hops) : null,
  };
}

/** The runs of a `rider:runs` reply: a list, or `{ runs: [...] }`. Entries without an id are skipped. */
export function parseRuns(raw: unknown): RiderRun[] {
  const list = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { runs?: unknown }).runs : raw;
  if (!Array.isArray(list)) return [];
  return list.map(parseRun).filter((r): r is RiderRun => r !== null);
}

/** Every parcel scanned in at the receiving warehouse: the driver's part of the run is over. */
export const allReceived = (r: Pick<RiderRun, "count" | "receivedCount">): boolean => r.count > 0 && r.receivedCount >= r.count;

/**
 * Still the driver's job: not closed, and not every parcel scanned in yet (a run the warehouse has fully received
 * moves to Done even before the desk closes it).
 */
export const isActiveRun = (r: Pick<RiderRun, "status" | "count" | "receivedCount">): boolean => r.status !== "closed" && !(r.status === "arrived" && allReceived(r));

/**
 * A `run:updated` push. A run assigned to this driver is added (first) or updated in place; one that is not (or no longer)
 * this driver's leaves the list: each driver only ever sees their own runs. Anything malformed leaves the list as it is.
 */
export function applyRunPush(runs: RiderRun[], pushed: unknown, myId: string | null | undefined): RiderRun[] {
  const run = parseRun(pushed);
  if (!run) return runs;
  const i = runs.findIndex((r) => r.id === run.id);
  const mine = !!run.riderId && run.riderId === myId;
  if (!mine) return i === -1 ? runs : runs.filter((r) => r.id !== run.id);
  if (i === -1) return [run, ...runs];
  const next = [...runs];
  next[i] = run;
  return next;
}

/** The runs this driver sees: the ones assigned to them (a payload without a driver is read as theirs, like the app does). */
export const mineOnly = (runs: RiderRun[], myId: string | null | undefined): RiderRun[] => runs.filter((r) => r.riderId == null || r.riderId === myId);

/** The parcels of `run` in the driver's list. */
export function parcelsOfRun<T extends RunParcel>(run: Pick<RiderRun, "id" | "taskIds">, tasks: T[]): T[] {
  return tasks.filter((t) => t.runId === run.id || run.taskIds.includes(t.id));
}

/** Does this parcel travel in one of the driver's known runs? Then it shows inside that run's card, not on its own. */
export const inKnownRun = (t: Pick<RunParcel, "runId">, runs: Pick<RiderRun, "id">[]): boolean => !!t.runId && runs.some((r) => r.id === t.runId);

/** The tasks that stand on their own: everything but the parcels of a known run. */
export const looseTasks = <T extends RunParcel>(tasks: T[], runs: Pick<RiderRun, "id">[]): T[] => tasks.filter((t) => !inKnownRun(t, runs));

/**
 * The run is on the road: the server says so (`inTransit`), the driver said so here before the server's answer carried it
 * (`remembered`), or (older servers) all its parcels are in transit.
 */
export function runOnRoad(run: Pick<RiderRun, "id" | "inTransit">, parcels: Pick<RunParcel, "status">[], remembered: ReadonlySet<string> = new Set()): boolean {
  if (run.inTransit || remembered.has(run.id)) return true;
  return parcels.length > 0 && parcels.every((t) => t.status === "in_transit");
}

/** The hop of a multi-hop route the run carries: from the run, else from its parcels. Null on a single-hop route. */
export function runHop(run: Pick<RiderRun, "hop" | "hops">, parcels: Pick<RunParcel, "hop" | "hops">[]): { hop: number; hops: number } | null {
  if (run.hop != null && run.hops != null && run.hops > 1) return { hop: run.hop, hops: run.hops };
  for (const t of parcels) if (t.hops != null && t.hops > 1 && t.hop != null) return { hop: t.hop, hops: t.hops };
  return null;
}

/** Where the run is, in the one word the card shows: Being prepared / Loaded / On the road / Handed over / Closed. */
export type RunBadge = "planned" | "loaded" | "onRoad" | "arrived" | "closed";

export function runBadge(run: Pick<RiderRun, "status">, onRoad: boolean): RunBadge {
  if (run.status === "closed") return "closed";
  if (run.status === "arrived") return "arrived";
  if (onRoad) return "onRoad";
  return run.status === "dispatched" ? "loaded" : "planned";
}

/** The task status the list filter compares with ("Assigned", "Picked up", "On the way", "Done"). */
export function runTaskStatus(badge: RunBadge): "assigned" | "picked_up" | "in_transit" | "delivered" {
  return badge === "planned" ? "assigned" : badge === "loaded" ? "picked_up" : badge === "onRoad" ? "in_transit" : "delivered";
}

/** The colour of the status badge (the app: closed and handed over green, on the road blue, loaded amber, being prepared grey). */
export function runBadgeVariant(badge: RunBadge): "success" | "primary" | "warning" | "default" {
  return badge === "closed" || badge === "arrived" ? "success" : badge === "onRoad" ? "primary" : badge === "loaded" ? "warning" : "default";
}

/**
 * Words, by the app's own keys (`rider-app/lib/l10n/messages.dart`): [English, French]. `npm test` compares each pair with the
 * Dart file, so the two stay the same text.
 */
export const RUN_WORDS: Record<string, readonly [string, string]> = {
  kind_run: ["Transfer run", "Tournée de transfert"],
  run_status_planned: ["Being prepared", "En préparation"],
  run_status_loaded: ["Loaded", "Chargée"],
  run_status_on_road: ["On the road", "En route"],
  run_status_arrived: ["Handed over", "Remise"],
  run_status_closed: ["Closed", "Clôturée"],
  run_wait_load: ["The warehouse is loading this run. You will be told when it is ready.", "L’entrepôt charge cette tournée. Vous serez prévenu quand elle sera prête."],
  run_parcels: ["Parcels ({n})", "Colis ({n})"],
  run_received: ["{got} of {n} parcels scanned in", "{got} colis sur {n} réceptionnés"],
  run_received_one: ["{got} of {n} parcels scanned in", "{got} colis sur {n} réceptionné"],
  run_missing_one: ["1 parcel missing from this run", "1 colis manquant dans cette tournée"],
  run_missing_many: ["{n} parcels missing from this run", "{n} colis manquants dans cette tournée"],
  run_title_one: ["Transfer to {name} · 1 parcel", "Transfert vers {name} · 1 colis"],
  run_title_many: ["Transfer to {name} · {n} parcels", "Transfert vers {name} · {n} colis"],
  act_run_on_road: ["On the road", "En route"],
  done_run_on_road: ["The run is on the road. Safe ride!", "La tournée est en route. Bonne route !"],
  hop_route: ["Hop {hop}/{hops} · {from} → {to}", "Étape {hop}/{hops} · {from} → {to}"],
  handover_at: ["Hand over at {name}", "À remettre à {name}"],
  handed_over_at: ["Handed over at {name}", "Remis à {name}"],
  waiting_scan: ["Waiting for the warehouse to scan it in", "En attente du scan par l’entrepôt"],
  run_all_in: ["Every parcel was scanned in. This run is done.", "Tous les colis ont été réceptionnés. Cette tournée est terminée."],
  leg_transfer_from: ["From {name}", "Depuis {name}"],
  the_warehouse: ["the warehouse", "l’entrepôt"],
  navigate_hub: ["Navigate to the warehouse", "Naviguer vers l’entrepôt"],
};

/** A word by its key, with `{placeholders}` filled in. */
export function runWord(key: keyof typeof RUN_WORDS | string, fr: boolean, params: Record<string, string | number> = {}): string {
  const pair = RUN_WORDS[key];
  const raw = pair ? pair[fr ? 1 : 0] : key;
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

const BADGE_KEY: Record<RunBadge, string> = {
  planned: "run_status_planned",
  loaded: "run_status_loaded",
  onRoad: "run_status_on_road",
  arrived: "run_status_arrived",
  closed: "run_status_closed",
};
export const runBadgeText = (badge: RunBadge, fr: boolean): string => runWord(BADGE_KEY[badge], fr);

/** "Transfer to Entrepôt Limete · 4 parcels" ("1 parcel" for one). */
export const runTitleText = (to: string | null, n: number, fr: boolean): string => runWord(n === 1 ? "run_title_one" : "run_title_many", fr, { name: to ?? runWord("the_warehouse", fr), n });

/** "2 of 4 parcels scanned in"; the French reads singular up to one ("1 colis sur 1 réceptionné"), like the app. */
export const runReceivedText = (got: number, n: number, fr: boolean): string => runWord(got <= 1 ? "run_received_one" : "run_received", fr, { got, n });

/** "1 parcel missing from this run" / "2 parcels missing from this run". */
export const runMissingText = (n: number, fr: boolean): string => runWord(n === 1 ? "run_missing_one" : "run_missing_many", fr, { n });

/** "Hop 1/2 · Entrepôt Limete → Entrepôt Kinshasa". */
export const runHopText = (h: { hop: number; hops: number }, from: string | null, to: string | null, fr: boolean): string =>
  runWord("hop_route", fr, { hop: h.hop, hops: h.hops, from: from ?? runWord("the_warehouse", fr), to: to ?? runWord("the_warehouse", fr) });

/** What the hand-over box says: its title, and the line under it (none while the run has not reached the road). */
export function handoverText(run: Pick<RiderRun, "status" | "toHubName" | "count" | "receivedCount">, onRoad: boolean, fr: boolean): { title: string; hint: string | null } {
  const to = run.toHubName ?? runWord("the_warehouse", fr);
  if (allReceived(run)) return { title: runWord("handed_over_at", fr, { name: to }), hint: runWord("run_all_in", fr) };
  return { title: runWord("handover_at", fr, { name: to }), hint: onRoad || run.status === "arrived" ? runWord("waiting_scan", fr) : null };
}

/** Is the hand-over box shown? Not while the warehouse is still loading, and not on a closed run unless everything came in. */
export const showsHandover = (run: Pick<RiderRun, "status" | "count" | "receivedCount">): boolean => run.status !== "planned" && (run.status !== "closed" || allReceived(run));

/** Is the "received" line shown? Once the run arrived or closed, or as soon as one parcel was scanned in. */
export const showsReceived = (run: Pick<RiderRun, "status" | "receivedCount">): boolean => run.status === "arrived" || run.status === "closed" || run.receivedCount > 0;
