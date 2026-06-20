/** Canonical replacement workflow — a single state machine the seller,
 *  warehouse and admin back-office share. Legacy status strings from the mock
 *  data are normalized into this lifecycle. */

export type ReplacementStatus =
  | "requested"
  | "inspecting"
  | "approved"
  | "allocated"
  | "dispatched"
  | "delivered"
  | "closed"
  | "rejected";

/** Forward order of the happy path (rejected is a side-exit). */
export const REPLACEMENT_FLOW: ReplacementStatus[] = [
  "requested",
  "inspecting",
  "approved",
  "allocated",
  "dispatched",
  "delivered",
  "closed",
];

const LEGACY_MAP: Record<string, ReplacementStatus> = {
  pending: "requested",
  requested: "requested",
  processing: "inspecting",
  inspecting: "inspecting",
  inspected: "approved",
  approved: "approved",
  allocated: "allocated",
  shipped: "dispatched",
  dispatched: "dispatched",
  delivered: "delivered",
  completed: "closed",
  closed: "closed",
  rejected: "rejected",
};

export function normalizeReplacementStatus(status: string): ReplacementStatus {
  return LEGACY_MAP[status] ?? "requested";
}

export const REPLACEMENT_STATUS_LABELS: Record<ReplacementStatus, { en: string; fr: string }> = {
  requested: { en: "Requested", fr: "Demandé" },
  inspecting: { en: "Inspecting returned item", fr: "Inspection de l'article" },
  approved: { en: "Approved", fr: "Approuvé" },
  allocated: { en: "New unit allocated", fr: "Nouvelle unité allouée" },
  dispatched: { en: "Dispatched", fr: "Expédié" },
  delivered: { en: "Delivered", fr: "Livré" },
  closed: { en: "Closed", fr: "Clôturé" },
  rejected: { en: "Rejected", fr: "Rejeté" },
};

export function replacementStatusLabel(status: string, fr: boolean): string {
  const s = normalizeReplacementStatus(status);
  return fr ? REPLACEMENT_STATUS_LABELS[s].fr : REPLACEMENT_STATUS_LABELS[s].en;
}

export function replacementStatusVariant(status: string): "success" | "warning" | "info" | "danger" | "default" {
  const s = normalizeReplacementStatus(status);
  if (s === "delivered" || s === "closed") return "success";
  if (s === "rejected") return "danger";
  if (s === "allocated" || s === "dispatched") return "info";
  if (s === "approved" || s === "inspecting") return "warning";
  return "default";
}

export type ReplacementAction = {
  to: ReplacementStatus;
  labelEn: string;
  labelFr: string;
  /** dispatched requires a rider to be assigned first. */
  requiresRider?: boolean;
  danger?: boolean;
};

/** The actions available from the current state. */
export function replacementNextActions(status: string): ReplacementAction[] {
  const s = normalizeReplacementStatus(status);
  switch (s) {
    case "requested":
      return [{ to: "inspecting", labelEn: "Start inspection", labelFr: "Démarrer l'inspection" }];
    case "inspecting":
      return [
        { to: "approved", labelEn: "Approve replacement", labelFr: "Approuver le remplacement" },
        { to: "rejected", labelEn: "Reject", labelFr: "Rejeter", danger: true },
      ];
    case "approved":
      return [{ to: "allocated", labelEn: "Allocate new unit", labelFr: "Allouer la nouvelle unité" }];
    case "allocated":
      return [{ to: "dispatched", labelEn: "Dispatch to customer", labelFr: "Expédier au client", requiresRider: true }];
    case "dispatched":
      return [{ to: "delivered", labelEn: "Mark delivered", labelFr: "Marquer comme livré" }];
    case "delivered":
      return [{ to: "closed", labelEn: "Close case", labelFr: "Clôturer le dossier" }];
    default:
      return [];
  }
}

/** Progress 0..1 along the happy path (rejected counts as terminal). */
export function replacementProgress(status: string): number {
  const s = normalizeReplacementStatus(status);
  if (s === "rejected") return 1;
  const idx = REPLACEMENT_FLOW.indexOf(s);
  return idx < 0 ? 0 : idx / (REPLACEMENT_FLOW.length - 1);
}
