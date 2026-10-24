"use client";

import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { localizeVariant, pickText, variantDisplay } from "@/lib/i18n-fields";
import type { PackageStatus } from "@/lib/realtime/types";
import { buildPackages, isCancelledLine, shouldShowPackages, type PackageLine } from "@/lib/shop-packages";

// Order item variants come from the data layer as free-form English tokens (e.g. "Default", "256GB Black"): the
// shared helpers pick the stored translation, else translate the known tokens.
export { localizeVariant, variantDisplay };

/** One order line, merged with its seller-side state, as the order page shows it. */
export interface OrderProductEntry extends PackageLine {
  productId: string;
  name: string;
  /** French name snapshotted on the order line (falls back to `name`). */
  nameFr?: string | null;
  variant: string;
  /** French options snapshotted on the order line. */
  variantFr?: string | null;
  qty: number;
  price: number;
  listPrice: number | null;
  campaignPct: number;
  image: string;
  cancelReason?: string | null;
}

const STATUS_LABEL: Record<PackageStatus, { en: string; fr: string }> = {
  pending: { en: "Awaiting payment", fr: "En attente de paiement" },
  to_pack: { en: "To pack", fr: "À préparer" },
  ready: { en: "Ready for pickup", fr: "Prêt pour l'enlèvement" },
  at_hub: { en: "At the hub", fr: "Au hub" },
  shipped: { en: "Shipped", fr: "Expédié" },
  out_for_delivery: { en: "On its way", fr: "En route" },
  delivered: { en: "Delivered", fr: "Livré" },
  returned: { en: "Returned", fr: "Retourné" },
  cancelled: { en: "Cancelled", fr: "Annulé" },
};

const STATUS_VARIANT: Record<PackageStatus, "default" | "primary" | "success" | "warning" | "danger" | "purple" | "info"> = {
  pending: "default",
  to_pack: "warning",
  ready: "primary",
  at_hub: "purple",
  shipped: "info",
  out_for_delivery: "info",
  delivered: "success",
  returned: "default",
  cancelled: "danger",
};

export function packageStatusLabel(status: PackageStatus, fr: boolean): string {
  return fr ? STATUS_LABEL[status].fr : STATUS_LABEL[status].en;
}

function ProductRow({ item }: { item: OrderProductEntry }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const name = pickText(fr, item.name, item.nameFr);
  const cancelled = isCancelledLine(item);
  const refunded = item.refundedUsd && item.refundedUsd > 0 ? item.refundedUsd : 0;
  return (
    <div className="flex gap-3 sm:gap-4">
      <Link href={`/shop/products/${item.productId}`} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg">
        <Image src={item.image || "/brand/logo-stack.png"} alt={name} fill className={`object-cover ${cancelled ? "opacity-50 grayscale" : ""}`} sizes="64px" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/shop/products/${item.productId}`} className={`break-words font-medium hover:text-[var(--primary)] ${cancelled ? "text-slate-500 line-through" : ""}`}>
          {name}
        </Link>
        <p className="text-xs text-slate-500">{variantDisplay(item.variant, fr ? item.variantFr : null, fr)}</p>
        {cancelled && (
          <div className="mt-1 space-y-0.5 text-xs">
            <p className="font-medium text-red-700">
              {fr ? "Annulé par le vendeur" : "Cancelled by the seller"}
              {item.cancelReason ? ` : ${item.cancelReason}` : ""}
            </p>
            {refunded > 0 && (
              <p className="text-emerald-700">
                {fr ? `Remboursé ${formatCurrency(refunded, locale)} sur votre portefeuille` : `Refunded ${formatCurrency(refunded, locale)} to your wallet`}
              </p>
            )}
          </div>
        )}
      </div>
      <div className={`shrink-0 text-right ${cancelled ? "text-slate-500 line-through" : ""}`}>
        <p className="font-medium">{formatCurrency(item.price, locale)}</p>
        {item.listPrice != null && (
          <s className="block text-xs text-slate-500">
            <span className="sr-only">{fr ? "Prix normal " : "List price "}</span>{formatCurrency(item.listPrice, locale)}
          </s>
        )}
        {item.campaignPct > 0 && <p className="text-xs font-semibold text-amber-800">-{item.campaignPct}%</p>}
        <p className="text-xs">{fr ? "Qté" : "Qty"}: {item.qty}</p>
      </div>
    </div>
  );
}

/**
 * The order's products. A single-seller order with nothing cancelled is a plain
 * list; otherwise one card per seller package with its derived status.
 */
export function OrderProducts({
  order,
  items,
}: {
  order: { status: string; paymentMethod?: string | null };
  items: OrderProductEntry[];
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  if (!shouldShowPackages(items)) {
    return (
      <div className="space-y-4">
        {items.map((item, i) => <ProductRow key={`${item.productId}-${item.variant}-${i}`} item={item} />)}
      </div>
    );
  }
  const packages = buildPackages(order, items);
  return (
    <div className="space-y-4">
      {packages.map((pkg) => (
        <section key={pkg.key || pkg.index} aria-label={`${fr ? "Colis" : "Package"} ${pkg.index}`} className="rounded-xl border border-[var(--border)] p-3 sm:p-4">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
            <h3 className="min-w-0 break-words text-sm font-semibold text-slate-900">
              {fr ? `Colis ${pkg.index} sur ${pkg.total}` : `Package ${pkg.index} of ${pkg.total}`}
              {pkg.sellerName ? ` · ${fr ? "Vendu par" : "Sold by"} ${pkg.sellerName}` : ""}
            </h3>
            <Badge variant={STATUS_VARIANT[pkg.status]}>{packageStatusLabel(pkg.status, fr)}</Badge>
          </header>
          <div className="space-y-4">
            {pkg.items.map((item, i) => <ProductRow key={`${item.productId}-${item.variant}-${i}`} item={item} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
