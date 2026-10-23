"use client";

import { useMemo } from "react";
import { localDateTime } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import type { CampaignRow } from "@/lib/admin-live";
import type { Product } from "@/lib/realtime/types";
import { formatCurrency } from "@/lib/utils";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Same window rule as the server (api/src/products/pricing.ts): a date-only end is inclusive. */
function windowOf(c: Pick<CampaignRow, "startDate" | "endDate">) {
  const parse = (s: string | null, endOfDay: boolean): number | null => {
    if (!s) return null;
    const t = Date.parse(DATE_ONLY.test(s) ? `${s}T00:00:00.000Z` : s);
    if (!Number.isFinite(t)) return null;
    return DATE_ONLY.test(s) && endOfDay ? t + 86_400_000 - 1 : t;
  };
  return { from: parse(c.startDate, false), to: parse(c.endDate, true) };
}

export type CampaignPhase = "discounting" | "waiting" | "over" | "inactive";

/** Is the campaign changing shoppers' prices right now, will it, or never? */
export function campaignPhase(c: CampaignRow, now = Date.now()): CampaignPhase {
  if (!(c.discount > 0)) return "inactive";
  const { from, to } = windowOf(c);
  if (c.status === "active") {
    if (from !== null && now < from) return "waiting";
    if (to !== null && now > to) return "over";
    return "discounting";
  }
  if (c.status === "scheduled") {
    if (to !== null && now > to) return "over";
    return from !== null && now >= from ? "discounting" : "waiting";
  }
  if (c.status === "ended") return "over";
  return "inactive";
}

const PHASE_LABEL: Record<CampaignPhase, { en: string; fr: string }> = {
  discounting: { en: "Discounting now", fr: "Remise en cours" },
  waiting: { en: "Starts later", fr: "Démarre plus tard" },
  over: { en: "Over", fr: "Terminée" },
  inactive: { en: "No price change", fr: "Aucun effet sur les prix" },
};
const PHASE_VARIANT: Record<CampaignPhase, "success" | "info" | "default"> = {
  discounting: "success",
  waiting: "info",
  over: "default",
  inactive: "default",
};

/** Products a campaign covers: an explicit list, or the whole store when the list is empty. */
export function useCampaignScope(c: CampaignRow) {
  const rt = useRealtime();
  return useMemo(() => {
    const ids = c.productIds ?? [];
    const explicit = ids.length > 0;
    const byId = new Map(rt.products.map((p) => [p.id, p]));
    const products: Product[] = explicit
      ? ids.map((id) => byId.get(id)).filter((p): p is Product => !!p)
      : rt.products.filter((p) => !!c.sellerId && p.sellerId === c.sellerId && p.status !== "removed");
    const missing = explicit ? ids.length - products.length : 0;
    const pricedByThis = products.filter((p) => p.priceSource === "campaign" && p.campaignId === c.id).length;
    return { explicit, products, missing, pricedByThis };
  }, [c.productIds, c.sellerId, c.id, rt.products]);
}

export function CampaignScopeLine({ campaign }: { campaign: CampaignRow }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const scope = useCampaignScope(campaign);
  if (scope.explicit) {
    return <span>{fr ? `${campaign.productIds!.length} produit(s) choisi(s)` : `${campaign.productIds!.length} chosen product(s)`}</span>;
  }
  return <span>{fr ? `Toute la boutique (${scope.products.length} produits)` : `Whole store (${scope.products.length} products)`}</span>;
}

export function CampaignPhaseBadge({ campaign }: { campaign: CampaignRow }) {
  const { locale } = useLocale();
  const phase = campaignPhase(campaign);
  return <Badge variant={PHASE_VARIANT[phase]}>{locale === "fr" ? PHASE_LABEL[phase].fr : PHASE_LABEL[phase].en}</Badge>;
}

function dateLabel(s: string | null, fr: boolean) {
  if (!s) return fr ? "sans limite" : "open";
  return localDateTime(s);
}

/** Full scope + effect of one campaign: window, discount, covered products with before/after price, results. */
export function CampaignDetailModal({
  campaign,
  onClose,
  footer,
}: {
  campaign: CampaignRow | null;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  if (!campaign) return null;
  return (
    <Modal open onClose={onClose} title={(fr ? campaign.nameFr || campaign.name : campaign.name) ?? ""} footer={footer ?? <Button variant="secondary" size="sm" onClick={onClose}>{fr ? "Fermer" : "Close"}</Button>}>
      <CampaignDetailBody campaign={campaign} />
    </Modal>
  );
}

export function CampaignDetailBody({ campaign: c }: { campaign: CampaignRow }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const scope = useCampaignScope(c);
  const phase = campaignPhase(c);
  const shown = scope.products.slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <CampaignPhaseBadge campaign={c} />
        <span className="text-xs text-slate-400">{c.reference} · {c.sellerName ?? "—"}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-slate-400">{fr ? "Remise" : "Discount"}</dt>
          <dd className="font-semibold text-slate-900">{c.discount}% {fr ? "sur le prix catalogue" : "off the listing price"}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Budget</dt>
          <dd className="font-semibold text-slate-900">{formatCurrency(c.budgetUsd, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">{fr ? "Début" : "Starts"}</dt>
          <dd className="text-slate-800">{dateLabel(c.startDate, fr)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">{fr ? "Fin (incluse)" : "Ends (inclusive)"}</dt>
          <dd className="text-slate-800">{dateLabel(c.endDate, fr)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">{fr ? "Commandes" : "Orders"}</dt>
          <dd className="text-slate-800">{c.orders}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">{fr ? "Chiffre d'affaires" : "Revenue"}</dt>
          <dd className="text-slate-800">{formatCurrency(c.revenueUsd, locale)}</dd>
        </div>
      </dl>

      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
        {phase === "discounting" && (fr ? `Les prix des produits ci-dessous sont déjà réduits de ${c.discount}% dans la boutique (${scope.pricedByThis} actuellement fixé(s) par cette campagne).` : `The products below are already ${c.discount}% cheaper in the shop (${scope.pricedByThis} currently priced by this campaign).`)}
        {phase === "waiting" && (fr ? `Aucun effet avant le ${dateLabel(c.startDate, fr)}.` : `No effect before ${dateLabel(c.startDate, fr)}.`)}
        {phase === "over" && (fr ? "La campagne est terminée : les prix sont revenus à la normale." : "The campaign is over: prices are back to normal.")}
        {phase === "inactive" && (fr ? "Tant qu'elle n'est pas approuvée (ou si la remise est 0), aucun prix ne change." : "Until it is approved (or when the discount is 0), no price changes.")}
        <span className="mt-1 block text-slate-400">
          {fr
            ? "Le prix le plus bas gagne : une vente flash et une campagne ne se cumulent jamais ; un code promo s'applique ensuite au panier."
            : "The lowest price wins: a flash sale and a campaign never stack; a promo code applies to the cart afterwards."}
        </span>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          {scope.explicit
            ? fr ? `Produits concernés (${c.productIds!.length})` : `Products covered (${c.productIds!.length})`
            : fr ? `Toute la boutique : ${scope.products.length} produit(s)` : `Whole store: ${scope.products.length} product(s)`}
        </p>
        {shown.length === 0 ? (
          <p className="text-sm text-slate-400">{fr ? "Aucun produit trouvé pour cette campagne." : "No product found for this campaign."}</p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
            {shown.map((p) => {
              const base = p.basePrice ?? p.price;
              const after = Number((base * (1 - c.discount / 100)).toFixed(2));
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-slate-800">{p.name}</span>
                  <span className="shrink-0 text-xs">
                    <span className="text-slate-400 line-through">{formatCurrency(base, locale)}</span>{" "}
                    <span className="font-semibold text-slate-900">{formatCurrency(after, locale)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {scope.products.length > shown.length && (
          <p className="mt-1 text-xs text-slate-400">{fr ? `… et ${scope.products.length - shown.length} autre(s)` : `… and ${scope.products.length - shown.length} more`}</p>
        )}
        {scope.missing > 0 && (
          <p className="mt-1 text-xs text-amber-600">{fr ? `${scope.missing} produit(s) de la liste ne sont plus au catalogue.` : `${scope.missing} listed product(s) are no longer in the catalogue.`}</p>
        )}
        <p className="mt-2 text-xs text-slate-400">
          {fr ? "Prix avant/après calculés sur le prix catalogue ; une vente flash moins chère l'emporterait." : "Before/after prices use the listing price; a cheaper flash sale would win instead."}
        </p>
      </div>
    </div>
  );
}
