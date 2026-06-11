"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getMarketingCampaign } from "@/lib/admin-entities";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";

export default function AdminMarketingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const campaign = getMarketingCampaign(id);

  if (!campaign) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        subtitle={campaign.id}
        backHref="/admin/marketing"
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("marketing"), href: "/admin/marketing" }, { label: campaign.id }]}
        actions={<Badge variant={campaign.status === "active" ? "success" : "warning"}>{statusLabel(locale, campaign.status)}</Badge>}
      />
      <DetailGrid>
        <DetailGridSection title={t("campaign")}>
          <InfoGrid items={[
            { label: t("type"), value: campaign.type },
            { label: t("reach"), value: campaign.reach },
            { label: t("budget"), value: `$${campaign.budget.toLocaleString()}` },
            { label: t("channels"), value: campaign.channels.join(", "), full: true },
          ]} />
          {campaign.type === "flash_sale" && (
            <Link href="/admin/flash-sales/FS-01" className="mt-4 inline-block text-sm text-blue-600 hover:underline">{t("flashSale")} →</Link>
          )}
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
