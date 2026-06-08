"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { ProductCard } from "@/components/landing/product-card";
import { products } from "@/lib/mock-data";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { Button } from "@/components/ui/button";

export default function SellerStorefrontPreviewPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const storeProducts = products.filter((p) => p.seller === "TechZone Store");

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Aperçu vitrine" : "Storefront Preview"} backHref="/seller/storefront" />
      <div className="card-premium p-6">
        <div className="h-32 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600" />
        <h2 className="mt-4 text-xl font-bold">TechZone Store</h2>
        <p className="text-sm text-slate-500">{fr ? "Électronique premium · ⭐ 4.8" : "Premium electronics · ⭐ 4.8"}</p>
        <Button onClick={() => toast(fr ? "Vitrine publiée" : "Storefront published")} className="mt-4">
          {fr ? "Publier" : "Publish"}
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {storeProducts.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
      <Link href="/shop/stores/1" className="text-sm text-sky-600 hover:underline">{fr ? "Voir côté client →" : "View as customer →"}</Link>
    </div>
  );
}
