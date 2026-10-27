"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flag, MessageSquareReply, Pencil, ShieldAlert, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { TranslatableText } from "@/components/shop/translatable-text";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { sellerRequest } from "@/lib/seller-api";
import { errMessage } from "@/lib/seller-labels";
import { localDay } from "@/lib/dates";
import { localized, matchesSearch } from "@/lib/i18n-fields";
import { useFocusId, useScrollToFocus, useSellerReviews, productLabel, type EngageReview } from "@/lib/seller-engage";
import { formatDate } from "@/components/seller/plan-summary";
import { cn } from "@/lib/utils";

const REPLY_MIN = 2;
const REPLY_MAX = 1000;
const REPORT_MIN = 5;
const REPORT_MAX = 500;

/** The seller's public answer to one review: shows it, lets the seller edit it, or write the first one. */
function ReplyBox({ review, onSaved }: { review: EngageReview; onSaved: () => void }) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reply = review.sellerReply ?? "";
  const trimmed = text.trim();
  const tooShort = trimmed.length < REPLY_MIN;
  const unchanged = trimmed === reply;

  function open() {
    setText(reply);
    setError(null);
    setEditing(true);
  }

  async function save() {
    if (tooShort || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sellerRequest("reviews:reply", { reviewId: review.id, text: trimmed });
      toast(fr ? "Réponse publiée" : "Reply published");
      setEditing(false);
      onSaved();
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
        <label className="block text-xs font-medium text-slate-600" htmlFor={`reply-${review.id}`}>
          {reply ? (fr ? "Modifier votre réponse" : "Edit your reply") : fr ? "Votre réponse (publique)" : "Your reply (public)"}
        </label>
        <textarea
          id={`reply-${review.id}`}
          className="input-premium w-full px-3 py-2 text-sm"
          rows={3}
          maxLength={REPLY_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            {text.length}/{REPLY_MAX} · {fr ? "visible par tous les clients" : "visible to all shoppers"}
          </span>
          {tooShort && text.length > 0 && <span className="text-red-600">{fr ? `Au moins ${REPLY_MIN} caractères.` : `At least ${REPLY_MIN} characters.`}</span>}
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void save()} disabled={tooShort || unchanged || busy}>
            {busy ? (fr ? "Envoi…" : "Sending…") : reply ? (fr ? "Enregistrer" : "Save reply") : fr ? "Publier la réponse" : "Publish reply"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            {fr ? "Annuler" : "Cancel"}
          </Button>
        </div>
      </div>
    );
  }

  if (reply) {
    return (
      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--primary)]">
            <MessageSquareReply className="h-3.5 w-3.5" />
            {fr ? "Votre réponse" : "Your reply"}
            {review.sellerReplyAt && <span className="font-normal text-slate-500">· {formatDate(review.sellerReplyAt, fr)}</span>}
          </p>
          <button type="button" onClick={open} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-[var(--primary)]">
            <Pencil className="h-3 w-3" />
            {fr ? "Modifier" : "Edit"}
          </button>
        </div>
        <p className="mt-1.5 whitespace-pre-line break-words text-sm text-slate-700">{reply}</p>
      </div>
    );
  }

  return (
    <Button size="sm" variant="secondary" onClick={open}>
      <MessageSquareReply className="mr-1.5 inline h-3.5 w-3.5" />
      {fr ? "Répondre" : "Reply"}
    </Button>
  );
}

/** "Report this review" form: one report per store and review (the server enforces it). */
function ReportBox({ review, onDone, onCancel }: { review: EngageReview; onDone: () => void; onCancel: () => void }) {
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const valid = trimmed.length >= REPORT_MIN && trimmed.length <= REPORT_MAX;

  async function send() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sellerRequest("reviews:report", { id: review.id, reason: trimmed });
      toast(fr ? "Avis signalé aux modérateurs" : "Review reported to the moderators");
      onDone();
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <label className="block text-xs font-medium text-slate-700" htmlFor={`report-${review.id}`}>
        {fr ? "Qu'est-ce qui ne va pas dans cet avis ? (visible par les modérateurs uniquement)" : "What is wrong with this review? (only the moderators see it)"}
      </label>
      <textarea id={`report-${review.id}`} className="input-premium w-full px-3 py-2 text-sm" rows={3} maxLength={REPORT_MAX} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {reason.length}/{REPORT_MAX}
        </span>
        {!valid && reason.length > 0 && (
          <span className="text-red-600">{fr ? `Entre ${REPORT_MIN} et ${REPORT_MAX} caractères.` : `${REPORT_MIN} to ${REPORT_MAX} characters.`}</span>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void send()} disabled={!valid || busy}>
          {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Signaler l'avis" : "Report review"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {fr ? "Annuler" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}

/** What moderators decided on reviews of this store (from the saved notices: they carry the reason). */
function ModerationOutcomes({ productId }: { productId?: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { notifications } = useRealtime();
  const rows = useMemo(
    () =>
      notifications
        .filter((n) => n.type === "review" && /^A review on your product (was hidden|is visible again)/i.test(n.title))
        .filter(() => !productId)
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .slice(0, 5),
    [notifications, productId],
  );
  if (rows.length === 0) return null;
  return (
    <div className="card-premium space-y-2 p-4" data-testid="moderation-outcomes">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
        {fr ? "Décisions de modération" : "Moderation decisions"}
      </h2>
      <ul className="divide-y divide-slate-100">
        {rows.map((n) => {
          const t = { title: localized(n, "title", fr) || n.title, body: localized(n, "body", fr) || n.body };
          return (
            <li key={n.id} className="py-2 text-sm">
              <p className="font-medium text-slate-800">{t.title}</p>
              <p className="text-slate-600">{t.body}</p>
              <p className="text-xs text-slate-400">{localDay(n.createdAt)}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewRow({ review, fr, fresh, focused, onChanged }: { review: EngageReview; fr: boolean; fresh: boolean; focused: boolean; onChanged: () => void }) {
  const [reporting, setReporting] = useState(false);
  const reported = (review.reportCount ?? 0) > 0;
  return (
    <li
      data-focus-id={review.id}
      data-testid="review-row"
      className={cn("card-premium p-5 transition-shadow", (fresh || focused) && "outline outline-2 outline-offset-2 outline-[var(--primary)]")}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">{review.author}</p>
          <p className="text-xs text-slate-500">
            <Link href={`/seller/products/${review.productId}`} className="text-[var(--primary)] hover:underline">
              {productLabel(fr, review)}
            </Link>{" "}
            · {localDay(review.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${review.rating} / 5`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={`h-4 w-4 ${i < review.rating ? "fill-current" : "text-slate-200"}`} />
            ))}
          </span>
          {fresh && <Badge variant="primary">{fr ? "Nouveau" : "New"}</Badge>}
          {!review.sellerReply && <Badge variant="warning">{fr ? "Sans réponse" : "No reply"}</Badge>}
          {reported && (
            <Badge variant="danger">
              <ShieldAlert className="mr-1 h-3 w-3" aria-hidden="true" />
              {fr ? "Signalé, en cours d'examen" : "Reported, under review"}
            </Badge>
          )}
        </div>
      </div>
      <div className="mt-3">
        <TranslatableText kind="review" id={review.id} text={review.text} sourceLang={review.sourceLang} className="whitespace-pre-line break-words text-sm text-slate-700" />
      </div>
      <div className="mt-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <ReplyBox key={`${review.id}-${review.sellerReply ?? ""}`} review={review} onSaved={onChanged} />
        </div>
        {!reported && !reporting && (
          <button type="button" onClick={() => setReporting(true)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-red-600">
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            {fr ? "Signaler cet avis" : "Report review"}
          </button>
        )}
      </div>
      {reporting && <ReportBox review={review} onCancel={() => setReporting(false)} onDone={() => { setReporting(false); onChanged(); }} />}
    </li>
  );
}

/**
 * The store's reviews, live. `productId` narrows to one listing (the product page); without it the full inbox with
 * search, the "awaiting reply" / "reported" filters and the moderation decisions.
 */
export function EngageReviews({ productId }: { productId?: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [limit, setLimit] = useState(100);
  const reviews = useSellerReviews(limit);
  const focus = useFocusId();
  const [q, setQ] = useState("");
  const [onlyUnreplied, setOnlyUnreplied] = useState(false);
  const [onlyReported, setOnlyReported] = useState(false);

  const all = useMemo(() => (reviews.data ?? []).filter((r) => !productId || r.productId === productId), [reviews.data, productId]);
  const filtered = useMemo(
    () =>
      all.filter(
        (r) =>
          (!onlyUnreplied || !r.sellerReply) &&
          (!onlyReported || (r.reportCount ?? 0) > 0) &&
          matchesSearch(q, [r.author, r.productName, r.productNameFr, r.text]),
      ),
    [all, q, onlyUnreplied, onlyReported],
  );
  useScrollToFocus(focus, filtered.length > 0);
  const unreplied = all.filter((r) => !r.sellerReply).length;
  const reportedCount = all.filter((r) => (r.reportCount ?? 0) > 0).length;

  return (
    <div className="space-y-4">
      {reviews.error && <LoadError message={reviews.error} onRetry={reviews.reload} />}
      {!productId && <ModerationOutcomes />}
      {!productId && (
        <div className="card-premium flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">{fr ? "Rechercher" : "Search"}</label>
            <input type="search" className="input-premium w-full px-3 py-2 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={fr ? "Client, produit, avis…" : "Customer, product, review…"} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyUnreplied} onChange={(e) => setOnlyUnreplied(e.target.checked)} />
            {fr ? `Sans réponse (${unreplied})` : `Awaiting reply (${unreplied})`}
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyReported} onChange={(e) => setOnlyReported(e.target.checked)} />
            {fr ? `Signalés (${reportedCount})` : `Reported (${reportedCount})`}
          </label>
        </div>
      )}
      {reviews.loading ? (
        <SectionLoader />
      ) : filtered.length === 0 ? (
        <EmptyState>
          {all.length === 0
            ? productId
              ? fr ? "Aucun avis pour le moment." : "No reviews yet."
              : fr ? "Aucun avis pour le moment. Ils apparaîtront ici dès qu'un client en laissera un." : "No reviews yet. They appear here as soon as a customer leaves one."
            : fr ? "Aucun avis ne correspond à ces filtres." : "No reviews match these filters."}
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {filtered.map((r) => (
            <ReviewRow key={r.id} review={r} fr={fr} fresh={reviews.fresh.has(r.id)} focused={focus === r.id} onChanged={() => void reviews.reload()} />
          ))}
        </ul>
      )}
      {(reviews.data?.length ?? 0) >= limit && (
        <div className="text-center">
          <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + 100)} disabled={reviews.refreshing}>
            {fr ? "Voir plus d'avis" : "Load more reviews"}
          </Button>
        </div>
      )}
    </div>
  );
}
