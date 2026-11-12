/**
 * The stage of a return or a dispute after KOMORIKO took the seller out (docs/contracts/admin-controls.md §1.1).
 * Every request starts in `awaiting_support`. The old seller stages are legacy: the migration moved every open row, but a
 * client may still read one (an older server, a closed row), and it reads exactly like `awaiting_support`.
 */

export const LEGACY_SELLER_STAGES = ["awaiting_seller", "seller_replied", "seller_rejected", "seller_timeout"] as const;

/** Stages in which nobody has decided yet: support may approve / refuse a return, decide a dispute. */
export const UNDECIDED_STAGES = ["awaiting_support", "escalated", ...LEGACY_SELLER_STAGES] as const;

export type L2 = { en: string; fr: string };

export const WITH_SUPPORT: L2 = { en: "With support", fr: "Chez le support" };

export const isLegacySellerStage = (stage: string | null | undefined): boolean => LEGACY_SELLER_STAGES.includes(stage as (typeof LEGACY_SELLER_STAGES)[number]);

/** `awaiting_support` for every undecided stage (legacy seller ones included); any other stage is returned as it is. */
export function normalizeStage(stage: string | null | undefined): string {
  if (!stage || stage === "escalated" || isLegacySellerStage(stage)) return "awaiting_support";
  return stage;
}

export const isUndecidedStage = (stage: string | null | undefined): boolean => !!stage && (UNDECIDED_STAGES as readonly string[]).includes(stage);
