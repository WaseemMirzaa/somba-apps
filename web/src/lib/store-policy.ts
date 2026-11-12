/**
 * Store policies need KOMORIKO approval (docs/contracts/admin-controls.md §5). A store's proposal is a "revision":
 * a text column that is `null` is NOT part of the change (the live text stays), `""` clears it, anything else replaces it.
 * Pure helpers shared by the seller's policy form and the admin queue.
 */

export type PolicyKey = "returnsPolicy" | "returnsPolicyFr" | "shippingPolicy" | "shippingPolicyFr";
export const POLICY_KEYS: PolicyKey[] = ["returnsPolicy", "returnsPolicyFr", "shippingPolicy", "shippingPolicyFr"];
export type PolicyStatus = "pending" | "approved" | "rejected";

export type PolicyTexts = Record<PolicyKey, string | null>;

export interface PolicyRevision extends PolicyTexts {
  id: string;
  sellerId: string;
  status: PolicyStatus;
  note: string | null;
  proposedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  createdAt: string;
  storeName?: string | null;
  /** The text on the store now, both languages (admin list rows). */
  live?: Partial<PolicyTexts> | null;
}

/** `sellers:policy:mine`. */
export interface MyPolicy {
  pending: PolicyRevision | null;
  lastDecided: PolicyRevision | null;
}

/** `sellers:policy:template`. */
export interface PolicyTemplate {
  returnsPolicy: { en: string; fr: string };
  returnWindowDays?: number;
}

export const POLICY_FIELD_LABEL: Record<PolicyKey, { en: string; fr: string }> = {
  returnsPolicy: { en: "Returns policy (English)", fr: "Politique de retour (anglais)" },
  returnsPolicyFr: { en: "Returns policy (French)", fr: "Politique de retour (français)" },
  shippingPolicy: { en: "Shipping policy (English)", fr: "Politique d'expédition (anglais)" },
  shippingPolicyFr: { en: "Shipping policy (French)", fr: "Politique d'expédition (français)" },
};

const STATUS_LABEL: Record<PolicyStatus, { en: string; fr: string }> = {
  pending: { en: "Waiting for approval", fr: "En attente d'approbation" },
  approved: { en: "Approved", fr: "Approuvée" },
  rejected: { en: "Not approved", fr: "Refusée" },
};

export const policyStatusLabel = (status: string | null | undefined, fr: boolean): string => {
  const hit = STATUS_LABEL[status as PolicyStatus];
  return hit ? (fr ? hit.fr : hit.en) : String(status ?? "");
};

const trim = (v: string | null | undefined) => (v ?? "").trim();

/** The keys a proposal actually changes (a `null` column is not part of it). */
export function revisionKeys(rev: Pick<PolicyRevision, PolicyKey> | null | undefined): PolicyKey[] {
  if (!rev) return [];
  return POLICY_KEYS.filter((k) => rev[k] !== null && rev[k] !== undefined);
}

/** What the store would show if the proposal were approved: the proposal's text where it has one, else the live text. */
export function effectivePolicy(live: Partial<PolicyTexts> | null | undefined, pending: Pick<PolicyRevision, PolicyKey> | null | undefined): Record<PolicyKey, string> {
  const out = {} as Record<PolicyKey, string>;
  for (const k of POLICY_KEYS) out[k] = (pending && pending[k] !== null && pending[k] !== undefined ? pending[k] : live?.[k]) ?? "";
  return out;
}

/** The fields of `draft` that differ from `base`, as the patch `sellers:update` / `sellers:policy:publish` takes (`null` clears). */
export function policyPatch(draft: Record<PolicyKey, string>, base: Record<PolicyKey, string>): Partial<Record<PolicyKey, string | null>> {
  const patch: Partial<Record<PolicyKey, string | null>> = {};
  for (const k of POLICY_KEYS) if (trim(draft[k]) !== trim(base[k])) patch[k] = trim(draft[k]) === "" ? null : trim(draft[k]);
  return patch;
}

export const POLICY_MIN = 10;
export const POLICY_MAX = 2000;

/** A policy text is valid empty (clears it) or 10-2000 characters. */
export const policyTextInvalid = (v: string | null | undefined): boolean => {
  const n = trim(v).length;
  return n !== 0 && (n < POLICY_MIN || n > POLICY_MAX);
};

/** Side-by-side rows for the admin: one per changed field, with the live text next to the proposal. */
export function compareRows(rev: PolicyRevision): { key: PolicyKey; live: string; proposed: string; cleared: boolean }[] {
  return revisionKeys(rev).map((key) => ({
    key,
    live: rev.live?.[key] ?? "",
    proposed: rev[key] ?? "",
    cleared: (rev[key] ?? "") === "",
  }));
}
