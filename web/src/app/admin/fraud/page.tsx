"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Shield, AlertTriangle, Ban } from "lucide-react";
import { fraudAlerts } from "@/lib/admin-entities";

const severityVariant = { low: "default", medium: "warning", high: "danger" } as const;

export default function AdminFraudPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Fraud & COD Risk" subtitle="Static mock scoring — OTP failures, velocity, address blocks" breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Fraud" }]} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Open Alerts" value={fraudAlerts.filter((a) => a.status === "open").length} icon={AlertTriangle} />
        <StatCard title="Blocked" value={fraudAlerts.filter((a) => a.status === "blocked").length} icon={Ban} />
        <StatCard title="Avg Risk Score" value="71" icon={Shield} trend="COD OTP enabled" />
      </div>

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "Alert" },
              { key: "type", label: "Type", render: (r) => <Badge>{String(r.type).replace("_", " ")}</Badge> },
              { key: "customer", label: "Customer" },
              { key: "orderId", label: "Order", render: (r) => r.orderId ? <Link href={`/admin/orders/${r.orderId}`} className="text-blue-600">{String(r.orderId)}</Link> : "—" },
              { key: "score", label: "Score", render: (r) => <span className="font-bold text-red-600">{String(r.score)}</span> },
              { key: "severity", label: "Severity", render: (r) => <Badge variant={severityVariant[r.severity as keyof typeof severityVariant]}>{String(r.severity)}</Badge> },
              { key: "status", label: "Status", render: (r) => <Badge variant={r.status === "blocked" ? "danger" : "info"}>{String(r.status)}</Badge> },
            ]}
            data={fraudAlerts as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
