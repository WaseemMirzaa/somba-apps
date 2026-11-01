"use client";

import { PageHeader } from "@/components/ui/page-header";
import { PickupAreaBanner } from "@/components/seller/pickup-area-banner";
import { ProductWizard } from "@/components/seller/product-wizard";
import { useLocale } from "@/context/locale-context";

export default function SellerProductCreatePage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("createProduct")}
        subtitle={fr ? "Assistant en 4 étapes — titre EN/FR, photos, prix, stock, SKU et poids" : "4-step wizard — EN/FR title, photos, price, stock, SKU & weight"}
        backHref="/seller/products"
      />
      <PickupAreaBanner withLink />
      <ProductWizard />
    </div>
  );
}
