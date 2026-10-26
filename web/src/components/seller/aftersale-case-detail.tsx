"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { PageHeader } from "@/components/ui/page-header";
import { AftersaleRespond } from "@/components/seller/aftersale-respond";
import { CaseThread } from "@/components/seller/aftersale-thread";
import { StepTrack, type Step } from "@/components/seller/aftersale-steps";
import { AttachmentGallery } from "@/components/seller/attachments";
import { Countdown } from "@/components/seller/countdown";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { localDateTime } from "@/lib/dates";
import { pickText } from "@/lib/i18n-fields";
import { sellerRequest } from "@/lib/seller-api";
import {
  caseCategoryLabel,
  caseOutcomeLabel,
  caseOutcomeVariant,
  caseStageLabel,
  caseStageVariant,
  caseValue,
  itemConditionLabel,
  itemConditionVariant,
  needsSeller,
  refundToLabel,
  resolveRecordId,
  useCase,
  useCases,
  variantText,
  type CaseMessage,
  type CaseType,
  type SellerCase,
} from "@/lib/seller-aftersale";
import { formatCurrency } from "@/lib/utils";
import { resolutionText } from "@/lib/i18n-fields";

function returnSteps(c: SellerCase, fr: boolean): Step[] {
  const answered = c.stage !== "awaiting_seller";
  const rejectedBySeller = c.stage === "seller_rejected" || c.stage === "seller_timeout";
  const reachedPickup = ["approved", "pickup", "received"].includes(c.stage) || (c.stage === "closed" && !!(c.pickupTaskId || c.receivedAt));
  const atWarehouse = !!c.receivedAt || c.stage === "received";
  const closedOk = c.status === "resolved";
  const closedNo = c.status === "rejected";
  return [
    { label: fr ? "Demande du client" : "Customer request", hint: localDateTime(c.createdAt), state: "done" },
    {
      label: fr ? "Votre réponse" : "Your answer",
      hint: c.sellerRespondedAt
        ? localDateTime(c.sellerRespondedAt)
        : c.stage === "seller_timeout"
          ? fr ? "Délai dépassé" : "Time ran out"
          : c.stage === "escalated" || c.escalatedAt
            ? fr ? "Escaladé au support" : "Escalated to support"
            : undefined,
      state: !answered ? "current" : rejectedBySeller && !reachedPickup ? "failed" : "done",
    },
    {
      label: fr ? "Collecte chez le client" : "Pickup from the customer",
      hint: c.stage === "approved" ? (fr ? "À planifier par l'entrepôt" : "The warehouse is to plan it") : undefined,
      state: reachedPickup ? (atWarehouse || c.stage === "closed" ? "done" : "current") : "todo",
    },
    {
      label: fr ? "Reçu et évalué à l'entrepôt" : "Received and graded at the warehouse",
      hint: c.gradedAt ? `${fr ? "Évalué" : "Graded"} ${localDateTime(c.gradedAt)}` : c.receivedAt ? `${fr ? "Reçu" : "Received"} ${localDateTime(c.receivedAt)}` : undefined,
      state: c.gradedAt ? "done" : atWarehouse ? "current" : "todo",
    },
    {
      label: fr ? "Remboursement" : "Refund",
      hint: c.refundUsd ? formatCurrency(c.refundUsd) : undefined,
      state: closedOk ? "done" : closedNo ? "failed" : "todo",
    },
  ];
}

function disputeSteps(c: SellerCase, fr: boolean): Step[] {
  const replied = c.stage !== "awaiting_seller";
  const closed = c.stage === "closed";
  return [
    { label: fr ? "Litige ouvert" : "Dispute opened", hint: localDateTime(c.createdAt), state: "done" },
    { label: fr ? "Votre réponse" : "Your reply", state: replied ? "done" : "current" },
    { label: fr ? "Décision du support" : "Support decision", state: closed ? "done" : replied ? "current" : "todo" },
    { label: fr ? "Résultat" : "Outcome", hint: c.outcome ? caseOutcomeLabel(c.outcome, fr) : undefined, state: closed ? (c.status === "rejected" ? "failed" : "done") : "todo" },
  ];
}

/** One return or dispute: facts, items, grading and refund, the answer buttons, and the live conversation. */
export function AftersaleCaseDetail({ type, idOrRef }: { type: CaseType; idOrRef: string }) {
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const back = type === "return" ? "/seller/returns" : "/seller/disputes";
  const list = useCases(type);
  const resolved = resolveRecordId(idOrRef, list.data);
  const q = useCase(resolved.id);
  const c = q.data;
  const { setData } = q;

  const steps = useMemo(() => (c ? (c.type === "return" ? returnSteps(c, fr) : disputeSteps(c, fr)) : []), [c, fr]);

  if (resolved.waiting || (q.loading && !c)) return <SectionLoader />;
  if (!c) {
    return q.error ? (
      <LoadError message={q.error} onRetry={q.reload} />
    ) : (
      <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
        {type === "return" ? (fr ? "Retour introuvable." : "Return not found.") : fr ? "Litige introuvable." : "Dispute not found."}
      </p>
    );
  }

  const open = c.status === "open";
  const messages = c.messages ?? [];
  const graded = c.items.some((i) => i.condition);
  const itemsTotal = caseValue(c);

  async function respond(accept: boolean, reason?: string) {
    const view = await sellerRequest<SellerCase>("returns:respond", { id: c!.id, accept, ...(accept ? {} : { reason }) });
    setData((cur) => (cur ? { ...cur, ...view, messages: cur.messages } : cur));
  }
  async function reply(text: string, attachments: string[]) {
    const m = await sellerRequest<CaseMessage>("disputes:reply", { id: c!.id, message: text, attachments });
    setData((cur) => {
      if (!cur) return cur;
      const list = cur.messages ?? [];
      return list.some((x) => x.id === m.id) ? cur : { ...cur, messages: [...list, m], messageCount: (cur.messageCount ?? list.length) + 1 };
    });
  }

  const isReturn = c.type === "return";
  return (
    <div className="space-y-6">
      <PageHeader
        title={c.reference}
        subtitle={`${fr ? "Commande" : "Order"} ${c.orderReference} · ${c.reason.length > 90 ? `${c.reason.slice(0, 90)}…` : c.reason}`}
        backHref={back}
        actions={
          <>
            <Badge variant={caseStageVariant(c.type, c.stage)}>{caseStageLabel(c.type, c.stage, fr)}</Badge>
            {c.outcome && <Badge variant={caseOutcomeVariant(c.outcome)}>{caseOutcomeLabel(c.outcome, fr)}</Badge>}
          </>
        }
      />
      {q.error && <LoadError message={q.error} onRetry={q.reload} />}

      {isReturn && needsSeller(c) && (
        <AftersaleRespond
          title={{ en: "This return needs your answer", fr: "Ce retour attend votre réponse" }}
          intro={{
            en: "Accept it and the warehouse collects the goods from the customer, inspects them and refunds the returned items. Reject it with a reason and the customer can escalate to Somba support. If you do not answer in time, support decides.",
            fr: "Acceptez-le : l'entrepôt collecte les articles chez le client, les inspecte et rembourse les articles retournés. Refusez-le avec un motif : le client pourra escalader au support Somba. Sans réponse dans le délai, le support décide.",
          }}
          acceptHint={{
            en: `The customer will be told the return is accepted. A rider from the warehouse will collect the goods, and the customer is refunded for the returned items only (up to ${formatCurrency(itemsTotal, locale)}).`,
            fr: `Le client sera informé que le retour est accepté. Un livreur de l'entrepôt collectera les articles, et le client sera remboursé pour les articles retournés uniquement (jusqu'à ${formatCurrency(itemsTotal, locale)}).`,
          }}
          due={c.sellerDueAt}
          onRespond={respond}
          doneAccept={{ en: "Return accepted", fr: "Retour accepté" }}
          doneReject={{ en: "Return rejected: the customer can escalate", fr: "Retour refusé : le client peut escalader" }}
        />
      )}
      {!isReturn && needsSeller(c) && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <span>
            <strong>{fr ? "Ce litige attend votre réponse." : "This dispute is waiting for your reply."}</strong>{" "}
            {fr
              ? "Répondez ci-dessous avec votre version des faits et des photos : le support Somba tranche ensuite."
              : "Reply below with your side of the story and photos: Somba support then decides."}
          </span>
          <Countdown until={c.sellerDueAt} />
        </div>
      )}
      {isReturn && (c.stage === "seller_rejected" || c.stage === "seller_timeout") && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {c.stage === "seller_timeout"
            ? fr
              ? "Vous n'avez pas répondu dans le délai : le client peut escalader au support Somba, qui décidera."
              : "You did not answer in time: the customer can escalate to Somba support, who will decide."
            : fr
              ? "Vous avez refusé ce retour. Le client peut escalader au support Somba, qui décidera."
              : "You rejected this return. The customer can escalate to Somba support, who will decide."}
        </p>
      )}
      {isReturn && c.stage === "escalated" && (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {fr ? "Le support Somba étudie cette demande. Vous pouvez ajouter des éléments dans la conversation ci-dessous." : "Somba support is reviewing this request. You can add details in the conversation below."}
        </p>
      )}

      <section className="card-premium p-5">
        <StepTrack steps={steps} />
      </section>

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"} span={2}>
          <InfoGrid
            items={[
              { label: isReturn ? (fr ? "N° retour" : "Return ID") : fr ? "N° litige" : "Dispute ID", value: c.reference },
              { label: fr ? "Commande" : "Order", value: <Link href={`/seller/orders/${c.orderReference}`} className="text-[var(--primary)] hover:underline">{c.orderReference}</Link> },
              { label: t("customer"), value: c.customerName },
              { label: fr ? "Date" : "Date", value: localDateTime(c.createdAt) },
              { label: fr ? "Catégorie" : "Category", value: caseCategoryLabel(c.category, fr) },
              ...(itemsTotal > 0 ? [{ label: fr ? "Valeur des articles" : "Items value", value: formatCurrency(itemsTotal, locale) }] : []),
              { label: fr ? "Motif du client" : "Customer's reason", value: <span className="whitespace-pre-line">{c.reason}</span>, full: true },
              ...(c.sellerReason ? [{ label: fr ? "Votre motif de refus" : "Your rejection reason", value: c.sellerReason, full: true }] : []),
              ...(c.resolution ? [{ label: fr ? "Décision" : "Resolution", value: resolutionText(c, fr), full: true }] : []),
            ]}
          />
          {c.attachments.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{fr ? "Photos du client" : "Customer photos"}</p>
              <AttachmentGallery urls={c.attachments} />
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Remboursement" : "Refund"}>
          {c.refundUsd != null && c.refundUsd > 0 ? (
            <div className="space-y-2 text-sm">
              <p className="text-2xl font-bold text-emerald-700">{formatCurrency(c.refundUsd, locale)}</p>
              <p className="text-slate-600">
                {fr ? "Versé sur" : "Paid to"} {refundToLabel(c.refundTo, fr)}
                {itemsTotal > 0 && c.refundUsd < itemsTotal - 0.005
                  ? fr
                    ? ` — remboursement partiel (${formatCurrency(itemsTotal, locale)} demandés)`
                    : ` — partial refund (${formatCurrency(itemsTotal, locale)} requested)`
                  : ""}
              </p>
              {c.outcome && <Badge variant={caseOutcomeVariant(c.outcome)}>{caseOutcomeLabel(c.outcome, fr)}</Badge>}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              {open
                ? isReturn
                  ? fr ? "Aucun remboursement pour le moment. Il couvre uniquement les articles retournés." : "No refund yet. It covers the returned items only."
                  : fr ? "Aucune décision pour le moment : le support Somba peut rembourser tout ou partie, envoyer un remplacement ou refuser." : "No decision yet: Somba support can refund all or part, send a replacement or refuse."
                : c.outcome === "reject" || c.status === "rejected"
                  ? fr ? "Aucun remboursement : la demande a été refusée." : "No refund: the request was refused."
                  : "—"}
            </p>
          )}
          {(isReturn || (c.refundUsd ?? 0) > 0) && (
            <p className="mt-3 text-xs text-slate-500">
              {fr
                ? "Quand des articles sont remboursés, vos gains sont ajustés : la vente est reprise pour ces articles."
                : "When items are refunded, your earnings are adjusted: the sale is taken back for those items."}
            </p>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Articles concernés" : "Items concerned"} span={3}>
          {c.items.length === 0 ? (
            <p className="text-sm text-slate-500">{fr ? "Toute la commande." : "The whole order."}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2 pr-4 font-semibold">{fr ? "Article" : "Item"}</th>
                    <th className="py-2 pr-4 font-semibold">{fr ? "Qté" : "Qty"}</th>
                    <th className="py-2 pr-4 font-semibold">{fr ? "Prix unitaire" : "Unit price"}</th>
                    <th className="py-2 pr-4 font-semibold">{fr ? "Remboursé" : "Refunded"}</th>
                    {(graded || c.receivedAt) && <th className="py-2 pr-4 font-semibold">{fr ? "État constaté" : "Grading"}</th>}
                  </tr>
                </thead>
                <tbody>
                  {c.items.map((i) => {
                    const variant = variantText(i.variant, i.variantFr, fr);
                    return (
                      <tr key={i.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-2.5 pr-4">
                          <span className="font-medium text-slate-900">{pickText(fr, i.productName, i.productNameFr)}</span>
                          {variant && <span className="block text-xs text-slate-500">{variant}</span>}
                        </td>
                        <td className="py-2.5 pr-4">{i.qty}</td>
                        <td className="py-2.5 pr-4">{formatCurrency(i.unitPriceUsd, locale)}</td>
                        <td className="py-2.5 pr-4">{i.refundUsd > 0 ? formatCurrency(i.refundUsd, locale) : "—"}</td>
                        {(graded || c.receivedAt) && (
                          <td className="py-2.5 pr-4">
                            {i.condition ? (
                              <span className="flex flex-col items-start gap-1">
                                <Badge variant={itemConditionVariant(i.condition)}>{itemConditionLabel(i.condition, fr)}</Badge>
                                <span className="text-xs text-slate-500">
                                  {fr ? `Remis en stock : ${i.restockedQty} / ${i.qty}` : `Back in stock: ${i.restockedQty} / ${i.qty}`}
                                </span>
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">{fr ? "En attente d'évaluation" : "Waiting for grading"}</span>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Conversation" : "Conversation"} span={3}>
          <CaseThread messages={messages} canReply={open} onSend={reply} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
