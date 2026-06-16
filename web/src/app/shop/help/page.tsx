"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { FAQ_ITEMS } from "@/lib/product-landing";
import { useLocale } from "@/context/locale-context";

export default function ShopHelpPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title={fr ? "Aide" : "Help"} />
      <div className="space-y-3">
        {FAQ_ITEMS.map((item, i) => (
          <details key={i} className="card-premium p-4">
            <summary className="cursor-pointer font-medium">{fr ? item.qFr : item.q}</summary>
            <p className="mt-2 text-sm text-slate-600">{fr ? item.aFr : item.a}</p>
          </details>
        ))}
      </div>
      <div className="card-premium border-red-100 p-4">
        <p className="font-medium text-red-800">{fr ? "Suppression de compte" : "Account deletion"}</p>
        <p className="mt-1 text-sm text-slate-600">{fr ? "Demandez la suppression de vos données personnelles." : "Request deletion of your personal data."}</p>
        <Link href="/shop/account/delete" className="mt-3 inline-block text-sm font-medium text-red-600 hover:underline">
          {fr ? "Demander la suppression →" : "Request deletion →"}
        </Link>
      </div>
      <Link href="/shop/support" className="text-sm text-[var(--primary)] hover:underline">{fr ? "Ouvrir un ticket support" : "Open support ticket"}</Link>
    </div>
  );
}
