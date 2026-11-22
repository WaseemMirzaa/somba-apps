"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { TranslatableText } from "@/components/shop/translatable-text";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useRole } from "@/lib/admin-live";
import { canReadQuestions, questionProductName, type AdminQuestion, type AdminQuestionPage, type QuestionStatusTab } from "@/lib/admin-questions";
import { localDateTime } from "@/lib/dates";
import { socketClient } from "@/lib/realtime/socket-client";

const PAGE = 25;

/** Admin Q&A: every customer question on a product, with search (question, answer, product, store, customer), status tabs and paging. */
export default function AdminQuestionsPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const role = useRole();
  const { toast } = useToast();
  const allowed = canReadQuestions(role);
  const connected = rt.status === "connected";
  const [tab, setTab] = useState<QuestionStatusTab>("unanswered");
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AdminQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);

  // Debounce the search box; the server does the (accent-insensitive, null-safe) matching.
  useEffect(() => {
    const h = setTimeout(() => setQ(input.trim()), 300);
    return () => clearTimeout(h);
  }, [input]);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const res = await socketClient.request<AdminQuestionPage>("questions:adminList", { status: tab, q: q || undefined, limit: PAGE });
      if (mine !== seq.current) return;
      setRows(Array.isArray(res?.items) ? res.items : []);
      setTotal(Number(res?.total ?? 0));
      setCursor(res?.nextCursor ?? null);
      setError(null);
    } catch (e) {
      if (mine === seq.current) setError(errMsg(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [tab, q]);

  useEffect(() => {
    if (!connected || !allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the list once connected and on every filter change
    void load();
  }, [connected, allowed, load, attempt]);

  // A new question or an answer by someone else: reload the first page.
  useEffect(() => {
    if (!connected || !allowed) return;
    const sock = socketClient.current;
    if (!sock) return;
    const again = () => void load();
    sock.on("question:created", again);
    sock.on("question:updated", again);
    return () => {
      sock.off("question:created", again);
      sock.off("question:updated", again);
    };
  }, [connected, allowed, load]);

  async function loadMore() {
    if (!cursor) return;
    setMoreLoading(true);
    try {
      const res = await socketClient.request<AdminQuestionPage>("questions:adminList", { status: tab, q: q || undefined, limit: PAGE, cursor });
      setRows((cur) => [...cur, ...res.items.filter((r) => !cur.some((c) => c.id === r.id))]);
      setCursor(res.nextCursor ?? null);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setMoreLoading(false);
    }
  }

  const title = fr ? "Questions produits" : "Product questions";
  if (!allowed) return <div className="p-8 text-center text-slate-500">{fr ? "Action non autorisée." : "Not allowed."}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={fr ? "Les questions des clients sur les produits et les réponses des vendeurs" : "Customer questions on products and the sellers' answers"}
        breadcrumbs={[adminBreadcrumb(locale), { label: title }]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          active={tab}
          onChange={(id) => { setLoading(true); setTab(id as QuestionStatusTab); }}
          tabs={[
            { id: "unanswered", label: fr ? "Sans réponse" : "Unanswered" },
            { id: "answered", label: fr ? "Répondues" : "Answered" },
            { id: "all", label: fr ? "Toutes" : "All" },
          ]}
        />
        <input
          className="input-premium w-full min-w-0 px-4 py-2 text-sm sm:max-w-sm sm:flex-1"
          placeholder={fr ? "Rechercher question, réponse, produit, boutique, client…" : "Search question, answer, product, store, customer…"}
          value={input}
          onChange={(e) => { setInput(e.target.value); setLoading(true); }}
          aria-label={fr ? "Rechercher" : "Search"}
          data-testid="questions-search"
        />
      </div>

      {error && <SectionError message={error} onRetry={() => { setLoading(true); setError(null); setAttempt((a) => a + 1); }} />}
      {loading && !error ? (
        <SectionLoading />
      ) : (
        !error && (
          <div className="card-premium overflow-hidden">
            {rows.length === 0 ? (
              <EmptyState>
                {q
                  ? fr ? "Aucune question ne correspond à la recherche." : "No question matches the search."
                  : fr ? "Aucune question pour le moment." : "No questions yet."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-[var(--border)]" data-testid="questions-list">
                {rows.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start gap-3 p-4" data-testid="question-row">
                    <MessageCircleQuestion className="mt-1 h-5 w-5 shrink-0 text-slate-300" aria-hidden="true" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Link href={`/admin/questions/${r.id}`} className="truncate font-semibold text-[var(--primary)] hover:underline">
                          {questionProductName(r, fr)}
                        </Link>
                        <Badge variant={r.answer ? "success" : "warning"}>{r.answer ? (fr ? "Répondue" : "Answered") : fr ? "Sans réponse" : "Unanswered"}</Badge>
                      </div>
                      <p className="text-xs text-slate-500">
                        {[r.customerName, r.storeName, localDateTime(r.createdAt)].filter(Boolean).join(" · ")}
                      </p>
                      <TranslatableText kind="question" id={r.id} auto text={r.question} i18n={r.questionI18n} className="whitespace-pre-line break-words text-sm text-slate-800" />
                      {r.answer && (
                        <div className="rounded-lg border-l-2 border-[var(--primary)] bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <p className="font-semibold text-slate-700">{fr ? "Réponse" : "Answer"}{r.answeredBy ? ` · ${r.answeredBy}` : ""}</p>
                          <TranslatableText kind="answer" id={r.id} auto text={r.answer} i18n={r.answerI18n} className="mt-0.5 whitespace-pre-line break-words" />
                        </div>
                      )}
                    </div>
                    <Link href={`/admin/questions/${r.id}`} className="text-sm font-medium text-[var(--primary)] hover:underline">
                      {fr ? "Ouvrir" : "Open"}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between border-t border-[var(--border)] p-4 text-sm text-slate-500">
              <span>{fr ? `${rows.length} sur ${total}` : `${rows.length} of ${total}`}</span>
              {cursor && (
                <Button size="sm" variant="secondary" onClick={() => void loadMore()} disabled={moreLoading}>
                  {moreLoading ? "…" : fr ? "Charger plus" : "Load more"}
                </Button>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
