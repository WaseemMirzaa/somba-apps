"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { Tag, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { PROMOTION_REQUESTS, type PromotionRequest } from "@/lib/promotions-entities";
import { adminBreadcrumb } from "@/lib/admin-i18n";

const statusVariant = { pending: "warning", approved: "success", rejected: "danger" } as const;

const STATUS_FR: Record<string, string> = {
  pending: "En attente",
  approved: "Approuvé",
  rejected: "Rejeté",
};

const TYPE_FR: Record<string, string> = {
  discount: "Remise",
  coupon: "Coupon",
};

export default function AdminPromotionsPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [requests, setRequests] = useState<PromotionRequest[]>(PROMOTION_REQUESTS);
  const [tab, setTab] = useState("pending");

  const pending = requests.filter((r) => r.status === "pending").length;
  const approved = requests.filter((r) => r.status === "approved").length;
  const rejected = requests.filter((r) => r.status === "rejected").length;

  const filtered = tab === "all" ? requests : requests.filter((r) => r.status === tab);

  function decide(id: string, status: PromotionRequest["status"]) {
    setRequests((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    toast(status === "approved" ? (fr ? "Promotion approuvée et publiée" : "Promotion approved & published") : fr ? "Demande rejetée" : "Request rejected", "success");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Demandes de promotion" : "Promotion Requests"}
        subtitle={fr ? "Les vendeurs demandent des promotions — la plateforme les approuve et les publie" : "Sellers request promotions — the platform approves and publishes them"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Promotions" : "Promotions" }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "En attente" : "Pending"} value={pending} icon={Clock} />
        <StatCard title={fr ? "Approuvées" : "Approved"} value={approved} icon={CheckCircle2} />
        <StatCard title={fr ? "Rejetées" : "Rejected"} value={rejected} icon={XCircle} />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "pending", label: `${fr ? "En attente" : "Pending"} (${pending})` },
          { id: "approved", label: fr ? "Approuvées" : "Approved" },
          { id: "rejected", label: fr ? "Rejetées" : "Rejected" },
          { id: "all", label: fr ? "Toutes" : "All" },
        ]}
      />

      <div className="card-premium overflow-hidden">
        <DataTable
          data={filtered as unknown as Record<string, unknown>[]}
          columns={[
            {
              key: "campaign",
              label: fr ? "Campagne" : "Campaign",
              render: (row) => {
                const r = row as unknown as PromotionRequest;
                return (
                  <div>
                    <p className="font-semibold text-slate-900">{r.campaign}</p>
                    <p className="text-xs text-slate-400">{r.seller}</p>
                  </div>
                );
              },
            },
            { key: "type", label: t("type"), render: (row) => <Badge variant="info"><Tag className="mr-1 h-3 w-3" />{fr ? (TYPE_FR[String(row.type)] ?? String(row.type)) : String(row.type)}</Badge> },
            { key: "value", label: fr ? "Valeur" : "Value", render: (row) => <span className="font-semibold text-slate-900">{String(row.value)}</span> },
            { key: "scope", label: fr ? "Portée" : "Scope", render: (row) => <span className="text-slate-500">{String(row.scope)}</span> },
            { key: "end", label: fr ? "Période" : "Window", render: (row) => { const r = row as unknown as PromotionRequest; return <span className="text-xs text-slate-500">{r.start} → {r.end}</span>; } },
            { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={statusVariant[row.status as PromotionRequest["status"]]}>{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
            {
              key: "actions",
              label: "",
              render: (row) => {
                const r = row as unknown as PromotionRequest;
                if (r.status !== "pending") return <span className="text-xs text-slate-400">—</span>;
                return (
                  <div className="flex gap-2">
                    <button onClick={() => decide(r.id, "approved")} className="text-sm font-medium text-emerald-600 hover:underline">{fr ? "Approuver" : "Approve"}</button>
                    <button onClick={() => decide(r.id, "rejected")} className="text-sm font-medium text-red-600 hover:underline">{fr ? "Rejeter" : "Reject"}</button>
                  </div>
                );
              },
            },
          ]}
        />
      </div>
    </div>
  );
}
