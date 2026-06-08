"use client";

import { useState } from "react";
import { Copy, Gift, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function ShopReferPage() {
  const { locale } = useLocale();
  const [copied, setCopied] = useState(false);
  const code = "SOMBA-MARIE2024";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title="Refer & Earn"
        subtitle="Invite friends — earn wallet credit on their first order"
        breadcrumbs={[{ label: "Account", href: "/shop/account" }, { label: "Refer & Earn" }]}
      />

      <div className="card-premium bg-gradient-to-br from-violet-50 to-blue-50 p-8 text-center">
        <Gift className="mx-auto h-12 w-12 text-violet-600" />
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-bold">Give $10, Get $10</h2>
        <p className="mt-2 text-sm text-slate-600">Your friend gets $10 off. You earn $10 wallet credit.</p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <code className="rounded-xl bg-white px-6 py-3 font-mono text-lg font-bold text-blue-700 shadow-sm">{code}</code>
          <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(code); setCopied(true); }}>
            <Copy className="h-4 w-4" />{copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard title="Referrals" value={7} icon={Users} />
        <StatCard title="Earned" value={formatCurrency(70, locale)} icon={Gift} />
      </div>

      <div className="card-premium p-6">
        <h3 className="font-semibold">How it works</h3>
        <ol className="mt-4 space-y-3 text-sm text-slate-600">
          <li>1. Share your unique referral code</li>
          <li>2. Friend signs up and places first order ($50+)</li>
          <li>3. Both receive $10 wallet credit within 48h</li>
        </ol>
      </div>
    </div>
  );
}
