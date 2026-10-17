"use client";

import Link from "next/link";
import { DataTable } from "@/components/ui/data-table";
import { ProductImage } from "@/components/seller/product-image";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";

export interface EffectProduct {
  id: string;
  name: string;
  image: string;
  /** The stored list price. */
  price: number;
}

/** Same rounding the server uses: price * (1 - pct/100) to the cent. */
export function discounted(price: number, pct: number): number {
  return Math.round(price * (1 - Math.min(90, Math.max(0, pct)) / 100) * 100) / 100;
}

/**
 * Whether the server would price with this campaign today (see docs/ANALYTICS-API.md §7):
 * discount > 0 and status `active`, inside its dates; or `scheduled` once its start has passed.
 */
export function campaignApplies(c: { status: string; discount: number; startDate: string | null; endDate: string | null }, now = Date.now()): boolean {
  if (!(c.discount > 0)) return false;
  if (c.status !== "active" && c.status !== "scheduled") return false;
  const start = c.startDate ? Date.parse(c.startDate) : NaN;
  const endRaw = c.endDate ? Date.parse(c.endDate) : NaN;
  // A date-only end is inclusive until 23:59:59 UTC.
  const end = Number.isFinite(endRaw) && /^\d{4}-\d{2}-\d{2}$/.test(c.endDate ?? "") ? endRaw + 86_399_999 : endRaw;
  if (Number.isFinite(start) && now < start) return false;
  if (Number.isFinite(end) && now > end) return false;
  return true;
}

/** What the discount does to each covered product: shopper price, and what the seller keeps after commission. */
export function CampaignEffectTable({
  products,
  discount,
  commissionPct,
}: {
  products: EffectProduct[];
  discount: number;
  commissionPct: number;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rows = products.map((p) => {
    const now = discounted(p.price, discount);
    return { id: p.id, name: p.name, image: p.image, price: p.price, now, net: Math.round(now * (1 - commissionPct / 100) * 100) / 100 };
  });
  return (
    <DataTable
      emptyMessage={fr ? "Aucun produit." : "No products."}
      columns={[
        {
          key: "name",
          label: fr ? "Produit" : "Product",
          primary: true,
          render: (r) => (
            <span className="flex items-center gap-3">
              <span className="h-9 w-9 shrink-0 overflow-hidden rounded"><ProductImage src={String(r.image)} /></span>
              <Link href={`/seller/products/${r.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(r.name)}</Link>
            </span>
          ),
        },
        { key: "price", label: fr ? "Prix actuel" : "List price", render: (r) => formatCurrency(r.price as number, locale) },
        {
          key: "now",
          label: fr ? `Prix à -${discount} %` : `Price at -${discount}%`,
          render: (r) => <span className="font-semibold text-emerald-700">{formatCurrency(r.now as number, locale)}</span>,
        },
        { key: "net", label: fr ? `Vous gardez (après ${commissionPct} %)` : `You keep (after ${commissionPct}%)`, render: (r) => formatCurrency(r.net as number, locale) },
      ]}
      data={rows as unknown as Record<string, unknown>[]}
    />
  );
}
