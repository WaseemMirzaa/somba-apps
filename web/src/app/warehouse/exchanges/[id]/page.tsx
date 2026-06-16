"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { getExchange } from "@/lib/warehouse-entities";
import { getOrder } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

function formatExchangeStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function exchangeStatusVariant(status: string): "success" | "warning" | "info" {
  if (status === "approved" || status === "completed") return "success";
  if (status === "inspecting") return "info";
  return "warning";
}

export default function WarehouseExchangeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const exc = getExchange(id);
  const order = exc ? getOrder(exc.orderId) : undefined;

  if (!exc) {
    return <div className="p-8 text-center text-slate-500">{fr ? "Échange introuvable" : "Exchange not found"}</div>;
  }

  const reason = fr ? exc.reasonFr : exc.reason;
  const comment = fr ? exc.customerCommentFr : exc.customerComment;
  const statusLabel = fr ? exc.statusFr : formatExchangeStatus(exc.status);

  const priceDiffLabel =
    exc.priceDifference > 0
      ? fr
        ? `À encaisser ${formatCurrency(exc.priceDifference, locale)}`
        : `Collect ${formatCurrency(exc.priceDifference, locale)}`
      : exc.priceDifference < 0
        ? fr
          ? `Rembourser ${formatCurrency(Math.abs(exc.priceDifference), locale)}`
          : `Refund ${formatCurrency(Math.abs(exc.priceDifference), locale)}`
        : fr
          ? "Aucune différence de prix"
          : "No price difference";

  return (
    <div className="space-y-6">
      <PageHeader
        title={exc.id}
        subtitle={`${exc.createdAt} · ${statusLabel} · ${exc.orderId}`}
        backHref="/warehouse/exchanges"
        breadcrumbs={[
          { label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" },
          { label: fr ? "Échanges" : "Exchanges", href: "/warehouse/exchanges" },
          { label: exc.id },
        ]}
        actions={
          <>
            <Badge variant={exchangeStatusVariant(exc.status)}>{statusLabel}</Badge>
            {exc.status === "pending" && (
              <>
                <button onClick={() => toast(fr ? "Échange approuvé" : "Exchange approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">
                  {fr ? "Approuver l'échange" : "Approve Exchange"}
                </button>
                <button onClick={() => toast(fr ? "Variante allouée depuis l'inventaire" : "Variant allocated from inventory", "info")} className="btn-primary rounded-lg px-4 py-2 text-sm">
                  {fr ? "Allouer variante" : "Allocate Variant"}
                </button>
              </>
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
              {fr ? "Motif de l'échange" : "Exchange reason"}
            </p>
            <p className="mt-1 text-xl font-bold text-red-950">{reason}</p>
            {!fr && exc.reasonFr !== exc.reason && (
              <p className="mt-1 text-sm font-medium text-red-800/80">{exc.reasonFr}</p>
            )}
            {fr && exc.reason !== exc.reasonFr && (
              <p className="mt-1 text-sm font-medium text-red-800/80">{exc.reason}</p>
            )}
            {comment && (
              <p className="mt-2 text-sm leading-relaxed text-red-900/80">{comment}</p>
            )}
          </div>
        </div>
      </div>

      <DetailGrid>
        <DetailGridSection title={fr ? "Informations échange" : "Exchange Information"}>
          <InfoGrid items={[
            { label: fr ? "ID échange" : "Exchange ID", value: exc.id },
            { label: fr ? "Demandé le" : "Requested", value: exc.createdAt },
            { label: fr ? "Statut" : "Status", value: statusLabel },
            { label: fr ? "Motif" : "Reason", value: <span className="font-semibold text-red-700">{reason}</span> },
            { label: fr ? "Différence de prix" : "Price difference", value: priceDiffLabel },
            { label: fr ? "Entrepôt" : "Warehouse", value: exc.warehouse },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Commande liée" : "Linked Order"}>
          <InfoGrid items={[
            { label: fr ? "N° commande" : "Order ID", value: <Link href={`/admin/orders/${exc.orderId}`} className="text-[var(--primary)] hover:underline">{exc.orderId}</Link> },
            ...(order ? [
              { label: fr ? "Date commande" : "Order date", value: order.date },
              { label: fr ? "Montant commande" : "Order amount", value: formatCurrency(order.amount, locale) },
            ] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("customer")}>
          <InfoGrid items={[
            { label: fr ? "Nom" : "Name", value: order
              ? <Link href={`/admin/customers/${order.customerId}`} className="text-[var(--primary)] hover:underline">{exc.customer}</Link>
              : exc.customer },
            ...(order ? [
              { label: fr ? "Téléphone" : "Phone", value: order.customerPhone },
              { label: fr ? "Adresse" : "Address", value: order.customerAddress, full: true },
              { label: fr ? "Ville" : "City", value: order.customerCity },
            ] : [{ label: fr ? "ID client" : "Customer ID", value: exc.customerId }]),
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Vendeur" : "Seller"}>
          <InfoGrid items={[
            { label: fr ? "Boutique" : "Store", value: <Link href={`/admin/sellers/${exc.sellerId}`} className="text-[var(--primary)] hover:underline">{exc.sellerName}</Link> },
            { label: fr ? "ID vendeur" : "Seller ID", value: exc.sellerId },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Produits échangés" : "Products Being Exchanged"} span={3}>
          <div className="grid gap-6 lg:grid-cols-[1fr_auto_1fr]">
            <ProductExchangeCard
              fr={fr}
              title={fr ? "Article retourné" : "Item being returned"}
              product={exc.oldProduct}
              locale={locale}
              accent="amber"
            />
            <div className="flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <ArrowLeftRight className="h-6 w-6" />
              </div>
            </div>
            <ProductExchangeCard
              fr={fr}
              title={fr ? "Nouvel article" : "Replacement item"}
              product={exc.newProduct}
              locale={locale}
              accent="emerald"
            />
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Photos client" : "Customer Photos"} span={3}>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {exc.photos.map((photo, index) => (
              <div key={photo + index} className="relative aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-slate-50">
                <Image
                  src={photo}
                  alt={fr ? `Photo échange ${index + 1}` : `Exchange photo ${index + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 25vw"
                />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            {fr
              ? `${exc.photos.length} photo(s) jointe(s) par le client pour justifier l'échange.`
              : `${exc.photos.length} photo(s) uploaded by the customer to support the exchange request.`}
          </p>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Workflow" : "Workflow"} span={2}>
          <p className="text-sm text-slate-600">
            {fr
              ? "Ancien produit retourné → Inspection → Allocation nouvelle variante → Expédition"
              : "Old product returned → Inspection → Allocate new variant → Dispatch"}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/warehouse/dispatch" className="text-sm text-[var(--primary)] hover:underline">
              {fr ? "Créer expédition →" : "Create Dispatch →"}
            </Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline
            events={exc.timeline.map((event) => ({
              time: event.time,
              label: fr ? event.labelFr : event.label,
              done: event.done,
            }))}
          />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}

function ProductExchangeCard({
  fr,
  title,
  product,
  locale,
  accent,
}: {
  fr: boolean;
  title: string;
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
}) {
  const border = accent === "amber" ? "border-amber-200 bg-amber-50/40" : "border-emerald-200 bg-emerald-50/40";

  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <div className="flex gap-4">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-white shadow-sm">
          <Image src={product.image} alt={fr ? product.nameFr : product.name} fill className="object-cover" sizes="96px" />
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/shop/products/${product.productId}`} className="font-medium text-[var(--primary)] hover:underline">
            {fr ? product.nameFr : product.name}
          </Link>
          <p className="mt-1 text-xs text-slate-500">SKU: {product.sku}</p>
          <p className="mt-1 text-sm text-slate-700">{fr ? product.variantFr : product.variant}</p>
          <p className="mt-2 font-semibold text-slate-900">{formatCurrency(product.price, locale)}</p>
        </div>
      </div>
    </div>
  );
}
