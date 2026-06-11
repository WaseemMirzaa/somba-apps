"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { getCmsBlock } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";

export default function AdminCmsBlockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLocale();
  const { toast } = useToast();
  const block = getCmsBlock(id);

  if (!block) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={block.title}
        subtitle={block.type}
        backHref="/admin/cms"
        actions={<Badge variant={block.active ? "success" : "default"}>{block.active ? t("active") : t("draft")}</Badge>}
      />
      <DetailGrid>
        <DetailGridSection title={t("cmsBlockDetail")}>
          <InfoGrid items={[
            { label: "ID", value: block.id },
            { label: t("type"), value: block.type },
            { label: t("editable"), value: block.editable ? "Yes" : "No" },
          ]} />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => toast(t("save"))}>{t("save")}</Button>
            <Link href="/"><Button variant="secondary" size="sm">{t("storefront")}</Button></Link>
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
