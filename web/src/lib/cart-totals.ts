"use client";

import { useMemo } from "react";
import type { CartLine } from "@/context/shop-context";
import { usePublicSettings } from "@/lib/shop-live";
import { cartTotals } from "@/lib/vat";
import type { CartTotals } from "@/lib/vat";

/**
 * The totals of the cart (cart, checkout and payment pages): goods - discount + VAT + the delivery fee when the customer pays
 * it, from the public settings (`vatEnabled`, `deliveryFeePaidBy`, `showPlatformFee`) and each product's `vatPct`. The same
 * arithmetic as the server (`lib/vat.ts`), so the page shows what the order will charge.
 */
export function useCartTotals(lines: CartLine[], discountUsd: number, feeUsd: number, promoSellerId?: string | null): CartTotals {
  const s = usePublicSettings();
  return useMemo(
    () =>
      cartTotals({
        lines: lines.map((l) => ({ priceUsd: l.livePrice, qty: l.qty, vatPct: l.vatPct, discountable: promoSellerId ? l.sellerId === promoSellerId : true })),
        discountUsd,
        feeUsd,
        rules: { vatEnabled: s.vatEnabled, feePaidBySeller: s.feePaidBySeller, showPlatformFee: s.showPlatformFee },
      }),
    [lines, discountUsd, feeUsd, promoSellerId, s.vatEnabled, s.feePaidBySeller, s.showPlatformFee],
  );
}
