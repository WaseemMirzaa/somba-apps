"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useAuth } from "@/context/auth-context";
import { useReviews } from "@/context/reviews-context";
import { useSellerData, type SellerData } from "@/lib/seller";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type SellerReview = SellerData["sellerReviewList"][number];

const REPORT_REASONS = [
  { value: "Spam / external contact", fr: "Spam / contact externe" },
  { value: "Offensive language", fr: "Langage offensant" },
  { value: "Fake / not a real buyer", fr: "Faux / pas un vrai acheteur" },
  { value: "Irrelevant content", fr: "Contenu hors sujet" },
];

export default function SellerReviewsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { persona } = useAuth();
  const { getReply, addReply, reportReview } = useReviews();
  const { sellerReviewList } = useSellerData();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const [replyFor, setReplyFor] = useState<SellerReview | null>(null);
  const [replyText, setReplyText] = useState("");
  const [reportFor, setReportFor] = useState<SellerReview | null>(null);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0].value);

  const filtered = useMemo(
    () => applyListFilters(sellerReviewList, filters, { searchFields: ["customer", "product", "review"], dateField: "date" }),
    [sellerReviewList, filters]
  );

  function submitReply() {
    if (!replyFor || !replyText.trim()) return;
    addReply(replyFor.id, replyText.trim());
    toast(fr ? "Réponse publiée — visible par le client" : "Reply published — visible to the customer");
    setReplyFor(null);
    setReplyText("");
  }

  function submitReport() {
    if (!reportFor) return;
    const reason = REPORT_REASONS.find((r) => r.value === reportReason);
    reportReview({
      reviewId: reportFor.id,
      product: reportFor.product,
      reporter: persona.name,
      reason: reportReason,
      reasonFr: reason?.fr,
    });
    toast(fr ? "Avis signalé à la modération" : "Review reported to moderation");
    setReportFor(null);
  }

  return (
    <>
      <SellerListPage
        title={t("reviews")}
        subtitle={fr ? "Répondez aux avis ou signalez un contenu abusif" : "Reply to reviews or report abusive content"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("reviews") }]}
        filters={
          <ListFilters values={filters} onChange={setFilters} searchPlaceholder={fr ? "Client, produit, avis…" : "Customer, product, review…"} showStatusFilter={false} />
        }
        columns={[
          { key: "customer", label: t("customer") },
          { key: "product", label: fr ? "Produit" : "Product", render: (row) => (
            <Link href={`/seller/products/${row.productId}`} className="text-[var(--primary)] hover:underline">{String(row.product)}</Link>
          )},
          { key: "rating", label: fr ? "Note" : "Rating", render: (row) => "★".repeat(row.rating as number) },
          { key: "review", label: fr ? "Avis" : "Review", render: (row) => {
            const reply = getReply(row.id as number);
            return (
              <div className="max-w-sm">
                <p className="text-slate-700">{fr ? String(row.reviewFr ?? row.review) : String(row.review)}</p>
                {reply && (
                  <p className="mt-1 rounded-md bg-emerald-50 px-2 py-1 text-xs text-emerald-800">
                    <span className="font-semibold">{fr ? "Votre réponse : " : "Your reply: "}</span>{reply.text}
                  </p>
                )}
              </div>
            );
          }},
          { key: "date", label: t("date") },
          { key: "actions", label: t("action"), render: (row) => {
            const review = row as unknown as SellerReview;
            const reply = getReply(review.id);
            return (
              <div className="flex gap-2 text-xs">
                <button onClick={() => { setReplyFor(review); setReplyText(reply?.text ?? ""); }} className="text-[var(--primary)] hover:underline">
                  {reply ? (fr ? "Modifier la réponse" : "Edit reply") : (fr ? "Répondre" : "Reply")}
                </button>
                <button onClick={() => { setReportFor(review); setReportReason(REPORT_REASONS[0].value); }} className="text-slate-500 hover:underline">{fr ? "Signaler" : "Report"}</button>
              </div>
            );
          }},
        ]}
        data={filtered as unknown as Record<string, unknown>[]}
      />

      {replyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReplyFor(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{fr ? "Répondre à l'avis" : "Reply to review"}</h2>
              <button onClick={() => setReplyFor(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-700">{replyFor.customer} · {"★".repeat(replyFor.rating)}</p>
              <p className="mt-1 text-slate-600">{fr ? replyFor.reviewFr : replyFor.review}</p>
            </div>
            <textarea
              className="input-premium w-full px-3 py-2 text-sm"
              rows={4}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={fr ? "Votre réponse publique…" : "Your public reply…"}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setReplyFor(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">{fr ? "Annuler" : "Cancel"}</button>
              <Button onClick={submitReply}>{fr ? "Publier la réponse" : "Publish reply"}</Button>
            </div>
          </div>
        </div>
      )}

      {reportFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setReportFor(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{fr ? "Signaler l'avis" : "Report review"}</h2>
              <button onClick={() => setReportFor(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-sm text-slate-500">{fr ? "Sélectionnez un motif. La modération examinera ce signalement." : "Select a reason. Moderation will review this report."}</p>
            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <input type="radio" name="reason" checked={reportReason === r.value} onChange={() => setReportReason(r.value)} />
                  {fr ? r.fr : r.value}
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setReportFor(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">{fr ? "Annuler" : "Cancel"}</button>
              <Button onClick={submitReport}>{fr ? "Signaler" : "Report"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
