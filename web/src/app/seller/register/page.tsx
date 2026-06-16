"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useMarket } from "@/context/market-context";
import { useLocale } from "@/context/locale-context";

export default function SellerRegisterPage() {
  const { locale } = useLocale();
  const { profile } = useMarket();
  const router = useRouter();
  const [form, setForm] = useState({
    businessName: "", ownerName: "", email: "", phone: "", password: "",
    city: profile.cities[0]?.id ?? "", address: "", payoutDetails: "", terms: false,
  });
  const fr = locale === "fr";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    router.push("/seller/pending");
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      <PageHeader title={fr ? "Inscription vendeur" : "Seller Registration"} subtitle={fr ? "Sans KYC — informations de base" : "No KYC — basic business info"} />
      <form onSubmit={submit} className="card-premium space-y-4 p-6">
        <input required className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Nom de l'entreprise" : "Business name"} value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
        <input required className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Propriétaire" : "Owner name"} value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
        <input required type="email" className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "E-mail" : "Email"} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input required className="input-premium w-full px-4 py-2 text-sm" placeholder={profile.phoneFormat} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input required type="password" className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Mot de passe" : "Password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select required className="input-premium w-full px-4 py-2 text-sm" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })}>
          {profile.cities.map((c) => <option key={c.id} value={c.id}>{fr ? c.nameFr : c.name}</option>)}
        </select>
        <input required className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Adresse" : "Address"} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <input required className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Détails paiement" : "Payout details"} value={form.payoutDetails} onChange={(e) => setForm({ ...form, payoutDetails: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" required checked={form.terms} onChange={(e) => setForm({ ...form, terms: e.target.checked })} />
          {fr ? "J'accepte les conditions" : "I accept the terms"}
        </label>
        <Button type="submit" className="w-full">{fr ? "Soumettre" : "Submit Registration"}</Button>
        <p className="text-center text-xs text-slate-500">{fr ? "Aucun document requis (Δ1)" : "No documents required (Δ1)"}</p>
      </form>
      <Link href="/login" className="block text-center text-sm text-[var(--primary)]">{fr ? "Déjà inscrit ?" : "Already registered?"}</Link>
    </div>
  );
}
