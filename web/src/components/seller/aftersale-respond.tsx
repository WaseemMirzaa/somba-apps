"use client";

import { useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { Countdown } from "@/components/seller/countdown";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMessage } from "@/lib/seller-labels";
import { MIN_REASON } from "@/lib/seller-aftersale";

interface Copy {
  en: string;
  fr: string;
}

/**
 * The seller's answer to a return, replacement or exchange: Accept (after a confirmation) or Reject with a reason the
 * customer will read (at least 5 characters, checked here and on the server). `onRespond` rejects with the server's
 * message, which is shown inside the dialog and as an error toast.
 */
export function AftersaleRespond({
  title,
  intro,
  acceptHint,
  due,
  onRespond,
  doneAccept,
  doneReject,
}: {
  title: Copy;
  intro: Copy;
  /** What accepting sets in motion, spelled out in the confirmation. */
  acceptHint: Copy;
  due: string | null;
  onRespond: (accept: boolean, reason?: string) => Promise<void>;
  doneAccept: Copy;
  doneReject: Copy;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [mode, setMode] = useState<"accept" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = reason.trim();
  const reasonOk = trimmed.length >= MIN_REASON;

  function close() {
    if (busy) return;
    setMode(null);
    setReason("");
    setTouched(false);
    setError(null);
  }

  async function go(accept: boolean) {
    setTouched(true);
    if (!accept && !reasonOk) return;
    setBusy(true);
    setError(null);
    try {
      await onRespond(accept, accept ? undefined : trimmed);
      toast(fr ? (accept ? doneAccept.fr : doneReject.fr) : accept ? doneAccept.en : doneReject.en);
      setMode(null);
      setReason("");
      setTouched(false);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5" aria-label={fr ? title.fr : title.en}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-amber-900">{fr ? title.fr : title.en}</h3>
        <Countdown until={due} />
      </div>
      <p className="mt-1 text-sm text-amber-900/80">{fr ? intro.fr : intro.en}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("accept")}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          {fr ? "Accepter" : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => setMode("reject")}
          className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
        >
          <XCircle className="h-4 w-4" aria-hidden="true" />
          {fr ? "Refuser" : "Reject"}
        </button>
      </div>

      <Modal
        open={mode === "accept"}
        title={fr ? "Accepter cette demande ?" : "Accept this request?"}
        onClose={close}
        footer={
          <>
            <button type="button" disabled={busy} onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">
              {fr ? "Retour" : "Back"}
            </button>
            <button type="button" disabled={busy} onClick={() => void go(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Oui, accepter" : "Yes, accept"}
            </button>
          </>
        }
      >
        <p>{fr ? acceptHint.fr : acceptHint.en}</p>
        <ErrorNote message={error} />
      </Modal>

      <Modal
        open={mode === "reject"}
        title={fr ? "Refuser cette demande" : "Reject this request"}
        onClose={close}
        footer={
          <>
            <button type="button" disabled={busy} onClick={close} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50">
              {fr ? "Retour" : "Back"}
            </button>
            <button type="button" disabled={busy} onClick={() => void go(false)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Confirmer le refus" : "Confirm rejection"}
            </button>
          </>
        }
      >
        <label htmlFor="aftersale-reject-reason" className="block font-medium text-slate-900">
          {fr ? "Pourquoi refusez-vous ? Le client lira ce message." : "Why are you rejecting it? The customer will read this."}
        </label>
        <textarea
          id="aftersale-reject-reason"
          rows={4}
          maxLength={500}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={touched && !reasonOk}
          className="input-premium w-full px-3 py-2 text-sm"
          placeholder={fr ? "Ex. : l'article est conforme à la description et a été livré en bon état." : "E.g. the item matches its description and was delivered in good condition."}
        />
        {touched && !reasonOk && (
          <p className="text-xs text-red-600" role="alert">
            {fr ? `Écrivez au moins ${MIN_REASON} caractères pour expliquer votre refus.` : `Write at least ${MIN_REASON} characters to explain your rejection.`}
          </p>
        )}
        <p className="text-xs text-slate-500">
          {fr
            ? "Après un refus (ou sans réponse dans le délai), le client peut escalader la demande au support Somba, qui tranche."
            : "After a rejection (or no answer in time) the customer can escalate to Somba support, who decides."}
        </p>
        <ErrorNote message={error} />
      </Modal>
    </section>
  );
}
