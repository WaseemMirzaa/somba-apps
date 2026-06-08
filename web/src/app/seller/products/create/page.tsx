"use client";

import { PageHeader } from "@/components/ui/page-header";
import { ProductWizard } from "@/components/seller/product-wizard";
import { useLocale } from "@/context/locale-context";

export default function SellerProductCreatePage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("createProduct")}
        subtitle="7-step interactive wizard — bilingual EN/FR content"
        backHref="/seller/products"
      />
      <ProductWizard />
    </div>
  );
}
