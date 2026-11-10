"use client";

import { PackageCheck, Truck, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime, LEG_STATUS, legStatusVariant, pickL } from "@/lib/logistics";
import { pickText } from "@/lib/i18n-fields";
import { EXPRESS_HINT, EXPRESS_LABEL, customerLegs, hasSplitLegs, legCargoText, isPartiallyDelivered, partialHint, partialTitle, splitLines, type Audience, type PanelLine } from "@/lib/split-delivery";
import type { OrderItem, TrackingLegView } from "@/lib/realtime/types";

/** "Express" next to an order: a rider goes straight from the seller to the customer. */
export function ExpressBadge({ fr, className }: { fr: boolean; className?: string }) {
  return (
    <Badge variant="purple" className={className}>
      <Zap className="mr-1 h-3 w-3" aria-hidden />
      <span title={pickL(EXPRESS_HINT, fr)}>{pickL(EXPRESS_LABEL, fr)}</span>
    </Badge>
  );
}

/** The order's lines in the reader's language, for the panel. */
export function panelLines(items: readonly Pick<OrderItem, "id" | "productName" | "productNameFr" | "qty" | "fulfilment" | "deliveredAt">[] | null | undefined, fr: boolean): PanelLine[] {
  return (items ?? []).map((l) => ({ id: l.id, name: pickText(fr, l.productName, l.productNameFr), qty: l.qty, fulfilment: l.fulfilment ?? null, deliveredAt: l.deliveredAt ?? null }));
}

/**
 * Split delivery on an order page: "Part of the order was delivered", the lines already delivered (with the day) and the
 * ones still coming, then every customer leg with the lines it carries. Renders nothing for an ordinary order.
 * `audience` only changes the wording ("your order" for the customer).
 */
export function PartialDelivery({
  order,
  lines,
  legs,
  fr,
  audience,
  partial: partialOverride,
}: {
  order: { status?: string; partiallyDelivered?: boolean };
  lines: readonly PanelLine[];
  legs?: readonly TrackingLegView[] | null;
  fr: boolean;
  audience: Audience;
  /** A seller sees only their own lines, so "partial" is their package's state rather than the lines'. */
  partial?: boolean;
}) {
  const partial = partialOverride ?? isPartiallyDelivered({ ...order, items: lines });
  const split = hasSplitLegs(legs);
  if (!partial && !split) return null;
  const { delivered, coming } = splitLines(lines);
  const name = (l: PanelLine) => `${l.qty} × ${l.name}`;
  const deliveries = customerLegs(legs);
  return (
    <section data-testid="partial-delivery" className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
      {partial && (
        <header className="mb-3 flex items-start gap-3">
          <PackageCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">{partialTitle(audience, fr)}</p>
            <p className="text-xs text-sky-800">
              {partialHint(audience, fr)}
            </p>
          </div>
        </header>
      )}
      {(delivered.length > 0 || coming.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div data-testid="partial-delivered">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">{fr ? "Déjà livré" : "Delivered"}</p>
            {delivered.length === 0 ? (
              <p className="text-xs text-slate-600">—</p>
            ) : (
              <ul className="space-y-0.5">
                {delivered.map((l, i) => (
                  <li key={i} className="text-slate-800">
                    {name(l)} <span className="text-xs text-slate-500">· {fmtDateTime(l.deliveredAt, fr)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div data-testid="partial-coming">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">{fr ? "Encore à venir" : "Still coming"}</p>
            {coming.length === 0 ? (
              <p className="text-xs text-slate-600">—</p>
            ) : (
              <ul className="space-y-0.5">
                {coming.map((l, i) => (
                  <li key={i} className="text-slate-800">{name(l)}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {deliveries.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-sky-200 pt-3" data-testid="partial-legs">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">{fr ? "Livraisons" : "Deliveries"}</p>
          {deliveries.map((l, i) => (
            <div key={l.id} className="rounded-xl border border-sky-100 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 font-medium text-slate-800">
                  <Truck className="h-4 w-4 text-sky-700" aria-hidden />
                  {fr ? `Livraison ${i + 1}` : `Delivery ${i + 1}`}
                  {l.completesOrder === false && <span className="text-xs font-normal text-slate-500">· {fr ? "partielle" : "partial"}</span>}
                </p>
                <Badge variant={legStatusVariant(l.status)}>{pickL(LEG_STATUS[l.status as keyof typeof LEG_STATUS], fr, l.status)}</Badge>
              </div>
              {(l.items ?? []).length > 0 && (
                <p className="mt-1 text-xs text-slate-600" data-testid="partial-leg-items">{legCargoText(l.items, lines, fr)}</p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                {l.riderFirstName ? `${fr ? "Livreur" : "Rider"} ${l.riderFirstName}` : l.status === "unassigned" ? (fr ? "Livreur pas encore choisi" : "Rider not chosen yet") : ""}
                {l.deliveredAt ? ` · ${fmtDateTime(l.deliveredAt, fr)}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
