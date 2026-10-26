"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { PageHeader } from "@/components/ui/page-header";
import { AftersaleRespond } from "@/components/seller/aftersale-respond";
import { StepTrack, type Step } from "@/components/seller/aftersale-steps";
import { AttachmentGallery } from "@/components/seller/attachments";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { localDateTime } from "@/lib/dates";
import { pickText } from "@/lib/i18n-fields";
import { sellerRequest } from "@/lib/seller-api";
import {
  caseCategoryLabel,
  exchangeStageLabel,
  exchangeStageVariant,
  legKindLabel,
  legStatusLabel,
  replacementStageLabel,
  replacementStageVariant,
  resolveRecordId,
  useCaseLegs,
  useExchange,
  useExchanges,
  useReplacement,
  useReplacements,
  variantSuffix,
  type SellerExchange,
  type SellerReplacement,
} from "@/lib/seller-aftersale";
import { formatCurrency } from "@/lib/utils";
import type { FlowKind } from "@/components/seller/aftersale-flow-list";

type Flow = SellerReplacement | SellerExchange;

function flowSteps(f: Flow, fr: boolean): Step[] {
  const rejected = f.status === "rejected";
  const approved = !["requested", "rejected"].includes(f.status);
  const prepared = ["received", "allocated", "ready", "dispatched", "delivered"].includes(f.status);
  const onTheWay = f.status === "dispatched" || f.status === "delivered";
  return [
    { label: fr ? "Demande du client" : "Customer request", hint: localDateTime(f.createdAt), state: "done" },
    {
      label: fr ? "Votre réponse" : "Your answer",
      hint: f.sellerRespondedAt ? localDateTime(f.sellerRespondedAt) : undefined,
      state: f.status === "requested" ? "current" : rejected ? "failed" : "done",
    },
    {
      label: fr ? "Collecte chez vous et préparation" : "Pickup from you and preparation",
      state: rejected ? "todo" : prepared ? "done" : approved ? "current" : "todo",
    },
    {
      label: fr ? "En route vers le client" : "On its way to the customer",
      state: rejected ? "todo" : f.status === "delivered" ? "done" : onTheWay ? "current" : "todo",
    },
    {
      label: fr ? "Livré" : "Delivered",
      hint: f.deliveredAt ? localDateTime(f.deliveredAt) : undefined,
      state: f.status === "delivered" ? "done" : "todo",
    },
  ];
}

/** One replacement or exchange: facts, the answer buttons, price difference, delivery progress (live). */
export function AftersaleFlowDetail({ kind, idOrRef }: { kind: FlowKind; idOrRef: string }) {
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const isRep = kind === "replacement";
  const base = isRep ? "/seller/replacements" : "/seller/exchanges";
  const repList = useReplacements();
  const excList = useExchanges();
  const list = (isRep ? repList.data : excList.data) as { id: string; reference: string }[] | null;
  const resolved = resolveRecordId(idOrRef, list);
  const repQ = useReplacement(isRep ? resolved.id : null);
  const excQ = useExchange(isRep ? null : resolved.id);
  const q = isRep ? repQ : excQ;
  const f = q.data as Flow | null;
  const legs = useCaseLegs(resolved.id);
  const setData = q.setData as (u: (cur: Flow | null) => Flow | null) => void;
  const steps = useMemo(() => (f ? flowSteps(f, fr) : []), [f, fr]);

  if (resolved.waiting || (q.loading && !f)) return <SectionLoader />;
  if (!f) {
    return q.error ? (
      <LoadError message={q.error} onRetry={q.reload} />
    ) : (
      <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
        {isRep ? (fr ? "Remplacement introuvable." : "Replacement not found.") : fr ? "Échange introuvable." : "Exchange not found."}
      </p>
    );
  }

  const stageLabel = isRep ? replacementStageLabel : exchangeStageLabel;
  const stageVariant = isRep ? replacementStageVariant : exchangeStageVariant;
  const rep = isRep ? (f as SellerReplacement) : null;
  const exc = isRep ? null : (f as SellerExchange);
  const qty = f.qty ?? 1;

  async function respond(approve: boolean, reason?: string) {
    const view = await sellerRequest<Flow>(isRep ? "replacements:respond" : "exchanges:respond", { id: f!.id, approve, ...(approve ? {} : { reason }) });
    setData((cur) => (cur ? { ...cur, ...view } : view));
  }

  const diff = exc?.priceDiffUsd ?? 0;
  const itemName = rep ? pickText(fr, rep.productName, rep.productNameFr) : exc ? pickText(fr, exc.fromName, exc.fromNameFr) : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={f.reference}
        subtitle={`${fr ? "Commande" : "Order"} ${f.orderReference} · ${itemName}`}
        backHref={base}
        actions={<Badge variant={stageVariant(f.status)}>{stageLabel(f.status, fr)}</Badge>}
      />
      {q.error && <LoadError message={q.error} onRetry={q.reload} />}

      {f.status === "requested" && (
        <AftersaleRespond
          title={isRep ? { en: "This replacement needs your answer", fr: "Ce remplacement attend votre réponse" } : { en: "This exchange needs your answer", fr: "Cet échange attend votre réponse" }}
          intro={
            isRep
              ? {
                  en: "Approve it and one unit per requested item is set aside from your stock; the warehouse collects it from your store and delivers it to the customer, collecting the faulty unit on the same trip. Reject it with a reason if the request is not justified.",
                  fr: "Approuvez-le : une unité par article demandé est mise de côté dans votre stock ; l'entrepôt la collecte chez vous et la livre au client, en reprenant l'unité défectueuse au même passage. Refusez avec un motif si la demande n'est pas justifiée.",
                }
              : {
                  en: "Approve it and the new item is set aside from your stock; the warehouse collects it from your store and delivers it, taking back the old one. Reject it with a reason if you cannot or will not swap.",
                  fr: "Approuvez-le : le nouvel article est mis de côté dans votre stock ; l'entrepôt le collecte chez vous et le livre, en reprenant l'ancien. Refusez avec un motif si vous ne pouvez pas ou ne voulez pas l'échanger.",
                }
          }
          acceptHint={
            isRep
              ? {
                  en: `${qty} unit(s) of "${itemName}" will be taken from your stock. If you do not have enough, the approval fails and the request stays open.`,
                  fr: `${qty} unité(s) de « ${itemName} » seront prélevées sur votre stock. Si vous n'en avez pas assez, l'approbation échoue et la demande reste ouverte.`,
                }
              : {
                  en: `${qty} unit(s) of the new item will be taken from your stock${diff > 0 ? `; the customer pays the ${formatCurrency(diff, locale)} difference` : diff < 0 ? `; the customer is refunded ${formatCurrency(-diff, locale)}` : ""}. If you do not have enough, the approval fails.`,
                  fr: `${qty} unité(s) du nouvel article seront prélevées sur votre stock${diff > 0 ? ` ; le client paie la différence de ${formatCurrency(diff, locale)}` : diff < 0 ? ` ; le client est remboursé de ${formatCurrency(-diff, locale)}` : ""}. Si vous n'en avez pas assez, l'approbation échoue.`,
                }
          }
          due={f.sellerDueAt}
          onRespond={respond}
          doneAccept={isRep ? { en: "Replacement approved: the warehouse will collect it", fr: "Remplacement approuvé : l'entrepôt va le collecter" } : { en: "Exchange approved: the warehouse will collect it", fr: "Échange approuvé : l'entrepôt va le collecter" }}
          doneReject={isRep ? { en: "Replacement rejected", fr: "Remplacement refusé" } : { en: "Exchange rejected", fr: "Échange refusé" }}
        />
      )}

      <section className="card-premium p-5">
        <StepTrack steps={steps} />
      </section>

      <DetailGrid>
        <DetailGridSection title={fr ? "Aperçu" : "Overview"} span={2}>
          <InfoGrid
            items={[
              { label: fr ? "N° dossier" : "Case ID", value: f.reference },
              { label: fr ? "Commande" : "Order", value: <Link href={`/seller/orders/${f.orderReference}`} className="text-[var(--primary)] hover:underline">{f.orderReference}</Link> },
              { label: t("customer"), value: f.customerName },
              { label: fr ? "Date" : "Date", value: localDateTime(f.createdAt) },
              ...(rep
                ? [
                    { label: fr ? "Article" : "Item", value: `${itemName}${variantSuffix(rep.variant, fr)}` },
                                        { label: fr ? "Quantité" : "Quantity", value: String(qty) },
                    { label: fr ? "État signalé" : "Reported condition", value: caseCategoryLabel(rep.condition, fr) },
                  ]
                : exc
                  ? [
                      { label: fr ? "Article rendu" : "Item returned", value: `${itemName}${variantSuffix(exc.fromVariant, fr)}` },
                      { label: fr ? "Article souhaité" : "Item wanted", value: `${pickText(fr, exc.toName, exc.toNameFr)}${variantSuffix(exc.toVariant, fr)}` },
                      { label: fr ? "Quantité" : "Quantity", value: String(qty) },
                    ]
                  : []),
              { label: fr ? "Motif du client" : "Customer's reason", value: <span className="whitespace-pre-line">{f.reason || "—"}</span>, full: true },
              ...(f.sellerReason ? [{ label: fr ? "Votre motif de refus" : "Your rejection reason", value: f.sellerReason, full: true }] : []),
            ]}
          />
          {rep && rep.attachments.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">{fr ? "Photos du client" : "Customer photos"}</p>
              <AttachmentGallery urls={rep.attachments} />
            </div>
          )}
        </DetailGridSection>

        <DetailGridSection title={exc ? (fr ? "Différence de prix" : "Price difference") : fr ? "Votre stock" : "Your stock"}>
          {exc ? (
            <div className="space-y-2 text-sm">
              <p className={`text-2xl font-bold ${diff > 0 ? "text-slate-900" : diff < 0 ? "text-emerald-700" : "text-slate-500"}`}>
                {diff === 0 ? formatCurrency(0, locale) : `${diff > 0 ? "+" : "−"}${formatCurrency(Math.abs(diff), locale)}`}
              </p>
              <p className="text-slate-600">
                {diff > 0
                  ? fr
                    ? `Le nouvel article coûte plus cher : le client paie la différence, retenue sur son portefeuille au dépôt de la demande${exc.heldUsd ? ` (${formatCurrency(exc.heldUsd, locale)} retenus)` : ""}. Elle lui est rendue si vous refusez.`
                    : `The new item costs more: the customer pays the difference, held from their wallet when they filed the request${exc.heldUsd ? ` (${formatCurrency(exc.heldUsd, locale)} held)` : ""}. It is given back if you reject.`
                  : diff < 0
                    ? fr
                      ? "Le nouvel article coûte moins cher : le client est remboursé de la différence sur son portefeuille à la livraison."
                      : "The new item costs less: the customer is refunded the difference to their wallet on delivery."
                    : fr
                      ? "Aucune différence de prix."
                      : "No price difference."}
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              {rep?.stockTaken
                ? fr
                  ? `${qty} unité(s) ont été prélevées sur votre stock pour ce remplacement.`
                  : `${qty} unit(s) were taken from your stock for this replacement.`
                : f.status === "requested"
                  ? fr
                    ? `L'approbation prélèvera ${qty} unité(s) sur votre stock.`
                    : `Approving takes ${qty} unit(s) from your stock.`
                  : f.status === "rejected"
                    ? fr ? "Aucun stock n'a été prélevé." : "No stock was taken."
                    : fr ? "Aucun prélèvement de stock enregistré." : "No stock movement recorded."}
            </p>
          )}
          {exc && (
            <p className="mt-3 text-xs text-slate-500">
              {exc.stockTaken
                ? fr ? `${qty} unité(s) du nouvel article prélevées sur votre stock.` : `${qty} unit(s) of the new item were taken from your stock.`
                : f.status === "requested"
                  ? fr ? `L'approbation prélèvera ${qty} unité(s) du nouvel article sur votre stock.` : `Approving takes ${qty} unit(s) of the new item from your stock.`
                  : ""}
            </p>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Livraison" : "Delivery"} span={3}>
          <div className="space-y-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 text-slate-600">
              <Truck className="h-4 w-4 text-slate-400" aria-hidden="true" />
              {f.status === "requested"
                ? fr ? "Aucune livraison tant que vous n'avez pas répondu." : "No delivery until you answer."
                : f.status === "rejected"
                  ? fr ? "Demande refusée : aucune livraison." : "Request rejected: no delivery."
                  : f.status === "delivered"
                    ? fr ? `Livré le ${f.deliveredAt ? localDateTime(f.deliveredAt) : "—"}.` : `Delivered on ${f.deliveredAt ? localDateTime(f.deliveredAt) : "—"}.`
                    : f.status === "dispatched"
                      ? fr ? "Le nouvel article est en route vers le client." : "The new item is on its way to the customer."
                      : fr
                        ? "L'entrepôt organise la collecte chez vous puis la livraison au client."
                        : "The warehouse is arranging the pickup from you, then the delivery to the customer."}
            </p>
            {legs.length > 0 && (
              <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
                {legs.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <span className="font-medium text-slate-900">{legKindLabel(l.kind, fr)}</span>
                    <span className="flex items-center gap-2 text-slate-600">
                      {l.riderName ? <span>{l.riderName}</span> : null}
                      <Badge variant={l.status === "delivered" ? "success" : l.status === "failed" ? "danger" : "info"}>{legStatusLabel(l.status, fr)}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
