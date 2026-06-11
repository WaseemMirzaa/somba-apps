"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { statusLabel, severityLabel } from "@/lib/locale-helpers";
import { getFraudAlert } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";

const severityVariant = { low: "default", medium: "warning", high: "danger" } as const;

export default function AdminFraudDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const alert = getFraudAlert(id);

  if (!alert) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={alert.id}
        subtitle={String(alert.type).replace("_", " ")}
        backHref="/admin/fraud"
        actions={<Badge variant={severityVariant[alert.severity]}>{severityLabel(locale, alert.severity)}</Badge>}
      />
      <DetailSection title={t("fraudDetail")}>
        <InfoGrid items={[
          { label: t("customer"), value: alert.customer },
          ...(alert.orderId ? [{ label: t("order"), value: <Link href={`/admin/orders/${alert.orderId}`} className="text-blue-600 hover:underline">{alert.orderId}</Link> }] : []),
          { label: t("score"), value: <span className="font-bold text-red-600">{alert.score}</span> },
          { label: t("status"), value: <Badge variant={alert.status === "blocked" ? "danger" : "info"}>{statusLabel(locale, alert.status)}</Badge> },
          { label: t("date"), value: alert.date },
        ]} />
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => toast("Alert marked reviewed")}>{t("reviewed")}</Button>
          <Button variant="secondary" size="sm" onClick={() => toast("Customer blocked")}>{t("blocked")}</Button>
        </div>
      </DetailSection>
    </div>
  );
}
