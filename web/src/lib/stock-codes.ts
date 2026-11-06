/**
 * Pure helpers for the warehouse stock screens and the camera scanner (no imports: tested with `npm test`).
 * Codes the floor scans or types: a parcel label (`PKG-AB12CD` / `BC-AB12CD`), a product shelf label (`SKU-ab12cd`),
 * a bin label (`BIN-A-01`, or just the bin code), or an order reference.
 */

export type ScanKind = "parcel" | "sku" | "bin" | "order" | "unknown";
export interface ScanCode {
  kind: ScanKind;
  /** The code in its canonical spelling (what the server and the lists expect). */
  value: string;
}

/** Keyboard-wedge scanners and cameras can add control characters or spaces; the longest label we print is well under 120. */
export function cleanScan(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
}

export function classifyScan(raw: string): ScanCode {
  const v = cleanScan(raw);
  if (!v) return { kind: "unknown", value: "" };
  let m = /^(?:pkg|bc)[-:]?([0-9a-f]{6})$/i.exec(v);
  if (m) return { kind: "parcel", value: `PKG-${m[1].toUpperCase()}` };
  m = /^sku[-:]?([0-9a-f]{6})$/i.exec(v);
  if (m) return { kind: "sku", value: `SKU-${m[1].toLowerCase()}` };
  m = /^bin[-:](.+)$/i.exec(v);
  if (m && m[1].trim()) return { kind: "bin", value: m[1].trim().toUpperCase() };
  if (/^som-[0-9a-z]+$/i.test(v)) return { kind: "order", value: v.toUpperCase() };
  return { kind: "unknown", value: v };
}

/** A fresh request reference, so a double tap or a retry is recorded once by the server. */
export function makeRef(prefix = "web"): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const id = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}:${id}`.slice(0, 64);
}

/** "+3", "-2", "0". */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `-${Math.abs(n)}` : "0";
}

/** A camera can send the same code many times a second; accept it again only after `gapMs`, or when it changed. */
export function shouldAccept(prev: { text: string; at: number } | null, text: string, now: number, gapMs = 1800): boolean {
  if (!text) return false;
  if (!prev || prev.text !== text) return true;
  return now - prev.at >= gapMs;
}

export type CameraProblem = "unsupported" | "insecure" | "denied" | "none" | "busy" | "failed";

/** Why the camera could not start, from the browser's error name; the screen then says so and keeps the typed field. */
export function cameraProblem(err: unknown, ctx: { hasMediaDevices: boolean; secure: boolean }): CameraProblem {
  if (!ctx.hasMediaDevices) return ctx.secure ? "unsupported" : "insecure";
  const name = (err as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "none";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "failed";
}

export const CAMERA_PROBLEM_TEXT: Record<CameraProblem, { en: string; fr: string }> = {
  unsupported: { en: "This browser cannot use the camera. Type the code or use a scanner.", fr: "Ce navigateur ne peut pas utiliser la caméra. Saisissez le code ou utilisez un lecteur." },
  insecure: { en: "The camera only works on a secure (https) page. Type the code or use a scanner.", fr: "La caméra ne fonctionne que sur une page sécurisée (https). Saisissez le code ou utilisez un lecteur." },
  denied: { en: "Camera access was refused. Allow it in the browser settings, or type the code.", fr: "L'accès à la caméra a été refusé. Autorisez-le dans les réglages du navigateur, ou saisissez le code." },
  none: { en: "No camera found on this device. Type the code or use a scanner.", fr: "Aucune caméra trouvée sur cet appareil. Saisissez le code ou utilisez un lecteur." },
  busy: { en: "The camera is in use by another app. Close it and try again, or type the code.", fr: "La caméra est utilisée par une autre application. Fermez-la et réessayez, ou saisissez le code." },
  failed: { en: "The camera could not start. Type the code or use a scanner.", fr: "La caméra n'a pas pu démarrer. Saisissez le code ou utilisez un lecteur." },
};

// ── ledger wording ───────────────────────────────────────────────────────────────

export const KIND_TEXT: Record<string, { en: string; fr: string }> = {
  receive: { en: "Received", fr: "Reçu" },
  move: { en: "Moved", fr: "Déplacé" },
  count: { en: "Counted", fr: "Compté" },
  stock_out: { en: "Stocked out", fr: "Sorti du stock" },
};

export const REASON_TEXT: Record<string, { en: string; fr: string }> = {
  parcel: { en: "From a parcel", fr: "Depuis un colis" },
  manual_receipt: { en: "Manual receipt", fr: "Réception manuelle" },
  return_restock: { en: "Return put back", fr: "Retour remis en stock" },
  relocation: { en: "Bin move", fr: "Changement d'emplacement" },
  cycle_count: { en: "Cycle count", fr: "Inventaire tournant" },
  dispatch: { en: "Dispatched", fr: "Expédié" },
  damaged: { en: "Damaged", fr: "Endommagé" },
  lost: { en: "Lost", fr: "Perdu" },
  sample: { en: "Sample", fr: "Échantillon" },
  seller_pickup: { en: "Seller took it back", fr: "Repris par le vendeur" },
  other: { en: "Other", fr: "Autre" },
};

/** The reasons offered for a manual stock-out / a manual receipt (the server accepts the same lists). */
export const OUT_REASON_LIST = ["damaged", "lost", "sample", "seller_pickup", "other"] as const;
export const RECEIVE_REASON_LIST = ["manual_receipt", "return_restock", "other"] as const;

export function wording(map: Record<string, { en: string; fr: string }>, key: string, fr: boolean): string {
  const t = map[key];
  return t ? (fr ? t.fr : t.en) : key;
}

/** What a ledger line says in one sentence-ish cell: "3 from A-01 to B-02", "+10 into A-01", "-2 from A-01", "A-01: 8 counted, 10 expected". */
export function movementText(l: { kind: string; qty: number; delta: number; fromBinCode?: string | null; toBinCode?: string | null; expectedQty?: number | null; countedQty?: number | null }, fr: boolean): string {
  switch (l.kind) {
    case "receive":
      return fr ? `+${l.qty} dans ${l.toBinCode ?? "?"}` : `+${l.qty} into ${l.toBinCode ?? "?"}`;
    case "stock_out":
      return fr ? `-${l.qty} depuis ${l.fromBinCode ?? "?"}` : `-${l.qty} from ${l.fromBinCode ?? "?"}`;
    case "move":
      return fr ? `${l.qty} de ${l.fromBinCode ?? "?"} vers ${l.toBinCode ?? "?"}` : `${l.qty} from ${l.fromBinCode ?? "?"} to ${l.toBinCode ?? "?"}`;
    case "count":
      return fr
        ? `${l.toBinCode ?? "?"} : ${l.countedQty ?? 0} compté, ${l.expectedQty ?? 0} attendu (${signed(l.delta)})`
        : `${l.toBinCode ?? "?"}: ${l.countedQty ?? 0} counted, ${l.expectedQty ?? 0} expected (${signed(l.delta)})`;
    default:
      return String(l.qty);
  }
}

/** A cycle-count line as the counter sees it: blank = not counted, a number = counted; the variance against what the system expects. */
export function varianceOf(expected: number, counted: string): number | null {
  if (counted.trim() === "") return null;
  const n = Number(counted);
  if (!Number.isInteger(n) || n < 0) return null;
  return n - expected;
}

/** The count sheet lines to send: only the lines the counter filled in, as whole numbers, with what the counter saw as `expected`. */
export function countLines(rows: { productId: string; variant: string; expected: number; counted: string }[]): { productId: string; variant: string; counted: number; expected: number }[] {
  const out: { productId: string; variant: string; counted: number; expected: number }[] = [];
  for (const r of rows) {
    if (varianceOf(r.expected, r.counted) === null) continue;
    out.push({ productId: r.productId, variant: r.variant, counted: Number(r.counted), expected: r.expected });
  }
  return out;
}

/** A positive whole number from a text field, or null. */
export function wholeUnits(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,7}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 1_000_000 ? n : null;
}
