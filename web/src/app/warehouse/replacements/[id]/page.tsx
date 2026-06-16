"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, Package, Phone, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { getReplacement } from "@/lib/warehouse-entities";
import { getOrder } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

function formatReplacementStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function replacementStatusVariant(status: string): "success" | "warning" | "info" {
  if (status === "allocated" || status === "dispatched" || status === "completed") return "success";
  if (status === "inspecting") return "info";
  return "warning";
}

export default function WarehouseReplacementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const rep = getReplacement(id);
  const order = rep ? getOrder(rep.orderId) : undefined;

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

  return (
    <div className="space-y-6">
      <PageHeader
        title={rep.id}
        subtitle={`${rep.createdAt} · ${formatReplacementStatus(rep.status)} · ${rep.orderId}`}
        backHref="/warehouse/replacements"
        breadcrumbs={[
          { label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" },
          { label: fr ? "Remplacements" : "Replacements", href: "/warehouse/replacements" },
          { label: rep.id },
        ]}
        actions={
          <>
            <Badge variant={replacementStatusVariant(rep.status)}>
              {formatReplacementStatus(rep.status)}
            </Badge>
            {!rep.newProduct.allocated && (
              <button
                onClick={() => toast(fr ? "Inventaire alloué pour le remplacement" : "Inventory allocated for replacement")}
                className="btn-primary rounded-lg px-4 py-2 text-sm"
              >
                {fr ? "Allouer inventaire" : "Allocate Inventory"}
              </button>
            )}
            {rep.newProduct.allocated && !dispatch.batchId && (
              <button
                onClick={() => {
                  toast(fr ? "Lot d'expédition créé" : "Dispatch batch created");
                  router.push("/warehouse/dispatch/BAT-001");
                }}
                className="rounded-lg border border-indigo-200 px-4 py-2 text-sm hover:bg-indigo-50"
              >
                {fr ? "Créer expédition" : "Create Dispatch"}
              </button>
            )}
          </>
        }
      />

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
              { label: fr ? "Statut" : "Status", value: formatReplacementStatus(rep.status) },
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
                    { label: fr ? "Statut commande" : "Order status", value: order.status },
                    { label: fr ? "Articles" : "Items", value: order.itemsCount },
                  ]
                : []),
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Client" : "Customer"}>
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
            {rep.newProduct.allocated && !dispatch.batchId && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-indigo-200 bg-white p-3 text-sm text-slate-700">
                <Package className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                <p>
                  {fr
                    ? "Unité allouée et prête. Ajoutez au prochain lot d'expédition Zone A ou créez un lot dédié depuis le panneau d'actions."
                    : "Unit allocated and ready. Add to the next Zone A dispatch batch or create a dedicated batch from the action panel."}
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
