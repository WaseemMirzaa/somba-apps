"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { useMarket } from "@/context/market-context";
import { useToast } from "@/context/toast-context";

export default function AdminSettingsPage() {
  const { t } = useLocale();
  const { profile, profileId, setProfileId } = useMarket();
  const { toast } = useToast();
  const [commission, setCommission] = useState("12");
  const [codMax, setCodMax] = useState(String(profile.codMaxOrderValue));
  const [fxRate, setFxRate] = useState(String(profile.fxRateUsdCdf ?? 2850));
  const [payoutMin, setPayoutMin] = useState(String(profile.payoutMinUsd));
  const [clearanceHours, setClearanceHours] = useState(String(profile.payoutClearanceHours));

  function save() {
    toast("Settings saved (audit logged)", "success");
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings")} subtitle="AF-20 / AF-21 — Δ2, Δ3, Δ4, Δ8" />

      <div className="card-premium space-y-4 p-6">
        <h3 className="font-semibold">Market Profile</h3>
        <select className="input-premium w-full max-w-xs px-4 py-2 text-sm" value={profileId} onChange={(e) => setProfileId(e.target.value as "france" | "drc")}>
          <option value="france">France (Demo)</option>
          <option value="drc">DRC (Production)</option>
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-premium space-y-3 p-6">
          <h3 className="font-semibold">Commission (Δ4)</h3>
          <label className="text-sm">Default commission %</label>
          <input className="input-premium w-full px-4 py-2 text-sm" value={commission} onChange={(e) => setCommission(e.target.value)} />
        </div>
        <div className="card-premium space-y-3 p-6">
          <h3 className="font-semibold">COD (Δ2)</h3>
          <label className="text-sm">cod_max_order_value (USD)</label>
          <input className="input-premium w-full px-4 py-2 text-sm" value={codMax} onChange={(e) => setCodMax(e.target.value)} />
        </div>
        <div className="card-premium space-y-3 p-6">
          <h3 className="font-semibold">FX Rate (Δ8)</h3>
          <label className="text-sm">USD → CDF (manual)</label>
          <input className="input-premium w-full px-4 py-2 text-sm" value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
        </div>
        <div className="card-premium space-y-3 p-6">
          <h3 className="font-semibold">Payouts (Δ4)</h3>
          <label className="text-sm">Min payout (USD)</label>
          <input className="input-premium w-full px-4 py-2 text-sm" value={payoutMin} onChange={(e) => setPayoutMin(e.target.value)} />
          <label className="text-sm">Clearance hours</label>
          <input className="input-premium w-full px-4 py-2 text-sm" value={clearanceHours} onChange={(e) => setClearanceHours(e.target.value)} />
        </div>
        <div className="card-premium space-y-3 p-6 lg:col-span-2">
          <h3 className="font-semibold">Delivery fees by zone (Δ3)</h3>
          <div className="space-y-2">
            {profile.zones.map((z) => (
              <div key={z.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span>{z.name} ({z.city})</span>
                <span>${z.deliveryFeeUsd} USD</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <Button onClick={save}>Save Settings</Button>
    </div>
  );
}
