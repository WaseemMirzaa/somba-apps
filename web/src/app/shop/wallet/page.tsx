"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { PAYMENTS } from "@/lib/config";
import { useToast } from "@/context/toast-context";
import { MOCK_WALLET_TRANSACTIONS } from "@/lib/shared-entities";

export default function ShopWalletPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [balance, setBalance] = useState(142.5);

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Somba Wallet"
        subtitle="Store credit · Top-up via mobile money · Cashback"
        breadcrumbs={[{ label: "Account", href: "/shop/account" }, { label: "Wallet" }]}
      />

      <div className="card-premium overflow-hidden">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white">
          <p className="text-sm text-blue-100">Available Balance</p>
          <p className="font-[family-name:var(--font-display)] text-4xl font-bold">{formatCurrency(balance, locale)}</p>
          <div className="mt-4 flex gap-2">
            <Badge className="bg-white/20 text-white">Store Credit</Badge>
            {PAYMENTS.wallet.topUpViaMobileMoney && <Badge className="bg-white/20 text-white">Top-up enabled</Badge>}
          </div>
        </div>
        <div className="flex gap-3 p-4">
          <Button size="sm" onClick={() => setTopUpOpen(true)}>Top Up via Airtel</Button>
          <Button variant="secondary" size="sm" onClick={() => toast("Withdrawal request submitted")}>Withdraw</Button>
        </div>
      </div>

      {topUpOpen && (
        <div className="card-premium space-y-4 p-6">
          <h3 className="font-semibold">Top Up Wallet</h3>
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="Amount (USD)" />
          <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="Airtel Money number" />
          <Button onClick={() => { setBalance((b) => b + 50); setTopUpOpen(false); toast("Wallet topped up +$50"); }}>Confirm Top-up</Button>
        </div>
      )}

      <div>
        <h3 className="mb-4 font-semibold text-slate-900">Transaction History</h3>
        <div className="space-y-2">
          {MOCK_WALLET_TRANSACTIONS.map((tx) => (
            <Link key={tx.id} href={`/shop/wallet/transactions/${tx.id}`} className="card-premium flex items-center justify-between p-4 transition-colors hover:border-blue-200">
              <div>
                <p className="text-sm font-medium text-slate-900">{tx.desc}</p>
                <p className="text-xs text-slate-500">{tx.date} · {tx.id}</p>
              </div>
              <span className={`font-semibold ${tx.amount > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {tx.amount > 0 ? "+" : ""}{formatCurrency(tx.amount, locale)}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
