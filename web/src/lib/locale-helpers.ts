import { type Locale, type TranslationKey, t } from "@/lib/i18n";
import { STORE_NAME_FR } from "@/lib/mock-data";

/** Pick bilingual string: `en` required, `fr` optional fallback to `en`. */
export function L(locale: Locale, en: string, fr?: string): string {
  return locale === "fr" && fr ? fr : en;
}

/** Map raw status slugs to i18n keys where available. */
const STATUS_KEY_MAP: Record<string, TranslationKey> = {
  pending: "pending",
  processing: "processing",
  delivered: "delivered",
  cancelled: "cancelled",
  approved: "approved",
  open: "open",
  resolved: "resolved",
  rejected: "rejected",
  paid: "paid",
  requested: "requested",
  completed: "completed",
  active: "active",
  blocked: "blocked",
  in_progress: "inProgress",
  in_transit: "inTransit",
  received: "received",
  packed: "packed",
  dispatched: "dispatched",
  ready: "ready",
  live: "live",
  draft: "draft",
  reconciled: "reconciled",
  variance: "variance",
  reviewed: "reviewed",
  scheduled: "scheduled",
  low: "low",
  medium: "medium",
  high: "high",
  setup: "setup",
  suspended: "suspended",
};

const SEVERITY_KEY_MAP: Record<string, TranslationKey> = {
  low: "low",
  medium: "medium",
  high: "high",
};

export function severityLabel(locale: Locale, severity: string): string {
  const key = SEVERITY_KEY_MAP[severity.toLowerCase()];
  if (key) return t(locale, key);
  return severity;
}

export function statusLabel(locale: Locale, status: string): string {
  const key = STATUS_KEY_MAP[status.toLowerCase().replace(/\s+/g, "_")];
  if (key) return t(locale, key);
  return status.replace(/_/g, " ");
}

const TIMELINE_FR: Record<string, string> = {
  Placed: "Passée",
  Paid: "Payée",
  Packed: "Emballée",
  Picked: "Collectée",
  Warehouse: "Entrepôt",
  Dispatched: "Expédiée",
  Delivered: "Livrée",
  Confirmed: "Confirmée",
  Ready: "Prête",
  "Return requested": "Retour demandé",
  "Approved — pickup scheduled": "Approuvé — enlèvement planifié",
  "Pickup completed": "Enlèvement effectué",
  "Seller review": "Examen vendeur",
  "Batch Created": "Lot créé",
  "Rider Assigned": "Livreur assigné",
  "In Transit": "En transit",
  Collected: "Collecté",
  Arrived: "Arrivé",
  Sorted: "Trié",
  Registered: "Inscrit",
  Approved: "Approuvé",
  "First Product Added": "Premier produit ajouté",
  "First Sale": "Première vente",
  Created: "Créé",
};

export function timelineLabel(locale: Locale, label: string, labelFr?: string): string {
  if (locale === "fr") return labelFr ?? TIMELINE_FR[label] ?? label;
  return label;
}

export function mapTimelineEvents<
  T extends { time: string; label: string; labelFr?: string; detail?: string; done?: boolean },
>(locale: Locale, events: T[]) {
  return events.map((e) => ({
    ...e,
    label: timelineLabel(locale, e.label, e.labelFr),
  }));
}

export type BilingualText = { en: string; fr: string };

export function bilingual(locale: Locale, pair: BilingualText): string {
  return locale === "fr" ? pair.fr : pair.en;
}

/** Resolve optional `*Fr` field on mock records. */
export function localizedField(
  locale: Locale,
  en: string | undefined,
  fr?: string
): string {
  if (!en) return "";
  return L(locale, en, fr);
}

/** Resolve store/seller display name from mock lookup or optional override. */
export function storeNameLabel(locale: Locale, name: string, nameFr?: string): string {
  return L(locale, name, nameFr ?? STORE_NAME_FR[name]);
}
