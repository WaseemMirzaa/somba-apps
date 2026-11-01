"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { PageHeader } from "@/components/ui/page-header";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { BudgetBar } from "@/components/seller/promo-parts";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess } from "@/lib/seller";
import { localDay } from "@/lib/dates";
import { CAMPAIGN_STATUS_OPTIONS, campaignStatusLabel, campaignStatusVariant, errMessage } from "@/lib/seller-labels";
import { campaignActions, campaignTitle, ctr, endedReasonText, useCampaigns } from "@/lib/seller-promo";

export default function SellerPromotionsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const access = useSellerAccess();
  const canEdit = access.can("catalog") && !access.suspended;
  const campaigns = useCampaigns();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      (campaigns.data ?? []).map((c) => ({
        ...c,
        campaign: campaignTitle(c, fr),
        start: c.startDate ? localDay(c.startDate) : "—",
        end: c.endDate ? localDay(c.endDate) : "—",
      })),
    [campaigns.data, fr],
  );
  const filtered = useMemo(
    () => applyListFilters(rows, filters, { searchFields: ["campaign", "reference"], dateField: "start", statusField: "status" }),
    [rows, filters],
  );

  async function submit(id: string) {
    setBusyId(id);
    try {
      await campaignActions.submit(id);
      toast(fr ? "Campagne envoyée au marketing" : "Campaign sent to marketing");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("promotions")}
        subtitle={fr ? "Vos campagnes en direct : une campagne est approuvée par le marketing avant de démarrer" : "Your campaigns, live: marketing approves a campaign before it starts"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("promotions") }]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/seller/coupons" className="rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">{fr ? "Coupons" : "Coupons"}</Link>
            <Link href="/seller/flash-sales" className="rounded-lg border border-sky-200 px-4 py-2 text-sm hover:bg-sky-50">{fr ? "Ventes flash" : "Flash sales"}</Link>
            {canEdit && (
              <Link href="/seller/promotions/create" className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
                {fr ? "Créer une campagne" : "Create Campaign"}
              </Link>
            )}
          </div>
        }
      />
      {campaigns.error && <LoadError message={campaigns.error} onRetry={campaigns.reload} />}
      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={CAMPAIGN_STATUS_OPTIONS}
        searchPlaceholder={fr ? "Campagne, référence…" : "Campaign, reference…"}
      />
      <Card>
        <CardContent className="p-0">
          {campaigns.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              emptyMessage={fr ? "Aucune campagne. Créez-en une pour proposer une remise sur vos produits." : "No campaigns yet. Create one to offer a discount on your products."}
              columns={[
                {
                  key: "campaign",
                  label: fr ? "Campagne" : "Campaign",
                  render: (row) => (
                    <div>
                      <Link href={`/seller/promotions/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.campaign)}</Link>
                      <p className="text-xs text-slate-400">{String(row.reference)}</p>
                    </div>
                  ),
                },
                { key: "discount", label: fr ? "Remise" : "Discount", render: (row) => `${row.discount}%` },
                { key: "products", label: fr ? "Produits" : "Products", render: (row) => ((row.productIds as string[] | null | undefined)?.length ? String(row.productCount) : fr ? "Tous" : "All") },
                { key: "period", label: fr ? "Période" : "Period", render: (row) => `${row.start} → ${row.end}` },
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => {
                    const status = String(row.status);
                    const why = status === "rejected" ? String(row.rejectReason ?? "") : status === "ended" ? endedReasonText(String(row.endedReason ?? ""), fr) : "";
                    return (
                      <div className="space-y-1">
                        <Badge variant={campaignStatusVariant(status)}>{campaignStatusLabel(status, fr)}</Badge>
                        {why && <p className="max-w-[16rem] text-xs text-slate-500">{why}</p>}
                      </div>
                    );
                  },
                },
                {
                  key: "views",
                  label: fr ? "Vues / clics" : "Views / clicks",
                  render: (row) => {
                    const c = ctr(row as unknown as { views: number; clicks: number });
                    return `${row.views} / ${row.clicks}${c !== null ? ` (${c}%)` : ""}`;
                  },
                },
                { key: "budget", label: "Budget", render: (row) => <BudgetBar campaign={row as unknown as Parameters<typeof BudgetBar>[0]["campaign"]} /> },
                {
                  key: "actions",
                  label: t("action"),
                  render: (row) => (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <Link href={`/seller/promotions/${row.id}`} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
                      {canEdit && (row.status === "draft" || row.status === "rejected") && (
                        <button type="button" disabled={busyId === row.id} onClick={() => void submit(String(row.id))} className="font-medium text-emerald-700 hover:underline disabled:opacity-50">
                          {fr ? "Soumettre" : "Submit"}
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              data={filtered as unknown as Record<string, unknown>[]}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
