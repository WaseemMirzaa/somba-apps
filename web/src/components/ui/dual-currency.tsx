"use client";

import { useMarket } from "@/context/market-context";
import { useLocale } from "@/context/locale-context";
import { formatDualCurrency, cn } from "@/lib/utils";

type DualCurrencyProps = {
  amount: number;
  className?: string;
  layout?: "stack" | "inline";
};

export function DualCurrency({ amount, className = "", layout = "stack" }: DualCurrencyProps) {
  const { profile, showDualCurrency } = useMarket();
  const { locale } = useLocale();
  const { usd, cdf } = formatDualCurrency(amount, locale, profile.fxRateUsdCdf);
  const showCdf = showDualCurrency && cdf;

  if (layout === "inline") {
    return (
      <span className={cn("money-value inline-flex min-w-0 max-w-full flex-wrap items-baseline gap-x-1", className)}>
        <span>{usd}</span>
        {showCdf && <span className="text-xs font-normal text-slate-500">({cdf})</span>}
      </span>
    );
  }

  return (
    <span className={cn("money-value inline-flex min-w-0 max-w-full flex-col", className)}>
      <span className="leading-tight">{usd}</span>
      {showCdf && (
        <span className="text-xs font-normal leading-tight text-slate-500">({cdf})</span>
      )}
    </span>
  );
}
