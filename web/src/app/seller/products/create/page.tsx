"use client";

import { PageHeader } from "@/components/ui/page-header";
import { ProductWizard } from "@/components/seller/product-wizard";
import { useLocale } from "@/context/locale-context";

export default function SellerProductCreatePage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("createProduct")}
        subtitle={fr ? "Assistant en 4 étapes — titre EN/FR, photo, prix et stock" : "4-step wizard — EN/FR title, photo, price & stock"}
        backHref="/seller/products"
      />
      <ProductWizard />
    </div>
  );
}
