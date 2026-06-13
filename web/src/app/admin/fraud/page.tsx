"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Shield, AlertTriangle, Ban } from "lucide-react";
import { fraudAlerts } from "@/lib/admin-entities";
import { useLocale } from "@/context/locale-context";

const severityVariant = { low: "default", medium: "warning", high: "danger" } as const;

export default function AdminFraudPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Fraude & Risques" : "Fraud & Risk"}
        subtitle={fr ? "Scores de risque — échecs OTP, vélocité, blocages d'adresse" : "Risk scoring — OTP failures, velocity, address blocks"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Fraude" : "Fraud" }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "Alertes ouvertes" : "Open Alerts"} value={fraudAlerts.filter((a) => a.status === "open").length} icon={AlertTriangle} />
        <StatCard title={fr ? "Bloqués" : "Blocked"} value={fraudAlerts.filter((a) => a.status === "blocked").length} icon={Ban} />
        <StatCard title={fr ? "Score moyen" : "Avg Risk Score"} value="71" icon={Shield} trend={fr ? "Vérification OTP active" : "OTP verification active"} />
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: fr ? "Alerte" : "Alert" },
              { key: "type", label: "Type", render: (r) => <Badge>{String(r.type).replace("_", " ")}</Badge> },
              { key: "customer", label: fr ? "Client" : "Customer" },
              { key: "orderId", label: fr ? "Commande" : "Order", render: (r) => r.orderId ? <Link href={`/admin/orders/${r.orderId}`} className="text-blue-600">{String(r.orderId)}</Link> : "—" },
              { key: "score", label: "Score", render: (r) => <span className="font-bold text-red-600">{String(r.score)}</span> },
              { key: "severity", label: fr ? "Sévérité" : "Severity", render: (r) => <Badge variant={severityVariant[r.severity as keyof typeof severityVariant]}>{String(r.severity)}</Badge> },
              { key: "status", label: fr ? "Statut" : "Status", render: (r) => <Badge variant={r.status === "blocked" ? "danger" : "info"}>{String(r.status)}</Badge> },
            ]}
            data={fraudAlerts as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
