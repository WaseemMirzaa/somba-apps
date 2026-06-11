"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Shield, AlertTriangle, Ban } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { statusLabel, severityLabel } from "@/lib/locale-helpers";
import { fraudAlerts } from "@/lib/admin-entities";

const severityVariant = { low: "default", medium: "warning", high: "danger" } as const;

export default function AdminFraudPage() {
  const { t, locale } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("fraudCod")}
        subtitle={t("fraudSubtitle")}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("fraudCod") }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={t("openAlerts")} value={fraudAlerts.filter((a) => a.status === "open").length} icon={AlertTriangle} />
        <StatCard title={t("blocked")} value={fraudAlerts.filter((a) => a.status === "blocked").length} icon={Ban} />
        <StatCard title={t("avgRiskScore")} value="71" icon={Shield} trend={t("codOtpEnabled")} />
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: t("alert"), render: (r) => (
                <Link href={`/admin/fraud/${r.id}`} className="font-medium text-blue-600 hover:underline">{String(r.id)}</Link>
              )},
              { key: "type", label: t("type"), render: (r) => <Badge>{String(r.type).replace("_", " ")}</Badge> },
              { key: "customer", label: t("customer") },
              { key: "orderId", label: t("order"), render: (r) => r.orderId ? <Link href={`/admin/orders/${r.orderId}`} className="text-blue-600">{String(r.orderId)}</Link> : "—" },
              { key: "score", label: t("score"), render: (r) => <span className="font-bold text-red-600">{String(r.score)}</span> },
              { key: "severity", label: t("severity"), render: (r) => <Badge variant={severityVariant[r.severity as keyof typeof severityVariant]}>{severityLabel(locale, String(r.severity))}</Badge> },
              { key: "status", label: t("status"), render: (r) => <Badge variant={r.status === "blocked" ? "danger" : "info"}>{statusLabel(locale, String(r.status))}</Badge> },
              { key: "actions", label: t("action"), render: (r) => (
                <Link href={`/admin/fraud/${r.id}`} className="text-sm text-blue-600 hover:underline">{t("view")}</Link>
              )},
            ]}
            data={fraudAlerts as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
