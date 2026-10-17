"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NoticeBar } from "@/components/admin/notice-bar";
import { CampaignDetailModal, CampaignPhaseBadge, CampaignScopeLine } from "@/components/admin/campaign-detail";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useServerList, type CampaignRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";

const CAMPAIGN_STATUS_FR: Record<string, string> = {
  active: "Active",
  scheduled: "Planifiée",
  pending: "En attente",
  rejected: "Rejetée",
  ended: "Terminée",
  draft: "Brouillon",
};
const VARIANT: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  active: "success",
  scheduled: "info",
  pending: "warning",
  rejected: "danger",
  ended: "default",
  draft: "default",
};

export default function AdminMarketingPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { items: campaigns, setItems, error: loadError, loading, reload } = useServerList<CampaignRow>("campaigns:list", { pushEvents: ["campaign:updated"] });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = campaigns.find((c) => c.id === detailId) ?? null;

  async function setStatus(c: CampaignRow, status: "active" | "rejected" | "ended") {
    setBusyId(c.id);
    try {
      const updated = await socketClient.request<CampaignRow>("campaigns:setStatus", { id: c.id, status });
      setItems((cur) => cur.map((x) => (x.id === c.id ? { ...x, ...updated } : x)));
      toast(
        status === "active" ? (fr ? "Campagne approuvée" : "Campaign approved") : status === "ended" ? (fr ? "Campagne terminée : les prix reviennent à la normale" : "Campaign ended: prices return to normal") : fr ? "Campagne rejetée" : "Campaign rejected",
        "success",
      );
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("marketing")}
        subtitle={fr ? "Campagnes des vendeurs (en direct)" : "Seller campaigns (live)"}
        breadcrumbs={[adminBreadcrumb(locale), { label: t("marketing") }]}
      />

      {loadError && <SectionError message={loadError} onRetry={reload} />}
      <NoticeBar>
        {fr
          ? "Les campagnes sont créées par les vendeurs ; vous les approuvez ou les rejetez ici. Les codes promo, ventes flash, blocs CMS et diffusions ont leurs propres pages."
          : "Campaigns are created by sellers; you approve or reject them here. Promo codes, flash sales, CMS blocks and broadcasts have their own pages."}
      </NoticeBar>

      {loading && !loadError ? (
        <SectionLoading />
      ) : (
        !loadError &&
        campaigns.length === 0 && <EmptyState>{fr ? "Aucune campagne." : "No campaigns yet."}</EmptyState>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant={VARIANT[c.status] ?? "default"}>{fr ? (CAMPAIGN_STATUS_FR[c.status] ?? c.status) : c.status}</Badge>
                  <CampaignPhaseBadge campaign={c} />
                </div>
                <span className="text-xs text-slate-400">{c.reference}</span>
              </div>
              <h3 className="mt-3 font-semibold text-slate-900">{fr ? c.nameFr || c.name : c.name}</h3>
              <p className="mt-1 text-sm text-slate-500">{c.sellerName ?? "—"} · {c.discount}% {fr ? "de remise" : "off"} · {formatCurrency(c.budgetUsd, locale)}</p>
              <p className="mt-1 text-xs text-slate-500"><CampaignScopeLine campaign={c} /></p>
              <p className="mt-1 text-xs text-slate-400">
                {c.startDate ?? "—"} → {c.endDate ?? "—"} · {fr ? "Commandes" : "Orders"} {c.orders} · {formatCurrency(c.revenueUsd, locale)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => setDetailId(c.id)}>{fr ? "Détails" : "Details"}</Button>
                {c.status === "pending" && (
                  <>
                    <Button size="sm" variant="approve" disabled={busyId === c.id} onClick={() => setStatus(c, "active")}>{fr ? "Approuver" : "Approve"}</Button>
                    <Button size="sm" variant="reject" disabled={busyId === c.id} onClick={() => setStatus(c, "rejected")}>{fr ? "Rejeter" : "Reject"}</Button>
                  </>
                )}
                {(c.status === "active" || c.status === "scheduled") && (
                  <Button size="sm" variant="reject" disabled={busyId === c.id} onClick={() => setStatus(c, "ended")}>{fr ? "Terminer" : "End now"}</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <CampaignDetailModal campaign={detail} onClose={() => setDetailId(null)} />
    </div>
  );
}
