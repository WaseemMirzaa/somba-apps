"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useMarket } from "@/context/market-context";
import { useLocale } from "@/context/locale-context";
import { localizedField } from "@/lib/locale-helpers";
import { cn } from "@/lib/utils";

export default function SellerRegisterPage() {
  const { t, locale, setLocale } = useLocale();
  const { profile } = useMarket();
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: "", ownerName: "", email: "", phone: "", password: "",
    city: profile.cities[0]?.id ?? "", address: "", payoutDetails: "", terms: false,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push("/seller/pending");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title={t("sellerRegistration")} subtitle={t("sellerRegistrationSubtitle")} />
        <div className="flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          <button
            type="button"
            onClick={() => setLocale("en")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-semibold",
              locale === "en" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
            )}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLocale("fr")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-semibold",
              locale === "fr" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"
            )}
          >
            FR
          </button>
        </div>
      </div>
      <form onSubmit={submit} className="card-premium space-y-4 p-6">
        <input required className="input-premium w-full px-4 py-2 text-sm" placeholder={t("businessName")} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
        <input required className="input-premium w-full px-4 py-2 text-sm" placeholder={t("owner")} value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
        <input required type="email" className="input-premium w-full px-4 py-2 text-sm" placeholder={t("emailPlaceholder")} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input required className="input-premium w-full px-4 py-2 text-sm" placeholder={profile.phoneFormat} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input required type="password" className="input-premium w-full px-4 py-2 text-sm" placeholder={t("passwordPlaceholder")} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select required className="input-premium w-full px-4 py-2 text-sm" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
          {profile.cities.map((c) => <option key={c.id} value={c.id}>{localizedField(locale, c.name, c.nameFr)}</option>)}
        </select>
        <input required className="input-premium w-full px-4 py-2 text-sm" placeholder={t("address")} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <input required className="input-premium w-full px-4 py-2 text-sm" placeholder={t("payoutDetails")} value={form.payoutDetails} onChange={(e) => setForm({ ...form, payoutDetails: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" required checked={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.checked })} />
          {t("acceptTerms")}
        </label>
        <Button type="submit" className="w-full">{t("submitRegistration")}</Button>
        <p className="text-center text-xs text-slate-500">{t("noDocumentsRequired")}</p>
      </form>
      <Link href="/login" className="block text-center text-sm text-blue-600">{t("alreadyRegistered")}</Link>
    </div>
  );
}
