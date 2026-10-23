"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { StoreProfileForm } from "@/components/seller/store-profile-form";
import { StoreBrandingForm } from "@/components/seller/store-branding-form";
import { useLocale } from "@/context/locale-context";

export default function SellerStorefrontPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Paramètres vitrine" : "Storefront Settings"}
        subtitle={fr ? "Nom, adresse de collecte, logo, bannière et description de votre boutique" : "Your store name, pickup address, logo, banner and description"}
        actions={<Link href="/seller/storefront/preview" className="text-sm text-[var(--primary)]">{fr ? "Aperçu →" : "Preview →"}</Link>}
      />
      <div className="card-premium p-6">
        <h2 className="mb-4 font-semibold">{fr ? "Informations de la boutique" : "Store details"}</h2>
        <StoreProfileForm />
      </div>
      <div className="card-premium p-6">
        <h2 className="mb-1 font-semibold">{fr ? "Image de marque" : "Branding"}</h2>
        <p className="mb-4 text-xs text-slate-500">
          {fr ? "Affichés aux clients sur la page de votre boutique." : "Shown to shoppers on your store page."}
        </p>
        <StoreBrandingForm />
      </div>
    </div>
  );
}
