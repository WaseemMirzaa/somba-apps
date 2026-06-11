"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { getCategory } from "@/lib/admin-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function AdminCategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const category = getCategory(Number(id));
  const fr = locale === "fr";

  if (!category) return <div className="p-8 text-center text-slate-500">Category not found</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? category.nameFr : category.name} subtitle={`AF-18 · Category ${category.id}`} backHref="/admin/categories" />
      <DetailSection title={fr ? "Détails" : "Details"}>
        <InfoGrid items={[
          { label: "ID", value: category.id },
          { label: fr ? "Nom EN" : "Name EN", value: category.name },
          { label: fr ? "Nom FR" : "Name FR", value: category.nameFr },
          { label: "Icon", value: category.icon },
        ]} />
        <Button className="mt-4" size="sm" onClick={() => toast(fr ? "Catégorie enregistrée" : "Category saved")}>{fr ? "Enregistrer" : "Save"}</Button>
      </DetailSection>
    </div>
  );
}
