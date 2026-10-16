"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { ProductWizard } from "@/components/seller/product-wizard";
import { useLocale } from "@/context/locale-context";
import { useSellerData } from "@/lib/seller";

export default function SellerProductEditPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { getRawProduct, productsLoaded } = useSellerData();
  const product = getRawProduct(id);

  if (!product) {
    return (
      <div className="p-8 text-center text-slate-500">
        {productsLoaded ? (fr ? "Produit introuvable" : "Product not found") : fr ? "Chargement…" : "Loading…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? `Modifier : ${product.name}` : `Edit: ${product.name}`}
        subtitle={fr ? "Seuls les champs enregistrés par la plateforme sont modifiables" : "Only the fields the platform stores can be edited"}
        backHref={`/seller/products/${product.id}`}
      />
      <ProductWizard key={product.id} product={product} />
    </div>
  );
}
