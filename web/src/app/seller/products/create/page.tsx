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
        subtitle={fr ? "Assistant interactif en 7 étapes — contenu bilingue EN/FR" : "7-step interactive wizard — bilingual EN/FR content"}
        backHref="/seller/products"
      />
      <ProductWizard />
    </div>
  );
}
