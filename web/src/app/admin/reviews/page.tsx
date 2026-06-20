"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { Star, Flag, MessageSquare, ShieldCheck } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { REVIEWS, REPORTS, type ReviewItem, type ReportItem } from "@/lib/moderation-entities";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useReviews } from "@/context/reviews-context";

const reviewVariant = { pending: "warning", published: "success", removed: "danger" } as const;
const reportVariant = { open: "warning", resolved: "success", dismissed: "default" } as const;

const REVIEW_STATUS_FR: Record<string, string> = { pending: "En attente", published: "Publié", removed: "Retiré" };
const REPORT_STATUS_FR: Record<string, string> = { open: "Ouvert", resolved: "Résolu", dismissed: "Rejeté" };
const REPORT_TYPE_FR: Record<string, string> = { review: "Avis", product: "Produit", store: "Boutique" };
const REPORT_REASON_FR: Record<string, string> = {
  "Spam / external contact": "Spam / contact externe",
  "Counterfeit goods": "Produits contrefaits",
  "Misleading store info": "Informations boutique trompeuses",
  "Offensive language": "Langage offensant",
  "Safety concern": "Problème de sécurité",
};

export default function AdminReviewsPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [tab, setTab] = useState("reviews");
  const [reviews, setReviews] = useState<ReviewItem[]>(REVIEWS);
  const [reports, setReports] = useState<ReportItem[]>(REPORTS);
  const { reports: sellerReports, setReportStatus: setSellerReportStatus } = useReviews();

  // Seller-submitted reports (from the seller reviews "Report" flow) shown alongside static reports.
  const sellerReportItems: ReportItem[] = sellerReports.map((r) => ({
    id: r.id,
    type: "review",
    target: `#${r.reviewId} · ${r.product}`,
    reporter: r.reporter,
    reason: r.reason,
    reasonFr: r.reasonFr,
    date: r.date,
    status: r.status,
  }));
  const allReports = [...sellerReportItems, ...reports];

  function updateReportStatus(id: string, status: ReportItem["status"]) {
    if (id.startsWith("SR-")) setSellerReportStatus(id, status);
    else setReportStatus(id, status);
  }

  const pending = reviews.filter((r) => r.status === "pending").length;
  const published = reviews.filter((r) => r.status === "published").length;
  const openReports = allReports.filter((r) => r.status === "open").length;

  function setReviewStatus(id: string, status: ReviewItem["status"]) {
    setReviews((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    toast(status === "published" ? (fr ? "Avis publié" : "Review published") : fr ? "Avis retiré" : "Review removed", "success");
  }
  function setReportStatus(id: string, status: ReportItem["status"]) {
    setReports((rs) => rs.map((r) => (r.id === id ? { ...r, status } : r)));
    toast(status === "resolved" ? (fr ? "Signalement résolu" : "Report resolved") : fr ? "Signalement rejeté" : "Report dismissed", "success");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Avis et modération" : "Reviews & Moderation"}
        subtitle={fr ? "Modérez les avis clients et le contenu signalé" : "Moderate customer reviews and reported content"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Avis" : "Reviews" }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "Avis en attente" : "Pending reviews"} value={pending} icon={MessageSquare} />
        <StatCard title={fr ? "Avis publiés" : "Published"} value={published} icon={ShieldCheck} />
        <StatCard title={fr ? "Signalements ouverts" : "Open reports"} value={openReports} icon={Flag} />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "reviews", label: `${fr ? "Avis" : "Reviews"} (${pending})` },
          { id: "reports", label: `${fr ? "Contenu signalé" : "Reported"} (${openReports})` },
        ]}
      />

      {tab === "reviews" ? (
        <div className="card-premium overflow-hidden">
          <DataTable
            data={reviews as unknown as Record<string, unknown>[]}
            columns={[
              {
                key: "product",
                label: fr ? "Produit" : "Product",
                render: (row) => {
                  const r = row as unknown as ReviewItem;
                  return (
                    <div>
                      <p className="font-semibold text-slate-900">{r.product}</p>
                      <p className="text-xs text-slate-400">{r.seller} · {r.customer}</p>
                    </div>
                  );
                },
              },
              { key: "rating", label: fr ? "Note" : "Rating", render: (row) => <span className="inline-flex items-center gap-1 font-semibold text-amber-600"><Star className="h-3.5 w-3.5 fill-current" />{Number(row.rating)}</span> },
              { key: "text", label: fr ? "Avis" : "Review", render: (row) => <span className="line-clamp-2 block max-w-xs text-slate-600">{String(row.text)}</span> },
              { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={reviewVariant[row.status as ReviewItem["status"]]}>{fr ? (REVIEW_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
              {
                key: "actions",
                label: "",
                render: (row) => {
                  const r = row as unknown as ReviewItem;
                  if (r.status !== "pending") return <span className="text-xs text-slate-400">—</span>;
                  return (
                    <div className="flex gap-2">
                      <button onClick={() => setReviewStatus(r.id, "published")} className="text-sm font-medium text-emerald-600 hover:underline">{fr ? "Publier" : "Approve"}</button>
                      <button onClick={() => setReviewStatus(r.id, "removed")} className="text-sm font-medium text-red-600 hover:underline">{fr ? "Retirer" : "Remove"}</button>
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <DataTable
            data={allReports as unknown as Record<string, unknown>[]}
            columns={[
              { key: "type", label: t("type"), render: (row) => <Badge variant="info">{fr ? (REPORT_TYPE_FR[String(row.type)] ?? String(row.type)) : String(row.type)}</Badge> },
              { key: "target", label: fr ? "Cible" : "Target", render: (row) => <span className="font-medium text-slate-900">{fr ? String((row as unknown as ReportItem).targetFr ?? row.target) : String(row.target)}</span> },
              { key: "reason", label: fr ? "Motif" : "Reason", render: (row) => fr ? (REPORT_REASON_FR[String(row.reason)] ?? String((row as unknown as ReportItem).reasonFr ?? row.reason)) : String(row.reason) },
              { key: "reporter", label: fr ? "Signalé par" : "Reporter", render: (row) => <span className="text-slate-500">{fr ? String((row as unknown as ReportItem).reporterFr ?? row.reporter) : String(row.reporter)}</span> },
              { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={reportVariant[row.status as ReportItem["status"]]}>{fr ? (REPORT_STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
              {
                key: "actions",
                label: "",
                render: (row) => {
                  const r = row as unknown as ReportItem;
                  if (r.status !== "open") return <span className="text-xs text-slate-400">—</span>;
                  return (
                    <div className="flex gap-2">
                      <button onClick={() => updateReportStatus(r.id, "resolved")} className="text-sm font-medium text-emerald-600 hover:underline">{fr ? "Résoudre" : "Resolve"}</button>
                      <button onClick={() => updateReportStatus(r.id, "dismissed")} className="text-sm font-medium text-slate-500 hover:underline">{fr ? "Rejeter" : "Dismiss"}</button>
                    </div>
                  );
                },
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
