"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MessageSquareReply, Pencil, Star } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { formatDate } from "@/components/seller/plan-summary";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerData } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";
import { matchesSearch } from "@/lib/i18n-fields";
import { TranslatableText } from "@/components/shop/translatable-text";

type Row = ReturnType<typeof useSellerData>["sellerReviewList"][number];

const MIN = 2;
const MAX = 1000;

/** The seller's public answer to one review: shows it, lets the seller edit it, or write the first one. */
function ReplyBox({ row, onSave }: { row: Row; onSave: (reviewId: string, text: string) => Promise<unknown> }) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN;
  const unchanged = trimmed === (row.reply ?? "");

  function open() {
    setText(row.reply ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (tooShort || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(row.reviewId, trimmed);
      toast(fr ? "Réponse publiée" : "Reply published");
      setEditing(false);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-3 space-y-2 rounded-xl border border-sky-200 bg-slate-50/60 p-3">
        <label className="block text-xs font-medium text-slate-600" htmlFor={`reply-${row.reviewId}`}>
          {row.reply ? (fr ? "Modifier votre réponse" : "Edit your reply") : fr ? "Votre réponse (publique)" : "Your reply (public)"}
        </label>
        <textarea
          id={`reply-${row.reviewId}`}
          className="input-premium w-full px-3 py-2 text-sm"
          rows={3}
          maxLength={MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>{text.length}/{MAX} · {fr ? "visible par tous les clients" : "visible to all shoppers"}</span>
          {tooShort && text.length > 0 && <span className="text-red-600">{fr ? `Au moins ${MIN} caractères.` : `At least ${MIN} characters.`}</span>}
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void save()} disabled={tooShort || unchanged || busy}>
            {busy ? (fr ? "Envoi…" : "Sending…") : row.reply ? (fr ? "Enregistrer" : "Save reply") : fr ? "Publier la réponse" : "Publish reply"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
        </div>
      </div>
    );
  }

  if (row.reply) {
    return (
      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)]">
            <MessageSquareReply className="h-3.5 w-3.5" />
            {fr ? "Votre réponse" : "Your reply"}
            {row.repliedAt && <span className="font-normal text-slate-500">· {formatDate(row.repliedAt, fr)}</span>}
          </p>
          <button type="button" onClick={open} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[var(--primary)]">
            <Pencil className="h-3 w-3" />
            {fr ? "Modifier" : "Edit"}
          </button>
        </div>
        <p className="mt-1.5 whitespace-pre-line break-words text-sm text-slate-700">{row.reply}</p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <Button size="sm" variant="secondary" onClick={open}>
        <MessageSquareReply className="mr-1.5 inline h-3.5 w-3.5" />
        {fr ? "Répondre" : "Reply"}
      </Button>
    </div>
  );
}

export default function SellerReviewsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { sellerReviewList, replyReview, load } = useSellerData();
  const [q, setQ] = useState("");
  const [onlyUnreplied, setOnlyUnreplied] = useState(false);

  const filtered = useMemo(() => {
    return sellerReviewList.filter(
      (r) => (!onlyUnreplied || !r.reply) && matchesSearch(q, [r.customer, r.product, r.review]),
    );
  }, [sellerReviewList, q, onlyUnreplied]);

  const unreplied = sellerReviewList.filter((r) => !r.reply).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("reviews")}
        subtitle={fr ? "Avis clients sur vos produits : répondez publiquement" : "Customer reviews on your products: reply publicly"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("reviews") }]}
      />
      {load.error && <LoadError message={load.error} onRetry={load.retry} />}

      <div className="card-premium flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1.5 block text-xs font-medium text-slate-600">{fr ? "Rechercher" : "Search"}</label>
          <input type="search" className="input-premium w-full px-3 py-2 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={fr ? "Client, produit, avis…" : "Customer, product, review…"} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={onlyUnreplied} onChange={(e) => setOnlyUnreplied(e.target.checked)} />
          {fr ? `Sans réponse (${unreplied})` : `Awaiting reply (${unreplied})`}
        </label>
      </div>

      {load.loading && sellerReviewList.length === 0 ? (
        <SectionLoader />
      ) : filtered.length === 0 ? (
        <EmptyState>
          {sellerReviewList.length === 0
            ? fr ? "Aucun avis pour le moment. Ils apparaîtront ici dès qu'un client en laissera un." : "No reviews yet. They appear here as soon as a customer leaves one."
            : fr ? "Aucun avis ne correspond à ces filtres." : "No reviews match these filters."}
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {filtered.map((r) => (
            <li key={r.reviewId} className="card-premium p-5" data-testid="review-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{r.customer}</p>
                  <p className="text-xs text-slate-500">
                    <Link href={`/seller/products/${r.productId}`} className="text-[var(--primary)] hover:underline">{r.product}</Link> · {r.date}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${r.rating} / 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`h-4 w-4 ${i < r.rating ? "fill-current" : "text-slate-200"}`} />
                    ))}
                  </span>
                  {!r.reply && <Badge variant="warning">{fr ? "Sans réponse" : "No reply"}</Badge>}
                </div>
              </div>
              <div className="mt-3">
                <TranslatableText kind="review" id={r.reviewId} text={r.review} sourceLang={r.sourceLang} className="whitespace-pre-line break-words text-sm text-slate-700" />
              </div>
              <ReplyBox key={r.reviewId} row={r} onSave={replyReview} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
