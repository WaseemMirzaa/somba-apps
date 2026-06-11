"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { getCategory } from "@/lib/admin-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { localizedField } from "@/lib/locale-helpers";

export default function AdminCategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const { toast } = useToast();
  const category = getCategory(Number(id));

  if (!category) return <div className="p-8 text-center text-slate-500">{t("categoryNotFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={localizedField(locale, category.name, category.nameFr)} subtitle={`AF-18 · Category ${category.id}`} backHref="/admin/categories" />
      <DetailSection title={t("details")}>
        <InfoGrid items={[
          { label: "ID", value: category.id },
          { label: t("nameEn"), value: category.name },
          { label: t("nameFr"), value: category.nameFr },
          { label: "Icon", value: category.icon },
        ]} />
        <Button className="mt-4" size="sm" onClick={() => toast(t("categorySaved"))}>{t("save")}</Button>
      </DetailSection>
    </div>
  );
}
