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
import { useLocale } from "@/context/locale-context";

const severityVariant = { low: "default", medium: "warning", high: "danger" } as const;
const SEVERITY_FR: Record<string, string> = { low: "Faible", medium: "Moyenne", high: "Élevée" };
const STATUS_FR: Record<string, string> = { open: "Ouvert", reviewed: "Examiné", blocked: "Bloqué" };

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "reviewed", label: "Reviewed", labelFr: "Examiné" },
  { value: "blocked", label: "Blocked", labelFr: "Bloqué" },
];

export default function AdminFraudPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
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
      <PageHeader title={fr ? "Fraude et risque de paiement" : "Fraud & Payment Risk"} subtitle={fr ? "Scoring fictif statique — échecs OTP, vélocité, blocages d'adresse" : "Static mock scoring — OTP failures, velocity, address blocks"} breadcrumbs={[{ label: fr ? "Admin" : "Admin", href: "/admin" }, { label: fr ? "Fraude" : "Fraud" }]} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "Alertes ouvertes" : "Open Alerts"} value={fraudAlerts.filter((a) => a.status === "open").length} icon={AlertTriangle} />
        <StatCard title={fr ? "Bloquées" : "Blocked"} value={fraudAlerts.filter((a) => a.status === "blocked").length} icon={Ban} />
        <StatCard title={fr ? "Score de risque moyen" : "Avg Risk Score"} value="71" icon={Shield} trend={fr ? "Vérification OTP activée" : "OTP verification enabled"} />
      </div>

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={STATUS_OPTIONS}
        searchPlaceholder={fr ? "ID d'alerte, client, commande…" : "Alert ID, customer, order…"}
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: fr ? "Alerte" : "Alert" },
              { key: "type", label: "Type", render: (r) => <Badge>{String(r.type).replace("_", " ")}</Badge> },
              { key: "customer", label: fr ? "Client" : "Customer" },
              { key: "orderId", label: fr ? "Commande" : "Order", render: (r) => r.orderId ? <Link href={`/admin/orders/${r.orderId}`} className="text-[var(--primary)]">{String(r.orderId)}</Link> : "—" },
              { key: "score", label: "Score", render: (r) => <span className="font-bold text-red-600">{String(r.score)}</span> },
              { key: "severity", label: fr ? "Gravité" : "Severity", render: (r) => <Badge variant={severityVariant[r.severity as keyof typeof severityVariant]}>{fr ? (SEVERITY_FR[String(r.severity)] ?? String(r.severity)) : String(r.severity)}</Badge> },
              { key: "status", label: fr ? "Statut" : "Status", render: (r) => <Badge variant={r.status === "blocked" ? "danger" : "info"}>{fr ? (STATUS_FR[String(r.status)] ?? String(r.status)) : String(r.status)}</Badge> },
              { key: "date", label: "Date" },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
