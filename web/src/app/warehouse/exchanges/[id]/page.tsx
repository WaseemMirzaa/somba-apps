"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { StatusButtons } from "@/components/warehouse/status-buttons";
import { EXCHANGE_NEXT, EXCHANGE_STATUS, pick, shortDate, useOpsQuery, type ExchangeRow } from "@/lib/warehouse-live";
import { useOpsBase, useOpsPath } from "@/lib/ops-path";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

export default function WarehouseExchangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const ops = useOpsPath();
  const base = useOpsBase();
  const q = useOpsQuery<ExchangeRow[]>("exchanges:list", { initial: [] as ExchangeRow[], push: ["exchange:updated"] });
  const exc = q.data.find((e) => e.id === id || e.reference === id);

  if (!exc) {
    return (
      <div className="p-8 text-center text-slate-500">
        {q.loading ? (fr ? "Chargement…" : "Loading…") : q.error ?? (fr ? "Échange introuvable" : "Exchange not found")}
      </div>
    );
  }

  const statusLabel = pick(EXCHANGE_STATUS[exc.status], fr, exc.status);
  const diff = exc.priceDiffUsd;
  const priceDiffLabel =
    diff > 0
      ? (fr ? `À encaisser ${formatCurrency(diff, locale)}` : `Collect ${formatCurrency(diff, locale)}`)
      : diff < 0
        ? (fr ? `Rembourser ${formatCurrency(Math.abs(diff), locale)}` : `Refund ${formatCurrency(Math.abs(diff), locale)}`)
        : (fr ? "Aucune différence de prix" : "No price difference");
  const listHref = ops("/exchanges");

  return (
    <div className="space-y-6">
      <PageHeader
        title={exc.reference}
        subtitle={`${shortDate(exc.createdAt, locale)} · ${statusLabel} · ${exc.orderReference}`}
        backHref={listHref}
        breadcrumbs={[
          { label: base.startsWith("/admin") ? "Admin" : (fr ? "Entrepôt" : "Warehouse"), href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" },
          { label: fr ? "Échanges" : "Exchanges", href: listHref },
          { label: exc.reference },
        ]}
        actions={<Badge variant={exc.status === "dispatched" || exc.status === "delivered" ? "success" : exc.status === "rejected" ? "danger" : "warning"}>{statusLabel}</Badge>}
      />

      <DetailGrid>
        <DetailGridSection title={fr ? "Informations échange" : "Exchange Information"}>
          <InfoGrid items={[
            { label: fr ? "ID échange" : "Exchange ID", value: exc.reference },
            { label: fr ? "Demandé le" : "Requested", value: shortDate(exc.createdAt, locale) },
            { label: fr ? "Mis à jour" : "Updated", value: shortDate(exc.updatedAt, locale) },
            { label: fr ? "Statut" : "Status", value: statusLabel },
            { label: fr ? "Motif" : "Reason", value: exc.reason ?? "—", full: true },
            { label: fr ? "Différence de prix" : "Price difference", value: priceDiffLabel },
            { label: fr ? "Quantité" : "Quantity", value: exc.qty ?? 1 },
            { label: fr ? "Livré le" : "Delivered", value: exc.deliveredAt ? shortDate(exc.deliveredAt, locale) : "—" },
            ...(exc.sellerReason ? [{ label: fr ? "Réponse du vendeur" : "Seller's answer", value: exc.sellerReason, full: true }] : []),
          ]} />
          {exc.deliveryTaskId ? (
            <Link href={ops(`/tasks/${exc.deliveryTaskId}`)} className="mt-3 inline-block text-sm text-[var(--primary)] hover:underline">
              {fr ? "Suivre les trajets de livraison (le statut suit le trajet) →" : "Follow the delivery legs (the status follows the leg) →"}
            </Link>
          ) : exc.status === "approved" ? (
            <p className="mt-3 text-xs text-slate-500">{fr ? "Le trajet de livraison est créé à l'approbation." : "The delivery leg is created on approval."}</p>
          ) : null}
        </DetailGridSection>

        <DetailGridSection title={t("customer")}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: exc.customerName },
            { label: fr ? "Commande" : "Order", value: exc.orderReference },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Faire avancer l'échange" : "Move the exchange along"}>
          <StatusButtons<ExchangeRow>
            event="exchanges:setStatus"
            id={exc.id}
            next={EXCHANGE_NEXT[exc.status] ?? []}
            labels={EXCHANGE_STATUS}
            onSaved={(row) => q.patch((cur) => cur.map((e) => (e.id === row.id ? { ...e, ...row } : e)))}
          />
          {(EXCHANGE_NEXT[exc.status] ?? []).length === 0 && (
            <p className="text-sm text-slate-500">{fr ? "Aucune étape suivante." : "No further steps."}</p>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits échangés" : "Products Being Exchanged"} span={3}>
          <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{fr ? "Article retourné" : "Item being returned"}</p>
              <p className="font-medium text-slate-900">{fr && exc.fromNameFr ? exc.fromNameFr : exc.fromName}</p>
              <p className="text-xs text-slate-500">SKU: {exc.fromSku}{exc.fromVariant ? ` · ${exc.fromVariant}` : ""}</p>
            </div>
            <div className="flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <ArrowLeftRight className="h-6 w-6" />
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{fr ? "Nouvel article" : "Replacement item"}</p>
              <p className="font-medium text-slate-900">{fr && exc.toNameFr ? exc.toNameFr : exc.toName}</p>
              <p className="text-xs text-slate-500">SKU: {exc.toSku}{exc.toVariant ? ` · ${exc.toVariant}` : ""}</p>
            </div>
          </div>
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
