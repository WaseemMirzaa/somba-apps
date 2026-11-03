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
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { useAdminData } from "@/lib/admin";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useLocale } from "@/context/locale-context";
import { Button } from "@/components/ui/button";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { useToast } from "@/context/toast-context";
import { useRealtime } from "@/context/realtime-context";
import { errMsg } from "@/lib/admin-live";
import { canSuspendAccounts, fraudDialogText, type FraudDialogMode } from "@/lib/fraud-block";
import { useCodOffered } from "@/lib/use-cod-offered";

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
const STATUS_OPTIONS = [
  { value: "open", label: "Open", labelFr: "Ouvert" },
  { value: "reviewed", label: "Reviewed", labelFr: "Examiné" },
  { value: "blocked", label: "Blocked", labelFr: "Bloqué" },
];

export default function AdminFraudPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const codOffered = useCodOffered();
  const { fraudAlerts, setFraudStatus, loading, error, reload } = useAdminData({ fraud: true });
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Block / unblock suspends / reactivates the account, so it waits for a confirmation.
  const [pending, setPending] = useState<{ id: string; customer: string; status: "open" | "reviewed" | "blocked"; mode: FraudDialogMode } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const canSuspend = canSuspendAccounts(useRealtime().user?.role);
  const avgScore = fraudAlerts.length ? Math.round(fraudAlerts.reduce((s, a) => s + a.score, 0) / fraudAlerts.length) : 0;

  async function setStatus(id: string, status: "open" | "reviewed" | "blocked", opts?: { confirm?: boolean; done?: string }) {
    setBusyId(id);
    try {
      await setFraudStatus(id, status, opts?.confirm === true);
      toast(opts?.done ?? (fr ? "Statut de l'alerte mis à jour" : "Alert status updated"), "success");
      return true;
    } catch (e) {
      toast(errMsg(e), "error");
      setDialogError(errMsg(e));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  /** A change that touches the account (blocking, or moving a blocked alert on) asks first. */
  function change(r: { id: string; customer: string; status: string }, status: "open" | "reviewed" | "blocked") {
    if (status === "blocked" || r.status === "blocked") {
      setDialogError(null);
      setPending({ id: r.id, customer: r.customer, status, mode: status === "blocked" ? "block" : "unblock" });
    } else {
      void setStatus(r.id, status);
    }
  }

  async function confirmPending() {
    if (!pending) return;
    const text = fraudDialogText(pending.mode, pending.customer, fr);
    if (await setStatus(pending.id, pending.status, { confirm: true, done: text.done })) setPending(null);
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
      <PageHeader title={fr ? "Fraude et risque de paiement" : "Fraud & Payment Risk"} subtitle={codOffered ? (fr ? "Alertes levées par le serveur (ex. commandes COD au-dessus du plafond) — examinez-les ; bloquer suspend le compte du client" : "Alerts raised by the server (e.g. COD orders above the cap) — review them; blocking suspends the customer's account") : (fr ? "Alertes levées par le serveur — examinez-les ; bloquer suspend le compte du client" : "Alerts raised by the server — review them; blocking suspends the customer's account")} breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Fraude" : "Fraud" }]} />

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

      {error && <SectionError message={error} onRetry={reload} />}
      {loading && !error && <SectionLoading />}

      {!loading && !error && (
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              { key: "id", label: fr ? "Alerte" : "Alert" },
              { key: "type", label: t("type"), render: (r) => <Badge>{fr ? (TYPE_FR[String(r.type)] ?? String(r.type).replace("_", " ")) : (TYPE_EN[String(r.type)] ?? String(r.type).replace("_", " "))}</Badge> },
              { key: "customer", label: t("customer"), render: (r) => <span>{String(r.customer)}</span> },
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
                  const row = { id, customer: String(r.customer), status: st };
                  // Moving a blocked alert on lifts the block, which only a role that may suspend accounts can do.
                  const mayMove = st !== "blocked" || canSuspend;
                  return (
                    <div className="flex flex-wrap gap-2">
                      {st !== "reviewed" && mayMove && <Button size="sm" variant="approve" disabled={busyId === id} onClick={() => change(row, "reviewed")}>{fr ? "Marquer examiné" : "Mark reviewed"}</Button>}
                      {st !== "blocked" && canSuspend && <Button size="sm" variant="reject" disabled={busyId === id} onClick={() => change(row, "blocked")}>{fr ? "Bloquer" : "Block"}</Button>}
                      {st !== "open" && mayMove && <Button size="sm" variant="secondary" disabled={busyId === id} onClick={() => change(row, "open")}>{fr ? "Rouvrir" : "Reopen"}</Button>}
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
      )}

      {!canSuspend && (
        <p className="text-xs text-slate-500">
          {fr ? "Seul un super admin ou un admin support peut bloquer un compte ; vous pouvez marquer les alertes comme examinées." : "Only a super admin or support admin can block an account; you can mark alerts as reviewed."}
        </p>
      )}

      <Modal
        open={!!pending}
        onClose={() => { if (!busyId) setPending(null); }}
        title={pending ? fraudDialogText(pending.mode, pending.customer, fr).title : ""}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setPending(null)} disabled={!!busyId}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={() => void confirmPending()} disabled={!!busyId}>
              {busyId ? "…" : pending ? fraudDialogText(pending.mode, pending.customer, fr).confirm : ""}
            </Button>
          </>
        }
      >
        <p>{pending ? fraudDialogText(pending.mode, pending.customer, fr).body : ""}</p>
        <ErrorNote message={dialogError} />
      </Modal>
    </div>
  );
}
