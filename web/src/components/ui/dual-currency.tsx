"use client";

import { useMarket } from "@/context/market-context";
import { useLocale } from "@/context/locale-context";
import { formatDualCurrency } from "@/lib/utils";

export function DualCurrency({ amount, className = "" }: { amount: number; className?: string }) {
  const { profile, showDualCurrency } = useMarket();
  const { locale } = useLocale();
  const { usd, cdf } = formatDualCurrency(amount, locale, profile.fxRateUsdCdf);

  return (
    <span className={className}>
      <span>{usd}</span>
      {showDualCurrency && cdf && (
        <span className="ml-1 text-xs text-slate-500">({cdf})</span>
      )}
    </span>
  );
}
