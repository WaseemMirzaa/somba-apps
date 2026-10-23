"use client";

import { useLocale } from "@/context/locale-context";
import { sellerCount } from "@/lib/shop-packages";

/**
 * Shown above the total when the cart mixes sellers: one order, one delivery,
 * packed separately by each seller. Renders nothing for a single seller.
 */
export function OneDeliveryNote({ lines, className = "" }: { lines: { seller?: string }[]; className?: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const n = sellerCount(lines.map((l) => ({ sellerName: l.seller || null })));
  if (n < 2) return null;
  return (
    <p role="note" className={`mb-4 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800 ${className}`}>
      {fr
        ? `Votre commande arrive en une seule livraison. Elle est préparée par ${n} vendeurs.`
        : `Your order arrives in one delivery. It is packed by ${n} sellers.`}
    </p>
  );
}
