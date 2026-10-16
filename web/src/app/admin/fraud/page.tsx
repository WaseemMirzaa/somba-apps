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
import { useAdminData } from "@/lib/admin";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useLocale } from "@/context/locale-context";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { errMsg } from "@/lib/admin-live";

const severityVariant = { low: "default", medium: "warning", high: "danger" } as const;
const SEVERITY_FR: Record<string, string> = { low: "Faible", medium: "Moyenne", high: "Élevée" };
const STATUS_FR: Record<string, string> = { open: "Ouvert", reviewed: "Examiné", blocked: "Bloqué" };
const TYPE_FR: Record<string, string> = {
  cod_risk: "Risque de paiement",
  otp_fail: "Échec OTP",
  velocity: "Vélocité",
  address_block: "Blocage d'adresse",
};
const TYPE_EN: Record<string, string> = {
  cod_risk: "Payment risk",
  otp_fail: "OTP fail",
  velocity: "Velocity",
  address_block: "Address block",
};
// Generic (non-person-name) customer labels that need translation.
const CUSTOMER_FR: Record<string, string> = {
  "Unknown User": "Utilisateur inconnu",
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "reviewed", label: "Reviewed", labelFr: "Examiné" },
  { value: "blocked", label: "Blocked", labelFr: "Bloqué" },
];

export default function AdminFraudPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { fraudAlerts, setFraudStatus } = useAdminData();
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  const avgScore = fraudAlerts.length ? Math.round(fraudAlerts.reduce((s, a) => s + a.score, 0) / fraudAlerts.length) : 0;

  async function setStatus(id: string, status: "open" | "reviewed" | "blocked") {
    setBusyId(id);
    try {
      await setFraudStatus(id, status);
      toast(fr ? "Statut de l'alerte mis à jour" : "Alert status updated", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(
    () =>
      applyListFilters(fraudAlerts, filters, {
        searchFields: ["id", "customer", "orderId", "type"],
        dateField: "date",
        statusField: "status",
      }),
    [fraudAlerts, filters]
  );

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Fraude et risque de paiement" : "Fraud & Payment Risk"} subtitle={fr ? "Alertes levées par le serveur (ex. commandes COD au-dessus du plafond) — vous les examinez ou les bloquez" : "Alerts raised by the server (e.g. COD orders above the cap) — review or block them"} breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Fraude" : "Fraud" }]} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "Alertes ouvertes" : "Open Alerts"} value={fraudAlerts.filter((a) => a.status === "open").length} icon={AlertTriangle} />
        <StatCard title={fr ? "Bloquées" : "Blocked"} value={fraudAlerts.filter((a) => a.status === "blocked").length} icon={Ban} />
        <StatCard title={fr ? "Score de risque moyen" : "Avg Risk Score"} value={fraudAlerts.length ? avgScore : "—"} icon={Shield} />
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
              { key: "type", label: t("type"), render: (r) => <Badge>{fr ? (TYPE_FR[String(r.type)] ?? String(r.type).replace("_", " ")) : (TYPE_EN[String(r.type)] ?? String(r.type).replace("_", " "))}</Badge> },
              { key: "customer", label: t("customer"), render: (r) => <span>{fr ? (CUSTOMER_FR[String(r.customer)] ?? String(r.customer)) : String(r.customer)}</span> },
              { key: "orderId", label: fr ? "Commande" : "Order", render: (r) => r.orderId ? <Link href={`/admin/orders/${r.orderId}`} className="text-[var(--primary)]">{String(r.orderId)}</Link> : "—" },
              { key: "score", label: "Score", render: (r) => <span className="font-bold text-red-600">{String(r.score)}</span> },
              { key: "severity", label: fr ? "Gravité" : "Severity", render: (r) => <Badge variant={severityVariant[r.severity as keyof typeof severityVariant]}>{fr ? (SEVERITY_FR[String(r.severity)] ?? String(r.severity)) : String(r.severity)}</Badge> },
              { key: "status", label: fr ? "Statut" : "Status", render: (r) => <Badge variant={r.status === "blocked" ? "danger" : "info"}>{fr ? (STATUS_FR[String(r.status)] ?? String(r.status)) : String(r.status)}</Badge> },
              { key: "date", label: t("date") },
              {
                key: "actions",
                label: t("action"),
                render: (r) => {
                  const id = String(r.id);
                  const st = String(r.status);
                  return (
                    <div className="flex flex-wrap gap-2">
                      {st !== "reviewed" && <Button size="sm" variant="approve" disabled={busyId === id} onClick={() => setStatus(id, "reviewed")}>{fr ? "Marquer examiné" : "Mark reviewed"}</Button>}
                      {st !== "blocked" && <Button size="sm" variant="reject" disabled={busyId === id} onClick={() => setStatus(id, "blocked")}>{fr ? "Bloquer" : "Block"}</Button>}
                      {st !== "open" && <Button size="sm" variant="secondary" disabled={busyId === id} onClick={() => setStatus(id, "open")}>{fr ? "Rouvrir" : "Reopen"}</Button>}
                    </div>
                  );
                },
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
            emptyMessage={fr ? "Aucune alerte" : "No alerts"}
          />
        </CardContent>
      </Card>
    </div>
  );
}
