/**
 * Parcel scanning as pure rules, shared by the rider portal and the warehouse desk: which stage a leg is in, how many
 * boxes are scanned, when a button must wait, and the lines shown to the person scanning (English and French).
 * The server checks every move again (`api/src/logistics/parcels.service.ts`); this only keeps the screens honest.
 *
 * No imports: `npm test` loads this file on its own.
 */

export type ScanStage = "pickup" | "dropoff";

/** One box of a leg, as the server sends it (`TaskView.parcels`). */
export interface BoxLine {
  code: string;
  groupId?: string | null;
  boxNo: number;
  boxCount: number;
  pickupScannedAt: string | null;
  dropoffScannedAt: string | null;
}

/** The KOMORIKO box code: `PKG-` + 8 characters from the alphabet without 0, O, 1, I. */
const BOX_CODE = /^PKG-?([2-9A-HJ-NP-Z]{8})$/;

/** `PKG-7KQ2M9XA` in its canonical spelling from what was scanned or typed; null when it is not a box code. */
export function normalizeBoxCode(raw: string): string | null {
  const m = BOX_CODE.exec(raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().toUpperCase());
  return m ? `PKG-${m[1]}` : null;
}

export const isBoxCode = (raw: string): boolean => normalizeBoxCode(raw) !== null;

/** The stage a rider scans in: pickup while the leg is assigned, drop-off once collected; none for any other status. */
export function scanStageFor(status: string): ScanStage | null {
  if (status === "assigned") return "pickup";
  if (status === "picked_up" || status === "in_transit") return "dropoff";
  return null;
}

const scannedAt = (p: BoxLine, stage: ScanStage): string | null => (stage === "pickup" ? p.pickupScannedAt : p.dropoffScannedAt);

/** How many boxes carry a scan at this stage. */
export function stageCounts(parcels: readonly BoxLine[] | null | undefined, stage: ScanStage): { scanned: number; total: number } {
  const list = parcels ?? [];
  return { scanned: list.filter((p) => !!scannedAt(p, stage)).length, total: list.length };
}

export const stageComplete = (parcels: readonly BoxLine[] | null | undefined, stage: ScanStage): boolean => {
  const c = stageCounts(parcels, stage);
  return c.scanned >= c.total;
};

/**
 * Must the button wait? Only when the platform requires scanning and the leg has labelled boxes that are not all
 * scanned at this stage. No boxes, or the rule switched off: nothing changes.
 */
export function scanGate(
  leg: { parcels?: readonly BoxLine[] | null; scanRequired?: boolean | null },
  stage: ScanStage,
): { blocked: boolean; scanned: number; total: number } {
  const c = stageCounts(leg.parcels, stage);
  return { blocked: !!leg.scanRequired && c.total > 0 && c.scanned < c.total, ...c };
}

/** Which stage must be complete before a rider action. `in_transit` ("On my way") is never gated. */
export function actionStage(action: "picked_up" | "in_transit" | "deliver" | "handover"): ScanStage | null {
  if (action === "picked_up") return "pickup";
  if (action === "deliver" || action === "handover") return "dropoff";
  return null;
}

/** The gate of one rider action on a leg (not blocked for an action that is not gated). */
export function actionGate(
  leg: { parcels?: readonly BoxLine[] | null; scanRequired?: boolean | null },
  action: "picked_up" | "in_transit" | "deliver" | "handover",
): { blocked: boolean; scanned: number; total: number } {
  const stage = actionStage(action);
  return stage ? scanGate(leg, stage) : { blocked: false, scanned: 0, total: 0 };
}

/** "2 of 3 scanned". */
export const scanCounterText = (scanned: number, total: number, fr: boolean): string => (fr ? `${scanned} sur ${total} scannés` : `${scanned} of ${total} scanned`);

/** "Scan every parcel first: 2 of 3 scanned." (the server's own sentence, shown under a waiting button). */
export const scanFirstText = (scanned: number, total: number, fr: boolean): string =>
  fr ? `Scannez tous les colis d'abord : ${scanned} sur ${total} scannés.` : `Scan every parcel first: ${scanned} of ${total} scanned.`;

/** "Box 1/3". */
export const boxText = (p: Pick<BoxLine, "boxNo" | "boxCount">, fr: boolean): string => `${fr ? "Carton" : "Box"} ${p.boxNo}/${p.boxCount}`;

/** "1 box" / "2 boxes". */
export const boxesWord = (n: number, fr: boolean): string => (fr ? `${n} carton${n === 1 ? "" : "s"}` : `${n} box${n === 1 ? "" : "es"}`);

/** "2 boxes: PKG-AAAAAAAA (scanned), PKG-BBBBBBBB" for a card; boxes scanned at the stage are marked. Empty when no boxes. */
export function boxesSummary(parcels: readonly BoxLine[] | null | undefined, stage: ScanStage | null, fr: boolean): string {
  const list = parcels ?? [];
  if (!list.length) return "";
  const tag = fr ? "scanné" : "scanned";
  const codes = list.map((p) => (stage && scannedAt(p, stage) ? `${p.code} (${tag})` : p.code)).join(", ");
  return `${boxesWord(list.length, fr)}: ${codes}`;
}

/** The line under the scanner after a rider's scan: "PKG-X scanned · 2 of 3" / "All 3 boxes scanned." */
export function riderScanText(res: { code?: string; scanned?: number; total?: number; already?: boolean }, code: string, fr: boolean): string {
  const c = res.code ?? code;
  const scanned = res.scanned ?? 0;
  const total = res.total ?? 0;
  if (total > 0 && scanned >= total) {
    return res.already
      ? fr ? `${c} déjà scanné. Les ${total} cartons sont scannés.` : `${c} was already scanned. All ${total} boxes are scanned.`
      : fr ? `${c} scanné. Les ${total} cartons sont scannés.` : `${c} scanned. All ${total} boxes are scanned.`;
  }
  const tail = total > 0 ? ` · ${scanCounterText(scanned, total, fr)}` : "";
  return res.already ? (fr ? `${c} déjà scanné${tail}` : `${c} was already scanned${tail}`) : fr ? `${c} scanné${tail}` : `${c} scanned${tail}`;
}

/**
 * The line after a staff scan of one box: "PKG-X received · 1 of 2 boxes in", or "Leg scanned in" when its last box arrived.
 * `in` = arrival at the warehouse (drop-off stage), `out` = handed over (pickup stage).
 */
export function staffScanText(
  r: { code: string; completed: boolean; parcels?: readonly BoxLine[] | null },
  mode: "in" | "out",
  fr: boolean,
): string {
  if (r.completed) return mode === "in" ? (fr ? "Trajet scanné à l'arrivée" : "Leg scanned in") : fr ? "Trajet remis au livreur" : "Leg handed to the rider";
  const c = stageCounts(r.parcels, mode === "in" ? "dropoff" : "pickup");
  const tail = c.total > 0 ? ` · ${c.scanned} ${fr ? "sur" : "of"} ${c.total} ${fr ? (mode === "in" ? "cartons arrivés" : "cartons remis") : mode === "in" ? "boxes in" : "boxes out"}` : "";
  const head = mode === "in" ? (fr ? `${r.code} reçu` : `${r.code} received`) : fr ? `${r.code} remis` : `${r.code} handed over`;
  return head + tail;
}

/** A reason for a hand-marked box needs at least 3 characters. */
export const reasonValid = (reason: string): boolean => reason.trim().length >= 3;

/** The stage the desk marks by hand for a leg: the one its status is waiting for. */
export const handMarkStage = (status: string): ScanStage | null => scanStageFor(status);

/** The boxes of several legs (a transfer run) as one list. */
export function mergeBoxes(legs: readonly { parcels?: readonly BoxLine[] | null }[]): BoxLine[] {
  // Sibling legs (orders packed in the same boxes) list the same box: it counts once, and is scanned when every leg has the scan.
  const byCode = new Map<string, BoxLine[]>();
  for (const b of legs.flatMap((l) => [...(l.parcels ?? [])])) byCode.set(b.code, [...(byCode.get(b.code) ?? []), b]);
  return [...byCode.values()].map((copies) => ({
    ...copies[0],
    pickupScannedAt: copies.every((c) => c.pickupScannedAt) ? copies[0].pickupScannedAt : null,
    dropoffScannedAt: copies.every((c) => c.dropoffScannedAt) ? copies[0].dropoffScannedAt : null,
  }));
}

/** One line of what is in the boxes (`contents` of a checklist). Kept here as a plain shape so this file stays import-free. */
export interface BoxContent {
  name: string;
  nameFr?: string | null;
  variant: string | null;
  variantFr?: string | null;
  qty: number;
  orderReference: string;
}

/** The contents of several legs as one list: a line that two sibling legs both carry is listed once. */
export function mergeContents(legs: readonly { parcelContents?: readonly BoxContent[] | null }[]): BoxContent[] {
  const seen = new Set<string>();
  const out: BoxContent[] = [];
  for (const c of legs.flatMap((l) => [...(l.parcelContents ?? [])])) {
    const key = `${c.orderReference}|${c.name}|${c.variant ?? ""}|${c.qty}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Keep what a scan just answered on top of what the screen was given: a box scanned stays scanned (scans are never undone),
 * boxes the screen no longer lists are dropped, and the screen's list wins when it is the only one.
 */
export function overlayBoxes(given: readonly BoxLine[], live: readonly BoxLine[] | null): BoxLine[] {
  if (!live || !live.length) return [...given];
  if (!given.length) return [...live];
  return given.map((g) => {
    const l = live.find((x) => x.code === g.code);
    return l ? { ...g, pickupScannedAt: g.pickupScannedAt ?? l.pickupScannedAt, dropoffScannedAt: g.dropoffScannedAt ?? l.dropoffScannedAt } : g;
  });
}
