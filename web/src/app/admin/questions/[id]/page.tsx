"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { TranslatableText } from "@/components/shop/translatable-text";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useRole } from "@/lib/admin-live";
import { canAnswerQuestions, canReadQuestions, questionProductName, type AdminQuestion } from "@/lib/admin-questions";
import { localDateTime } from "@/lib/dates";
import { socketClient } from "@/lib/realtime/socket-client";

const ANSWER_MAX = 2000;

/** One product question in full; Super Admin, Operations and Moderation answer, Support reads. */
export default function AdminQuestionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const role = useRole();
  const { toast } = useToast();
  const allowed = canReadQuestions(role);
  const canAnswer = canAnswerQuestions(role);
  const connected = rt.status === "connected";
  const [q, setQ] = useState<AdminQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await socketClient.request<AdminQuestion>("questions:adminGet", { id });
      setQ(res);
      setText((cur) => cur || res.answer || "");
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);

  useEffect(() => {
    if (!connected || !allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the question once connected
    void load();
  }, [connected, allowed, load]);

  async function save() {
    if (busy) return;
    const answer = text.trim();
    if (!answer) {
      setFormError(fr ? "Écrivez d'abord une réponse." : "Write an answer first.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await socketClient.request("questions:answer", { id, answer });
      toast(fr ? "Réponse publiée" : "Answer published", "success");
      await load();
    } catch (e) {
      setFormError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setBusy(false);
    }
  }

  const title = fr ? "Questions produits" : "Product questions";
  if (!allowed) return <div className="p-8 text-center text-slate-500">{fr ? "Action non autorisée." : "Not allowed."}</div>;
  if (error && !q) return <SectionError message={error} onRetry={() => void load()} />;
  if (!q) return <SectionLoading className="min-h-[40vh]" />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={questionProductName(q, fr)}
        subtitle={[q.customerName, q.storeName, localDateTime(q.createdAt)].filter(Boolean).join(" · ")}
        backHref="/admin/questions"
        breadcrumbs={[adminBreadcrumb(locale), { label: title, href: "/admin/questions" }, { label: questionProductName(q, fr) }]}
        actions={
          <div className="flex gap-3 text-sm">
            {q.sellerId && role !== "admin_support" && <Link href={`/admin/sellers/${q.sellerId}`} className="text-[var(--primary)] hover:underline">{fr ? "Boutique" : "Store"}</Link>}
          </div>
        }
      />
      <div className="card-premium space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700">{fr ? "Question" : "Question"}</p>
          <Badge variant={q.answer ? "success" : "warning"}>{q.answer ? (fr ? "Répondue" : "Answered") : fr ? "Sans réponse" : "Unanswered"}</Badge>
        </div>
        <TranslatableText kind="question" id={q.id} auto text={q.question} i18n={q.questionI18n} className="whitespace-pre-line break-words text-slate-800" />
        {q.answer && (
          <div className="rounded-lg border-l-2 border-[var(--primary)] bg-slate-50 px-3 py-2 text-sm text-slate-700">
            <p className="text-xs font-semibold text-slate-700">
              {fr ? "Réponse" : "Answer"}{q.answeredBy ? ` · ${q.answeredBy}` : ""}{q.answeredAt ? ` · ${localDateTime(q.answeredAt)}` : ""}
            </p>
            <TranslatableText kind="answer" id={q.id} auto text={q.answer} i18n={q.answerI18n} className="mt-1 whitespace-pre-line break-words" />
          </div>
        )}
      </div>
      {canAnswer ? (
        <div className="card-premium space-y-2 p-5">
          <label className="block text-xs font-medium text-slate-600" htmlFor="admin-answer">
            {fr ? "Votre réponse (publique, visible sur la page produit)" : "Your answer (public, shown on the product page)"}
          </label>
          <textarea id="admin-answer" className="input-premium w-full px-3 py-2 text-sm" rows={4} maxLength={ANSWER_MAX} value={text} onChange={(e) => { setText(e.target.value); setFormError(null); }} />
          <div className="text-xs text-slate-500">{text.length}/{ANSWER_MAX}</div>
          {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
          <Button size="sm" onClick={() => void save()} disabled={busy}>
            {busy ? "…" : q.answer ? (fr ? "Enregistrer" : "Save answer") : fr ? "Publier la réponse" : "Publish answer"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-500">{fr ? "Lecture seule : le support ne répond pas aux questions produits." : "Read-only: Support does not answer product questions."}</p>
      )}
    </div>
  );
}
