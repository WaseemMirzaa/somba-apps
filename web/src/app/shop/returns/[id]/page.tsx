"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { StepList } from "@/components/shop/step-list";
import { ReturnParcelCard } from "@/components/shop/return-parcel-card";
import { PhotoPicker } from "@/components/shop/photo-picker";
import { TranslatableText } from "@/components/shop/translatable-text";
import { isUndecidedStage } from "@/lib/support-stage";
import { CONDITION_LABEL, categoryLabel, requestSteps, stageText, useDisputeDetail } from "@/lib/after-sale";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { formatCurrency } from "@/lib/utils";
import { pickText } from "@/lib/i18n-fields";
import type { Dispute, DisputeMessage } from "@/lib/realtime/types";
import { resolutionText } from "@/lib/i18n-fields";
import { authorRoleLabel } from "@/lib/author-role";

function Photos({ urls, fr }: { urls: string[]; fr: boolean }) {
  if (!urls.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((u) => (
        <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-[var(--border)] bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={u} alt={fr ? "Photo jointe" : "Attached photo"} className="h-full w-full object-cover" />
        </a>
      ))}
    </div>
  );
}

function RequestStatus() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const { dispute: d, loaded, error, patch, addMessage } = useDisputeDetail(id);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | "reply" | "cancel">(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!d) {
    return (
      <div className="space-y-3 py-12 text-center text-slate-500">
        <p role={error ? "alert" : undefined}>{!loaded || rt.status !== "connected" ? (fr ? "Chargement…" : "Loading…") : error ?? (fr ? "Demande introuvable" : "Request not found")}</p>
        <Link href="/shop/returns" className="text-[var(--primary)] hover:underline">{fr ? "Toutes mes demandes" : "All my requests"}</Link>
      </div>
    );
  }

  const open = d.status === "open";
  const steps = requestSteps(d, fr);

  async function reply() {
    if (!d) return;
    if (!text.trim() && photos.length === 0) {
      toast(fr ? "Écrivez d'abord un message." : "Write a message first.", "error");
      return;
    }
    setBusy("reply");
    try {
      const m = await socketClient.request<DisputeMessage>("disputes:reply", { id: d.id, message: text.trim() || (fr ? "(photo)" : "(photo)"), ...(photos.length ? { attachments: photos } : {}) });
      addMessage(m);
      setText("");
      setPhotos([]);
      toast(fr ? "Message envoyé" : "Message sent");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    if (!d) return;
    setBusy("cancel");
    try {
      const upd = await socketClient.request<Dispute>("disputes:cancel", { id: d.id });
      patch(upd);
      setConfirmCancel(false);
      toast(fr ? "Demande annulée" : "Request cancelled");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={d.reference}
        subtitle={`${fr ? "Commande" : "Order"} ${d.orderReference} · ${d.type === "return" ? (fr ? "Retour" : "Return") : fr ? "Litige" : "Dispute"}`}
        backHref="/shop/returns"
        actions={<Badge variant={d.status === "resolved" ? "success" : d.status === "rejected" ? "danger" : "warning"}>{stageText(d, fr)}</Badge>}
      />

      {d.canCancel && (
        <div className="card-premium p-4" data-testid="request-actions">
          {confirmCancel ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-700">{fr ? "Annuler cette demande ?" : "Cancel this request?"}</span>
              <Button variant="secondary" onClick={cancel} disabled={busy === "cancel"}>{busy === "cancel" ? "…" : fr ? "Oui, annuler" : "Yes, cancel it"}</Button>
              <Button variant="ghost" onClick={() => setConfirmCancel(false)}>{fr ? "Non" : "No"}</Button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmCancel(true)} className="text-sm text-red-600 hover:underline">{fr ? "Annuler la demande" : "Cancel the request"}</button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <DetailSection title={fr ? "Avancement" : "Progress"}>
            <StepList steps={steps} fr={fr} />
            {open && d.sellerDueAt && isUndecidedStage(d.stage) && (
              <p className="mt-2 text-xs text-slate-500">{fr ? "Le support KOMORIKO répond avant le" : "KOMORIKO support answers by"} {new Date(d.sellerDueAt).toLocaleString(fr ? "fr-FR" : "en-GB")}</p>
            )}
          </DetailSection>

          {open && d.type === "return" && !d.receivedAt && <ReturnParcelCard returnId={d.id} />}

          <DetailSection title={fr ? "Détails" : "Details"}>
            <InfoGrid items={[
              { label: fr ? "Catégorie" : "Category", value: categoryLabel(d.type, d.category, fr) },
              { label: fr ? "Demandé le" : "Requested", value: new Date(d.createdAt).toLocaleString(fr ? "fr-FR" : "en-GB") },
              ...(d.receivedAt ? [{ label: fr ? "Articles reçus le" : "Items received", value: new Date(d.receivedAt).toLocaleString(fr ? "fr-FR" : "en-GB") }] : []),
              ...(d.refundUsd != null && d.status === "resolved" ? [{ label: fr ? "Montant remboursé" : "Refunded", value: <span className="font-semibold text-emerald-700">{formatCurrency(d.refundUsd, locale)}{d.refundTo ? ` · ${d.refundTo === "phone" ? (fr ? "téléphone" : "phone") : fr ? "portefeuille" : "wallet"}` : ""}</span> }] : []),
              { label: fr ? "Votre explication" : "Your explanation", value: <TranslatableText kind="dispute_reason" id={d.id} auto text={d.reason} i18n={d.reasonI18n} />, full: true },
              ...(d.sellerReason ? [{ label: fr ? "Réponse précédente" : "Earlier answer", value: <TranslatableText kind="dispute_reply" id={d.id} auto text={d.sellerReason} i18n={d.sellerReasonI18n} />, full: true }] : []),
              ...(d.resolution ? [{ label: fr ? "Décision" : "Decision", value: d.resolutionI18n ? <TranslatableText kind="dispute_resolution" id={d.id} auto text={d.resolution} i18n={d.resolutionI18n} /> : resolutionText(d, fr), full: true }] : []),
            ]} />
            <Photos urls={d.attachments ?? []} fr={fr} />
            <Link href={`/shop/orders/${d.orderId}`} className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">{fr ? "Voir la commande →" : "View order →"}</Link>
          </DetailSection>

          {d.items && d.items.length > 0 && (
            <DetailSection title={fr ? "Articles concernés" : "Items concerned"}>
              <ul className="divide-y divide-[var(--border)]" data-testid="request-items">
                {d.items.map((it) => (
                  <li key={it.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span>
                      <span className="font-medium text-slate-900">{pickText(fr, it.productName, it.productNameFr)}</span>
                      <span className="text-slate-500"> × {it.qty}</span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-600">
                      {it.condition && <Badge variant={it.condition === "resellable" ? "success" : "warning"}>{fr ? CONDITION_LABEL[it.condition].fr : CONDITION_LABEL[it.condition].en}</Badge>}
                      <span>{formatCurrency(it.refundUsd || it.unitPriceUsd * it.qty, locale)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}
        </div>

        <div className="lg:col-span-1">
          <DetailSection title={fr ? "Discussion" : "Conversation"}>
            <div className="space-y-3" data-testid="request-thread">
              {(d.messages ?? []).length === 0 && <p className="text-sm text-slate-500">{fr ? "Aucun message pour le moment." : "No messages yet."}</p>}
              {(d.messages ?? []).map((m) => {
                const mine = m.authorId === rt.user?.id;
                return (
                  <div key={m.id} className={`rounded-xl p-3 text-sm ${mine ? "bg-blue-50" : "bg-slate-50"}`}>
                    <p className="text-xs font-semibold text-slate-700">
                      {mine ? (fr ? "Vous" : "You") : m.authorName}
                      <span className="ml-1 font-normal text-slate-500">· {authorRoleLabel(m.role, fr)} · {new Date(m.createdAt).toLocaleString(fr ? "fr-FR" : "en-GB")}</span>
                    </p>
                    {mine ? <p className="mt-1 whitespace-pre-line text-slate-800">{m.text}</p> : <TranslatableText kind="dispute_message" id={m.id} auto text={m.text} i18n={m.textI18n} className="mt-1 whitespace-pre-line text-slate-800" />}
                    <Photos urls={m.attachments ?? []} fr={fr} />
                  </div>
                );
              })}
            </div>
            {open ? (
              <div className="mt-4 space-y-2">
                <textarea className="input-premium w-full px-3 py-2 text-sm" rows={3} aria-label={fr ? "Votre message" : "Your message"} placeholder={fr ? "Écrire au support KOMORIKO…" : "Write to KOMORIKO support…"} value={text} onChange={(e) => setText(e.target.value)} />
                <PhotoPicker value={photos} onChange={setPhotos} max={4} fr={fr} />
                <Button onClick={reply} disabled={busy === "reply"} className="w-full">{busy === "reply" ? "…" : fr ? "Envoyer" : "Send"}</Button>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">{fr ? "Cette demande est clôturée." : "This request is closed."}</p>
            )}
          </DetailSection>
        </div>
      </div>
    </div>
  );
}

export default function ReturnStatusPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/returns/${id}`}>
      <RequestStatus />
    </RequireSignIn>
  );
}
