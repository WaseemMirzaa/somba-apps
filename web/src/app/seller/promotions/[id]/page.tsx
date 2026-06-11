"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getPromotion } from "@/lib/seller-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerPromotionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const promo = getPromotion(id);
  const [status, setStatus] = useState(promo?.status ?? "active");

  if (!promo) {
    return <div className="p-8 text-center text-slate-500">Campaign not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title={promo.campaign} subtitle={`${promo.discount}% off`} backHref="/seller/promotions" actions={<Badge variant={status === "active" ? "success" : "warning"}>{status}</Badge>} />

      <div className="grid gap-6 lg:grid-cols-2">
        <DetailSection title="Overview">
          <InfoGrid items={[
            { label: "Campaign Name", value: promo.campaign },
            { label: "Budget", value: formatCurrency(promo.budget, locale) },
            { label: "Products", value: promo.products },
            { label: "Discount", value: `${promo.discount}%` },
            { label: "Period", value: `${promo.startDate} → ${promo.endDate}` },
          ]} />
        </DetailSection>

        <DetailSection title="Performance">
          <InfoGrid columns={3} items={[
            { label: "Views", value: promo.views.toLocaleString() },
            { label: "Clicks", value: promo.clicks },
            { label: "Orders", value: promo.orders },
            { label: "Revenue", value: formatCurrency(promo.revenue, locale) },
            { label: "ROI", value: `${promo.roi}x` },
          ]} />
          <Link href="/seller/analytics" className="mt-4 inline-block text-sm text-sky-600 hover:underline">Full Analytics →</Link>
        </DetailSection>
      </div>
      <div className="flex gap-2">
        {status === "active" ? (
          <Button variant="secondary" onClick={() => { setStatus("paused"); toast("Campaign paused"); }}>Pause Campaign</Button>
        ) : (
          <Button onClick={() => { setStatus("active"); toast("Campaign resumed"); }}>Resume Campaign</Button>
        )}
        <Button variant="secondary" onClick={() => toast("Edit form opened", "info")}>Edit Campaign</Button>
      </div>
    </div>
  );
}
