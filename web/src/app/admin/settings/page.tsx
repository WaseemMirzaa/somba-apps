"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useMarket } from "@/context/market-context";
import { useToast } from "@/context/toast-context";
import { BUSINESS, COMMISSION_CATEGORIES, MOBILE_MONEY, RETURNS } from "@/lib/config";

export default function AdminSettingsPage() {
  const { locale, t } = useLocale();
  const { profile } = useMarket();
  const { toast } = useToast();
  const fr = locale === "fr";

  const [defaultCommission, setDefaultCommission] = useState(String(BUSINESS.commission.default));
  const [categoryRates, setCategoryRates] = useState<Record<string, string>>(
    Object.fromEntries(COMMISSION_CATEGORIES.map((c) => [c.id, String(c.rate)]))
  );
  const [fxRate, setFxRate] = useState(String(profile.fxRateUsdCdf ?? 2850));
  const [payoutMin, setPayoutMin] = useState(String(profile.payoutMinUsd));
  const [clearanceHours, setClearanceHours] = useState(String(profile.payoutClearanceHours));
  const [twoFa, setTwoFa] = useState(true);

  function save() {
    toast(fr ? "Paramètres enregistrés (journalisés)" : "Settings saved (audit logged)", "success");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings")}
        subtitle={fr ? "Paiements, commissions, retours, devise et zones" : "Payments, commissions, returns, currency & zones"}
      />

      {/* Per-category commission (Q10) */}
      <div className="card-premium space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">{fr ? "Commission par catégorie" : "Commission by category"}</h3>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-500">{fr ? "Par défaut" : "Default"}</label>
            <div className="flex items-center">
              <input className="input-premium w-20 px-3 py-1.5 text-sm" value={defaultCommission} onChange={(e) => setDefaultCommission(e.target.value)} />
              <span className="ml-1 text-slate-400">%</span>
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMMISSION_CATEGORIES.map((c) => (
            <div key={c.id} className="rounded-xl border border-[var(--border)] p-3">
              <p className="text-sm font-medium text-slate-700">{fr ? c.labelFr : c.label}</p>
              <div className="mt-2 flex items-center">
                <input
                  className="input-premium w-full px-3 py-1.5 text-sm"
                  value={categoryRates[c.id]}
                  onChange={(e) => setCategoryRates((r) => ({ ...r, [c.id]: e.target.value }))}
                />
                <span className="ml-1 text-slate-400">%</span>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          {fr ? "Une catégorie sans taux propre utilise la valeur par défaut." : "Categories without an override use the default rate."}
        </p>
      </div>

      {/* Payment methods (Q7 / Q8) */}
      <div className="card-premium space-y-3 p-6">
        <h3 className="font-semibold">{fr ? "Méthodes de paiement" : "Payment methods"}</h3>
        <div className="flex flex-wrap gap-2">
          <Badge variant="primary">Stripe — {fr ? "Carte" : "Card"}</Badge>
          {MOBILE_MONEY.map((m) => (
            <Badge key={m.id} variant="success">{m.label}</Badge>
          ))}
          <Badge variant="default">{fr ? "Portefeuille" : "Wallet"}</Badge>
          <Badge variant="danger">{fr ? "Paiement à la livraison — désactivé" : "Cash on Delivery — disabled"}</Badge>
        </div>
        <p className="text-xs text-slate-400">
          {fr ? "Mobile money : Airtel Congo, Orange Telecom, Vodacom (M-Pesa)." : "Mobile money via Airtel Congo, Orange Telecom, Vodacom (M-Pesa)."}
        </p>
      </div>

      {/* Security & access (admin 2FA) */}
      <div className="card-premium space-y-3 p-6">
        <h3 className="font-semibold">{fr ? "Sécurité et accès" : "Security & access"}</h3>
        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] p-4">
          <div>
            <p className="text-sm font-medium text-slate-800">{fr ? "Authentification à deux facteurs (2FA)" : "Two-factor authentication (2FA)"}</p>
            <p className="text-xs text-slate-500">{fr ? "Exiger un code OTP à la connexion admin." : "Require an OTP at admin login."}</p>
          </div>
          <button
            type="button"
            onClick={() => setTwoFa((v) => !v)}
            role="switch"
            aria-checked={twoFa}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${twoFa ? "bg-[var(--primary)]" : "bg-slate-300"}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${twoFa ? "translate-x-5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <p className="text-xs text-slate-400">{fr ? "L'accès par rôle est géré dans Rôles et permissions." : "Role-based access is managed in Roles & permissions."}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Returns policy (Q18–Q20) */}
        <div className="card-premium space-y-3 p-6">
          <h3 className="font-semibold">{fr ? "Politique de retour" : "Returns policy"}</h3>
          <p className="text-sm text-slate-600">
            {fr ? `Fenêtre de retour : ${RETURNS.windowDays} jours` : `Return window: ${RETURNS.windowDays} days`}
          </p>
          <p className="text-sm font-medium text-slate-700">{fr ? "Catégories non retournables :" : "Non-returnable categories:"}</p>
          <div className="flex flex-wrap gap-2">
            {RETURNS.nonReturnableCategories.map((c) => (
              <Badge key={c.label} variant="warning">{fr ? c.labelFr : c.label}</Badge>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            {fr
              ? "Frais de retour : vendeur et plateforme. Remboursement : méthode d'origine + crédit magasin."
              : "Return cost: seller & platform. Refund: original method + store credit."}
          </p>
        </div>

        {/* Currency / FX (Q6) */}
        <div className="card-premium space-y-3 p-6">
          <h3 className="font-semibold">{fr ? "Devise et taux de change" : "Currency & FX"}</h3>
          <p className="text-sm text-slate-600">USD + CDF</p>
          <label className="text-sm">{fr ? "USD → CDF (manuel)" : "USD → CDF (manual)"}</label>
          <input className="input-premium w-full px-4 py-2 text-sm" value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
        </div>

        {/* Payouts (Q9) */}
        <div className="card-premium space-y-3 p-6">
          <h3 className="font-semibold">{fr ? "Paiements vendeurs" : "Seller payouts"}</h3>
          <p className="text-sm text-slate-600">{fr ? "Hebdomadaire · Virement bancaire + mobile money" : "Weekly · Bank transfer + mobile money"}</p>
          <label className="text-sm">{fr ? "Min. paiement (USD)" : "Min payout (USD)"}</label>
          <input className="input-premium w-full px-4 py-2 text-sm" value={payoutMin} onChange={(e) => setPayoutMin(e.target.value)} />
          <label className="text-sm">{fr ? "Heures de compensation" : "Clearance hours"}</label>
          <input className="input-premium w-full px-4 py-2 text-sm" value={clearanceHours} onChange={(e) => setClearanceHours(e.target.value)} />
        </div>

        {/* Delivery zones (Q3) */}
        <div className="card-premium space-y-3 p-6">
          <h3 className="font-semibold">{fr ? "Zones de livraison (par commune)" : "Delivery zones (by commune)"}</h3>
          <div className="space-y-2">
            {profile.zones.map((z) => (
              <div key={z.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span>{z.name} ({z.city})</span>
                <span>${z.deliveryFeeUsd} USD</span>
              </div>
            ))}
          </div>
          <a href="/admin/zones" className="text-sm font-semibold text-[var(--primary)] hover:underline">
            {fr ? "Gérer les zones →" : "Manage zones →"}
          </a>
        </div>
      </div>

      <Button onClick={save}>{fr ? "Enregistrer" : "Save Settings"}</Button>
    </div>
  );
}
