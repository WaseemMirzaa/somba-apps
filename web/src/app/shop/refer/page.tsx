"use client";

import { Gift } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";

export default function ShopReferPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title={fr ? "Parrainer et gagner" : "Refer & Earn"}
        breadcrumbs={[{ label: fr ? "Mon compte" : "Account", href: "/shop/account" }, { label: fr ? "Parrainer et gagner" : "Refer & Earn" }]}
      />
      <div className="card-premium p-10 text-center">
        <Gift className="mx-auto h-12 w-12 text-violet-600" />
        <h2 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-bold">
          {fr ? "Programme de parrainage bientôt disponible" : "Referral programme coming soon"}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {fr
            ? "Nous préparons le parrainage. Dès son lancement, vous retrouverez ici votre code et vos gains réels."
            : "We are getting referrals ready. When it launches, your code and real earnings will appear here."}
        </p>
      </div>
    </div>
  );
}
