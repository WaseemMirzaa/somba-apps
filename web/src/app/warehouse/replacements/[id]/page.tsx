"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, Package, Phone, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { getOrder } from "@/lib/entities";
import { useWarehouseData } from "@/lib/warehouse";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useReplacements } from "@/context/replacement-context";
import {
  replacementStatusLabel,
  replacementStatusVariant,
  replacementNextActions,
  normalizeReplacementStatus,
  type ReplacementStatus,
} from "@/lib/replacement-workflow";

// Order status values originate from the shared (non-owned) entities layer.
const ORDER_STATUS_FR: Record<string, string> = {
  delivered: "Livré",
  processing: "En cours",
  pending: "En attente",
  cancelled: "Annulé",
  shipped: "Expédié",
};

export default function WarehouseReplacementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const { getReplacement, advance, assignRider } = useReplacements();
  const { riderEntities } = useWarehouseData();
  const rep = getReplacement(id);
  const order = rep ? getOrder(rep.orderId) : undefined;
  const [riderName, setRiderName] = useState("");

  if (!rep) {
    return (
      <div className="p-8 text-center text-slate-500">
        {fr ? "Remplacement introuvable" : "Replacement not found"}
      </div>
    );
  }

  const reason = fr ? rep.reasonFr : rep.reason;
  const comment = fr ? rep.customerCommentFr : rep.customerComment;
  const dispatch = rep.newProduct.dispatch;
  const dispatchStatus = fr ? dispatch.statusFr : dispatch.status;
  const statusLabel = replacementStatusLabel(rep.status, fr);
  const actions = replacementNextActions(rep.status);
  const hasRider = Boolean(dispatch.rider);

  function runAction(to: ReplacementStatus, requiresRider?: boolean) {
    if (!rep) return;
    if (requiresRider && !hasRider) {
      toast(fr ? "Assignez d'abord un livreur" : "Assign a rider first", "info");
      return;
    }
    advance(rep.id, to);
    toast(fr ? "Statut mis à jour" : "Status updated");
  }

  function doAssignRider() {
    if (!rep || !riderName.trim()) return;
    const match = riderEntities.find((r) => r.name === riderName);
    assignRider(rep.id, {
      rider: riderName,
      riderPhone: match?.phone,
      batchId: dispatch.batchId ?? "BATCH-REP",
      eta: fr ? "Aujourd'hui, 16:00" : "Today, 4:00 PM",
    });
    toast(fr ? "Livreur assigné" : "Rider assigned");
    setRiderName("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={rep.id}
        subtitle={`${rep.createdAt} · ${statusLabel} · ${rep.orderId}`}
        backHref="/warehouse/replacements"
        breadcrumbs={[
          { label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" },
          { label: fr ? "Remplacements" : "Replacements", href: "/warehouse/replacements" },
          { label: rep.id },
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={replacementStatusVariant(rep.status)}>{statusLabel}</Badge>
            {actions.map((a) => (
              <button
                key={a.to}
                onClick={() => runAction(a.to, a.requiresRider)}
                className={
                  a.danger
                    ? "rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    : "btn-primary rounded-lg px-4 py-2 text-sm font-medium"
                }
              >
                {fr ? a.labelFr : a.labelEn}
              </button>
            ))}
          </div>
        }
      />

      {/* Workflow progress */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-white p-3 text-xs">
        {(["requested", "inspecting", "approved", "allocated", "dispatched", "delivered", "closed"] as ReplacementStatus[]).map((s, i) => {
          const cur = normalizeReplacementStatus(rep.status);
          const order = ["requested", "inspecting", "approved", "allocated", "dispatched", "delivered", "closed"];
          const reached = order.indexOf(cur) >= i || cur === "rejected";
          return (
            <span key={s} className="flex items-center gap-2">
              <span className={reached ? "flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[10px] font-bold text-white" : "flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-[10px] text-slate-500"}>{i + 1}</span>
              <span className={reached ? "font-medium text-slate-800" : "text-slate-400"}>{replacementStatusLabel(s, fr)}</span>
              {i < 6 && <span className="text-slate-300">→</span>}
            </span>
          );
        })}
      </div>

      <div className="rounded-2xl border-2 border-red-200 bg-gradient-to-r from-red-50 to-orange-50 p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">
              {fr ? "Motif du remplacement" : "Replacement reason"}
            </p>
            <p className="mt-1 text-xl font-bold text-red-950">{reason}</p>
            {!fr && rep.reasonFr !== rep.reason && (
              <p className="mt-1 text-sm font-medium text-red-800/80">{rep.reasonFr}</p>
            )}
            {fr && rep.reason !== rep.reasonFr && (
              <p className="mt-1 text-sm font-medium text-red-800/80">{rep.reason}</p>
            )}
            {comment && (
              <p className="mt-2 text-sm leading-relaxed text-red-900/80">{comment}</p>
            )}
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Informations remplacement" : "Replacement Information"}>
          <InfoGrid
            items={[
              { label: fr ? "ID remplacement" : "Replacement ID", value: rep.id },
              { label: fr ? "Demandé le" : "Requested", value: rep.createdAt },
              { label: fr ? "Statut" : "Status", value: statusLabel },
              {
                label: fr ? "Motif" : "Reason",
                value: <span className="font-semibold text-red-700">{reason}</span>,
              },
              { label: fr ? "Entrepôt" : "Warehouse", value: rep.warehouse },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commande" : "Order"}>
          <InfoGrid
            items={[
              {
                label: fr ? "N° commande" : "Order ID",
                value: (
                  <Link href={`/admin/orders/${rep.orderId}`} className="text-[var(--primary)] hover:underline">
                    {rep.orderId}
                  </Link>
                ),
              },
              ...(order
                ? [
                    { label: fr ? "Date commande" : "Order date", value: order.date },
                    {
                      label: fr ? "Montant commande" : "Order amount",
                      value: formatCurrency(order.amount, locale),
                    },
                    { label: fr ? "Paiement" : "Payment", value: order.paymentMethod },
                    { label: fr ? "Statut commande" : "Order status", value: fr ? (ORDER_STATUS_FR[order.status] ?? order.status) : order.status },
                    { label: fr ? "Articles" : "Items", value: order.itemsCount },
                  ]
                : []),
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={t("customer")}>
          <InfoGrid
            items={[
              {
                label: fr ? "Nom" : "Name",
                value: order ? (
                  <Link
                    href={`/admin/customers/${order.customerId}`}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {rep.customer}
                  </Link>
                ) : (
                  rep.customer
                ),
              },
              ...(order
                ? [
                    {
                      label: fr ? "Téléphone" : "Phone",
                      value: (
                        <a
                          href={`tel:${order.customerPhone.replace(/\s/g, "")}`}
                          className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {order.customerPhone}
                        </a>
                      ),
                    },
                    { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
                    { label: fr ? "Ville" : "City", value: order.customerCity },
                  ]
                : [{ label: fr ? "ID client" : "Customer ID", value: rep.customerId }]),
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
          <InfoGrid
            items={[
              {
                label: fr ? "Boutique" : "Store",
                value: (
                  <Link
                    href={`/admin/sellers/${rep.sellerId}`}
                    className="text-[var(--primary)] hover:underline"
                  >
                    {rep.sellerName}
                  </Link>
                ),
              },
              { label: fr ? "ID vendeur" : "Seller ID", value: rep.sellerId },
              ...(order
                ? [
                    { label: fr ? "Commission" : "Commission", value: formatCurrency(order.commission, locale) },
                    {
                      label: fr ? "Gains vendeur" : "Seller earnings",
                      value: formatCurrency(order.sellerEarnings, locale),
                    },
                  ]
                : []),
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produit retourné" : "Returned Product"} span={2}>
          <ReplacementProductCard
            fr={fr}
            product={rep.returnedProduct}
            locale={locale}
            accent="amber"
            extraItems={[
              {
                label: fr ? "Condition" : "Condition",
                value: fr ? rep.returnedProduct.conditionFr : rep.returnedProduct.condition,
              },
              {
                label: fr ? "Notes d'inspection" : "Inspection notes",
                value: fr ? rep.returnedProduct.inspectionFr : rep.returnedProduct.inspection,
                full: true,
              },
              {
                label: fr ? "Photos inspection" : "Inspection photos",
                value: `${rep.returnedProduct.inspectionPhotos} ${fr ? "téléversée(s)" : "uploaded"}`,
              },
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Nouveau produit" : "New Product"} span={2}>
          <ReplacementProductCard
            fr={fr}
            product={rep.newProduct}
            locale={locale}
            accent="emerald"
            extraItems={[
              {
                label: fr ? "Emplacement entrepôt" : "Warehouse location",
                value: fr ? rep.newProduct.warehouseLocationFr : rep.newProduct.warehouseLocation,
                full: true,
              },
              {
                label: fr ? "Alloué" : "Allocated",
                value: rep.newProduct.allocated
                  ? fr
                    ? `Oui · ${rep.newProduct.allocatedAt ?? "—"}`
                    : `Yes · ${rep.newProduct.allocatedAt ?? "—"}`
                  : fr
                    ? "Non — en attente"
                    : "No — pending",
              },
              { label: fr ? "Statut expédition" : "Dispatch status", value: dispatchStatus },
            ]}
          />

          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
              <Truck className="h-4 w-4" />
              {fr ? "Détails expédition" : "Dispatch details"}
            </div>
            <InfoGrid
              className="mt-3"
              items={[
                ...(dispatch.batchId
                  ? [{ label: fr ? "Lot" : "Batch", value: dispatch.batchId }]
                  : []),
                {
                  label: fr ? "Fenêtre expédition" : "Dispatch window",
                  value: fr ? dispatch.windowFr ?? "—" : dispatch.window ?? "—",
                  full: true,
                },
                ...(dispatch.rider
                  ? [
                      { label: fr ? "Livreur" : "Rider", value: dispatch.rider },
                      {
                        label: fr ? "Téléphone livreur" : "Rider phone",
                        value: dispatch.riderPhone ? (
                          <a
                            href={`tel:${dispatch.riderPhone.replace(/\s/g, "")}`}
                            className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {dispatch.riderPhone}
                          </a>
                        ) : (
                          "—"
                        ),
                      },
                      ...(dispatch.vehicle
                        ? [{ label: fr ? "Véhicule" : "Vehicle", value: dispatch.vehicle }]
                        : []),
                    ]
                  : [
                      {
                        label: fr ? "Livreur" : "Rider",
                        value: fr ? "Non assigné" : "Unassigned",
                      },
                    ]),
                {
                  label: "ETA",
                  value: fr ? dispatch.etaFr ?? dispatch.eta ?? "—" : dispatch.eta ?? "—",
                },
              ]}
            />
            {!rep.newProduct.allocated && (
              <p className="mt-3 text-xs text-indigo-700/80">
                {fr
                  ? "L'unité de remplacement sera réservée après réception et inspection de l'article retourné."
                  : "Replacement unit will be reserved after the returned item is received and inspected."}
              </p>
            )}
            {rep.newProduct.allocated && !hasRider && (
              <div className="mt-3 rounded-lg border border-indigo-200 bg-white p-3">
                <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800">
                  <Package className="h-4 w-4 text-indigo-600" />
                  {fr ? "Assigner un livreur pour l'expédition" : "Assign a rider for dispatch"}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={riderName}
                    onChange={(e) => setRiderName(e.target.value)}
                    className="input-premium px-3 py-2 text-sm"
                  >
                    <option value="">{fr ? "Choisir un livreur…" : "Choose a rider…"}</option>
                    {riderEntities.map((r) => (
                      <option key={r.id} value={r.name}>{r.name} · {r.zone}</option>
                    ))}
                  </select>
                  <button onClick={doAssignRider} disabled={!riderName} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                    {fr ? "Assigner" : "Assign"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {fr ? "Une fois le livreur assigné, utilisez « Expédier au client »." : "Once a rider is assigned, use “Dispatch to customer”."}
                </p>
              </div>
            )}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline
            events={rep.timeline.map((event) => ({
              time: event.time,
              label: fr ? event.labelFr : event.label,
              detail: fr ? event.detailFr : event.detail,
              done: event.done,
            }))}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}

function ReplacementProductCard({
  fr,
  product,
  locale,
  accent,
  extraItems,
}: {
  fr: boolean;
  product: {
    sku: string;
    productId: number;
    name: string;
    nameFr: string;
    variant: string;
    variantFr: string;
    image: string;
    price: number;
  };
  locale: "en" | "fr";
  accent: "amber" | "emerald";
  extraItems?: { label: string; value: React.ReactNode; full?: boolean }[];
}) {
  const border =
    accent === "amber" ? "border-amber-200 bg-amber-50/40" : "border-emerald-200 bg-emerald-50/40";

  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <div className="flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-white shadow-sm">
          <Image
            src={product.image}
            alt={fr ? product.nameFr : product.name}
            fill
            className="object-cover"
            sizes="96px"
          />
        </div>
        <div className="min-w-0 flex-1">
          <Link
            href={`/shop/products/${product.productId}`}
            className="font-medium text-[var(--primary)] hover:underline"
          >
            {fr ? product.nameFr : product.name}
          </Link>
          <p className="mt-1 text-xs text-slate-500">SKU: {product.sku}</p>
          <p className="mt-1 text-sm text-slate-700">{fr ? product.variantFr : product.variant}</p>
          <p className="mt-2 font-semibold text-slate-900">{formatCurrency(product.price, locale)}</p>
        </div>
      </div>
      {extraItems && extraItems.length > 0 && (
        <div className="mt-4 border-t border-white/60 pt-4">
          <InfoGrid items={extraItems} />
        </div>
      )}
    </div>
  );
}
