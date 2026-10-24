"use client";

import { pickText } from "@/lib/i18n-fields";
import Image from "next/image";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { variantDisplay } from "@/components/shop/order-products";
import type { CartLine } from "@/context/shop-context";

/**
 * The cart lines as the server will charge them: unit price after any flash
 * sale or campaign, the normal price struck through, and the promotion's name.
 */
export function OrderLines({ lines }: { lines: CartLine[] }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <ul className="divide-y divide-[var(--border)]">
      {lines.map((l) => {
        const info = l.priceInfo;
        const promo = info && info.source !== "base" && info.was != null;
        return (
          <li key={`${l.id}-${l.variant}`} className="flex items-center gap-3 py-3">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
              {l.image && <Image src={l.image} alt="" fill sizes="48px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{fr ? l.nameFr : l.name}</p>
              {l.variant && l.variant !== "Default" && (
                <p className="truncate text-xs text-slate-500">{variantDisplay(l.variant, fr ? l.variantFr : l.variantEn, fr)}</p>
              )}
              {l.seller && (
                <p className="truncate text-xs text-slate-500">{fr ? "Vendu par" : "Sold by"} {l.seller}</p>
              )}
              <p className="text-xs text-slate-500">
                {formatCurrency(l.livePrice, locale)} × {l.qty}
                {promo && (
                  <>
                    {" · "}
                    <s>
                      <span className="sr-only">{fr ? "Ancien prix " : "Was "}</span>
                      {formatCurrency(info.was as number, locale)}
                    </s>
                    {" · "}
                    <span className="font-semibold text-amber-800">
                      -{info.pct}%{info.source === "flash" ? (fr ? " vente flash" : " flash sale") : info.campaignName ? ` ${pickText(fr, info.campaignName, info.campaignNameFr)}` : ""}
                    </span>
                  </>
                )}
              </p>
            </div>
            <p className="text-sm font-semibold text-slate-900">{formatCurrency(Math.round(l.livePrice * l.qty * 100) / 100, locale)}</p>
          </li>
        );
      })}
    </ul>
  );
}
