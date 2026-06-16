"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { Shield, AlertTriangle, Ban } from "lucide-react";
import { fraudAlerts } from "@/lib/admin-entities";

const severityVariant = { low: "default", medium: "warning", high: "danger" } as const;

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "reviewed", label: "Reviewed", labelFr: "Examiné" },
  { value: "blocked", label: "Blocked", labelFr: "Bloqué" },
];

export default function AdminFraudPage() {
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const filtered = useMemo(
    () =>
      applyListFilters(fraudAlerts, filters, {
        searchFields: ["id", "customer", "orderId", "type"],
        dateField: "date",
        statusField: "status",
      }),
    [filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Fraud & Payment Risk" subtitle="Static mock scoring — OTP failures, velocity, address blocks" breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Fraud" }]} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Open Alerts" value={fraudAlerts.filter((a) => a.status === "open").length} icon={AlertTriangle} />
        <StatCard title="Blocked" value={fraudAlerts.filter((a) => a.status === "blocked").length} icon={Ban} />
        <StatCard title="Avg Risk Score" value="71" icon={Shield} trend="OTP verification enabled" />
      </div>

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder="Alert ID, customer, order…"
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: "Alert" },
              { key: "type", label: "Type", render: (r) => <Badge>{String(r.type).replace("_", " ")}</Badge> },
              { key: "customer", label: "Customer" },
              { key: "orderId", label: "Order", render: (r) => r.orderId ? <Link href={`/admin/orders/${r.orderId}`} className="text-[var(--primary)]">{String(r.orderId)}</Link> : "—" },
              { key: "score", label: "Score", render: (r) => <span className="font-bold text-red-600">{String(r.score)}</span> },
              { key: "severity", label: "Severity", render: (r) => <Badge variant={severityVariant[r.severity as keyof typeof severityVariant]}>{String(r.severity)}</Badge> },
              { key: "status", label: "Status", render: (r) => <Badge variant={r.status === "blocked" ? "danger" : "info"}>{String(r.status)}</Badge> },
              { key: "date", label: "Date" },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
