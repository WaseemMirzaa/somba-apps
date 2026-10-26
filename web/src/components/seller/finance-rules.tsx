"use client";

import { Clock, Percent, Wallet } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import type { FinanceBalance } from "@/lib/seller-finance";

/** The three rules your money follows, always visible: commission, minimum payout, clearance hold. */
export function FinanceRules({ balance, stack = false }: { balance: Pick<FinanceBalance, "commissionPct" | "minPayoutUsd" | "holdHours"> | null; stack?: boolean }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  if (!balance) return null;
  const hold =
    balance.holdHours <= 0
      ? fr ? "Aucun délai : retirable dès la livraison" : "No hold: withdrawable once delivered"
      : balance.holdHours % 24 === 0
        ? fr ? `${balance.holdHours / 24} j après la livraison` : `${balance.holdHours / 24} d after delivery`
        : fr ? `${balance.holdHours} h après la livraison` : `${balance.holdHours} h after delivery`;
  const items = [
    {
      icon: Percent,
      label: fr ? "Commission sur les nouvelles commandes" : "Commission on new orders",
      value: `${balance.commissionPct} %`,
      note: fr ? "Chaque commande garde le taux de sa création." : "Each order keeps the rate stored when it was placed.",
    },
    {
      icon: Wallet,
      label: fr ? "Versement minimum" : "Minimum payout",
      value: formatCurrency(balance.minPayoutUsd, locale),
      note: fr ? "En dessous, la demande est refusée." : "Below this, a request is refused.",
    },
    { icon: Clock, label: fr ? "Délai de sécurité" : "Clearance hold", value: hold, note: fr ? "Le gain n'est retirable qu'après ce délai." : "Earnings can only be withdrawn after this delay." },
  ];
  return (
    <div className={stack ? "grid gap-3" : "grid gap-3 sm:grid-cols-3"} data-testid="finance-rules">
      {items.map((it) => (
        <div key={it.label} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <span className="rounded-xl bg-slate-100 p-2.5">
            <it.icon className="h-4 w-4 text-slate-600" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-500">{it.label}</p>
            <p className="mt-0.5 break-words text-base font-bold text-slate-900">{it.value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{it.note}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
