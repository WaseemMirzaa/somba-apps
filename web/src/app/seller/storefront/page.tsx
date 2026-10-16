"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { StoreProfileForm } from "@/components/seller/store-profile-form";
import { useLocale } from "@/context/locale-context";

export default function SellerStorefrontPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Paramètres vitrine" : "Storefront Settings"}
        subtitle={fr ? "La plateforme enregistre le nom de la boutique et l'adresse de collecte" : "The platform stores your store name and pickup address"}
        actions={<Link href="/seller/storefront/preview" className="text-sm text-[var(--primary)]">{fr ? "Aperçu →" : "Preview →"}</Link>}
      />
      <div className="card-premium p-6">
        <StoreProfileForm />
        <p className="mt-4 text-xs text-slate-500">
          {fr
            ? "Logo, bannière et description ne sont pas encore pris en charge par la plateforme."
            : "Logo, banner and description are not supported by the platform yet."}
        </p>
      </div>
    </div>
  );
}
