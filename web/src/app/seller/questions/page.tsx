"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, MessageSquareQuote } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { ProductImage } from "@/components/seller/product-image";
import { TranslatableText } from "@/components/shop/translatable-text";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { assetUrl, sellerRequest, useLiveQuery } from "@/lib/seller-api";
import { errMessage } from "@/lib/seller-labels";
import { agoText, productLabel, useFocusId, useScrollToFocus, type EngageQuestion } from "@/lib/seller-engage";
import { cn } from "@/lib/utils";

type Tab = "unanswered" | "answered" | "all";
const PAGE = 20;
const ANSWER_MAX = 2000;

function AnswerBox({ q, fr, onSaved }: { q: EngageQuestion; fr: boolean; onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(!q.answer);
  const [text, setText] = useState(q.answer ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();

  async function save() {
    if (busy) return;
    if (!trimmed) {
      setError(fr ? "Écrivez d'abord une réponse." : "Write an answer first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sellerRequest("questions:answer", { id: q.id, answer: trimmed });
      toast(fr ? "Réponse publiée" : "Answer published");
      setOpen(false);
      onSaved();
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  if (!open && q.answer) {
    return (
      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {fr ? "Votre réponse" : "Your answer"}
            {q.answeredAt && <span className="font-normal text-slate-500">· {agoText(q.answeredAt, fr)}</span>}
          </p>
          <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-slate-600 hover:text-[var(--primary)]">
            {fr ? "Modifier" : "Edit"}
          </button>
        </div>
        <div className="mt-1.5">
          <TranslatableText kind="answer" id={q.id} text={q.answer} className="whitespace-pre-line break-words text-sm text-slate-700" />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      <label className="block text-xs font-medium text-slate-600" htmlFor={`answer-${q.id}`}>
        {fr ? "Votre réponse (publique, visible sur la page produit)" : "Your answer (public, shown on the product page)"}
      </label>
      <textarea id={`answer-${q.id}`} className="input-premium w-full px-3 py-2 text-sm" rows={3} maxLength={ANSWER_MAX} value={text} onChange={(e) => { setText(e.target.value); setError(null); }} />
      <div className="text-xs text-slate-500">{text.length}/{ANSWER_MAX}</div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? (fr ? "Envoi…" : "Sending…") : q.answer ? (fr ? "Enregistrer" : "Save answer") : fr ? "Publier la réponse" : "Publish answer"}
        </Button>
        {q.answer && (
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setText(q.answer ?? ""); setError(null); }} disabled={busy}>
            {fr ? "Annuler" : "Cancel"}
          </Button>
        )}
      </div>
    </div>
  );
}

function QuestionsInbox() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [tab, setTab] = useState<Tab>("unanswered");
  const [limit, setLimit] = useState(PAGE);
  const focus = useFocusId();
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const body = useMemo(() => ({ status: tab, limit, offset: 0 }), [tab, limit]);
  const list = useLiveQuery<EngageQuestion[]>("questions:seller", body, {
    pushes: ["question:created", "question:updated"],
    debounceMs: 200,
    pick: (p, name) => {
      if (name === "question:created") {
        const id = (p as { id?: string })?.id;
        if (id) setFresh((cur) => new Set(cur).add(id));
      }
      return true;
    },
  });
  const counts = useLiveQuery<{ count: number }>("questions:unanswered", {}, { pushes: ["question:created", "question:updated"], debounceMs: 200 });
  const rows = list.data ?? [];
  useScrollToFocus(focus, rows.length > 0);

  const tabs: { id: Tab; en: string; fr: string }[] = [
    { id: "unanswered", en: "Unanswered", fr: "Sans réponse" },
    { id: "answered", en: "Answered", fr: "Répondues" },
    { id: "all", en: "All", fr: "Toutes" },
  ];

  return (
    <div className="space-y-4">
      {list.error && <LoadError message={list.error} onRetry={list.reload} />}
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.id}
            role="tab"
            aria-selected={tab === x.id}
            onClick={() => { setTab(x.id); setLimit(PAGE); }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              tab === x.id ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
            )}
          >
            {fr ? x.fr : x.en}
            {x.id === "unanswered" && (counts.data?.count ?? 0) > 0 && (
              <span className={cn("rounded-full px-1.5 text-[11px] font-bold", tab === x.id ? "bg-white/25 text-white" : "bg-[var(--primary)] text-white")}>{counts.data?.count}</span>
            )}
          </button>
        ))}
      </div>

      {list.loading ? (
        <SectionLoader />
      ) : rows.length === 0 ? (
        <EmptyState>
          {tab === "unanswered"
            ? fr ? "Aucune question en attente. Les nouvelles questions des clients apparaissent ici en direct." : "No questions waiting. New customer questions appear here live."
            : tab === "answered"
              ? fr ? "Vous n'avez pas encore répondu à une question." : "You have not answered a question yet."
              : fr ? "Aucune question pour le moment." : "No questions yet."}
        </EmptyState>
      ) : (
        <ul className="space-y-4">
          {rows.map((q) => (
            <li
              key={q.id}
              data-focus-id={q.id}
              data-testid="question-row"
              className={cn("card-premium p-5", (focus === q.id || fresh.has(q.id)) && "outline outline-2 outline-offset-2 outline-[var(--primary)]")}
            >
              <div className="flex items-start gap-3">
                <span className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {q.productImage ? <ProductImage src={assetUrl(q.productImage)} alt="" /> : <MessageSquareQuote className="m-3 h-6 w-6 text-slate-300" aria-hidden="true" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/seller/products/${q.productId}`} className="truncate text-sm font-semibold text-[var(--primary)] hover:underline">
                      {productLabel(fr, q)}
                    </Link>
                    <div className="flex items-center gap-2">
                      {fresh.has(q.id) && <Badge variant="primary">{fr ? "Nouvelle" : "New"}</Badge>}
                      <Badge variant={q.answer ? "success" : "warning"}>{q.answer ? (fr ? "Répondue" : "Answered") : fr ? "Sans réponse" : "Unanswered"}</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    {q.askedBy} · {agoText(q.createdAt, fr)}
                  </p>
                  <div className="mt-2">
                    <TranslatableText kind="question" id={q.id} text={q.question} className="whitespace-pre-line break-words text-sm text-slate-800" />
                  </div>
                  <AnswerBox key={`${q.id}-${q.answer ?? ""}`} q={q} fr={fr} onSaved={() => void list.reload()} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {rows.length >= limit && (
        <div className="text-center">
          <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)} disabled={list.refreshing}>
            {fr ? "Voir plus" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function SellerQuestionsPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Questions clients" : "Customer questions"}
        subtitle={fr ? "Répondez aux questions posées sur vos produits : la réponse apparaît en direct sur la page produit" : "Answer questions asked about your products: the answer appears live on the product page"}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: fr ? "Questions" : "Questions" }]}
      />
      <Suspense fallback={<SectionLoader />}>
        <QuestionsInbox />
      </Suspense>
    </div>
  );
}
