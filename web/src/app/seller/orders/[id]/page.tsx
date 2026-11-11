"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/seller/product-image";
import { useSellerAccess, useSellerData } from "@/lib/seller";
import { buildJourney, shippingStep, shippingStepLabel, useSellerShipments } from "@/lib/seller-orders";
import { ShipmentDetailGrid } from "@/components/seller/shipment-detail-grid";
import { NavLinkButton } from "@/components/ui/nav-link-button";
import {
  errMessage,
  lineStateLabel,
  lineStateVariant,
  orderStatusLabel,
  orderStatusVariant,
  packageStatusLabel,
  packageStatusVariant,
  paymentMethodLabel,
  txnStatusLabel,
} from "@/lib/seller-labels";
import { canMarkReady, cancellableLines, waitingForOtherSellers } from "@/lib/seller-packages";
import { CancelItemsDialog } from "@/components/seller/cancel-items-dialog";
import { formatCurrency } from "@/lib/utils";
import { dayLabel } from "@/lib/delivery-estimate";
import { ExpressBadge, PartialDelivery } from "@/components/shop/partial-delivery";
import type { TrackingLegView } from "@/lib/realtime/types";
import { MissingRecord } from "@/components/seller/data-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { BoxCountStepper } from "@/components/seller/box-count-stepper";
import { BOXES_LOCKED_COPY, boxesPhrase, labelsReadyToast, type ParcelLabelPack } from "@/lib/parcel-labels";

export default function SellerOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { getSellerOrder, sellerReady, sellerLabels, sellerBoxes, load } = useSellerData();
  const { getByOrder } = useSellerShipments();
  const access = useSellerAccess();
  const order = getSellerOrder(id);
  const shipment = order ? getByOrder(order.id) : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  // Boxes: the count chosen with "Package ready", then the pack the server holds once it is ready (count, lock).
  const [boxes, setBoxes] = useState(1);
  const [pack, setPack] = useState<ParcelLabelPack | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const [newBoxes, setNewBoxes] = useState<number | null>(null);
  const [savingBoxes, setSavingBoxes] = useState(false);

  const orderId = order?.orderId;
  const readyNow = order?.packageStatus === "ready" || order?.packageStatus === "at_hub";
  // The labels are read once the package is ready; a failure shows Retry (which also toasts: it is the seller's action).
  const [attempt, setAttempt] = useState(0);
  const userRetry = useRef(false);
  const api = useRef({ sellerLabels, toast });
  useEffect(() => {
    api.current = { sellerLabels, toast };
  });
  useEffect(() => {
    if (!readyNow || !orderId || pack) return;
    let live = true;
    api.current.sellerLabels(orderId).then(
      (p) => {
        if (!live) return;
        setPack(p);
        setNewBoxes(null);
      },
      (e) => {
        if (!live) return;
        const msg = errMessage(e);
        setPackError(msg);
        if (userRetry.current) api.current.toast(msg, "error");
        userRetry.current = false;
      },
    );
    return () => {
      live = false;
    };
  }, [readyNow, orderId, pack, attempt]);
  function retryPack() {
    userRetry.current = true;
    setPackError(null);
    setAttempt((n) => n + 1);
  }

  if (!order) return <MissingRecord load={load} label="Order not found" labelFr="Commande introuvable" />;

  // Everything below comes from the server's state (package status + each line's fulfilment).
  const pkg = { status: order.orderStatus, packageStatus: order.packageStatus, items: order.items_detail };
  const showReady = canMarkReady(pkg);
  const cancellable = cancellableLines(pkg);
  const isReady = order.packageStatus === "ready" || order.packageStatus === "at_hub";
  const shared = order.sellerCount > 1;
  const waiting = waitingForOtherSellers(order) && order.orderStatus !== "processing";
  const otherSellers = order.sellerCount - 1;
  const step = shippingStep({ orderStatus: order.orderStatus, packageStatus: order.packageStatus, tracking: order.tracking });

  async function markReady() {
    if (!order) return;
    setBusy(true);
    setError(null);
    try {
      const made = await sellerReady(order.orderId, boxes);
      if (made) {
        setPack(made);
        setNewBoxes(null);
      }
      // Others still packing (the server's count; unknown on old payloads → assume yes).
      const othersStillPacking = shared && (order.otherSellersPacking ?? 1) > 0;
      const readyMsg = othersStillPacking
        ? (fr ? "Colis marqué prêt : le livreur passera quand tous les vendeurs seront prêts" : "Package marked ready: the rider comes once every seller is ready")
        : (fr ? "Colis marqué prêt : le livreur est prévenu" : "Package marked ready: the rider can collect it");
      toast(made ? `${labelsReadyToast(made.boxCount, fr)}. ${readyMsg}` : readyMsg);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveBoxes() {
    if (!order || newBoxes == null) return;
    setSavingBoxes(true);
    try {
      const p = await sellerBoxes(order.orderId, newBoxes);
      setPack(p);
      setNewBoxes(null);
      toast(fr ? `${labelsReadyToast(p.boxCount, true)}. Les anciennes étiquettes ne sont plus valables : imprimez les nouvelles.` : `${labelsReadyToast(p.boxCount, false)}. The old labels are void: print the new ones.`);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setSavingBoxes(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={order.id}
        subtitle={`${order.customer} · ${packageStatusLabel(order.packageStatus, fr)}`}
        backHref="/seller/orders"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {showReady && (
              <div className="flex items-center gap-2">
                <label htmlFor="box-count" className="text-sm text-slate-700">{fr ? "Colis (boîtes) dans cet envoi" : "Boxes in this package"}</label>
                <BoxCountStepper id="box-count" value={boxes} onChange={setBoxes} disabled={busy || access.suspended} fr={fr} />
              </div>
            )}
            {showReady && (
              <button type="button" disabled={busy || access.suspended} onClick={() => void markReady()} className="btn-primary rounded-lg px-4 py-2 text-sm disabled:opacity-50">
                {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Confirmer colis prêt" : "Package Ready"}
              </button>
            )}
            {isReady && !waiting && (
              <span className="text-sm text-emerald-600">{order.packageStatus === "at_hub" ? (fr ? "Reçu au hub" : "Received at the hub") : fr ? "Marqué prêt pour enlèvement" : "Marked ready for pickup"}</span>
            )}
            {waiting && (
              <span className="text-sm text-amber-600">{fr ? "En attente des autres vendeurs" : "Waiting for the other sellers"}</span>
            )}
            {cancellable.length > 0 && !access.suspended && (
              <button type="button" onClick={() => setCancelOpen(true)} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50">
                {fr ? "Annuler des articles" : "Cancel items"}
              </button>
            )}
            <Link href="/seller/support" className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700">
              {fr ? "Contacter le support à propos de cette commande" : "Contact support about this order"}
            </Link>
          </div>
        }
      />

      {order.deliveryMode === "express" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700" data-testid="express-order">
          <ExpressBadge fr={fr} />
          <span>
            {fr
              ? "Un livreur vient chercher ce colis chez vous et le livre directement au client, sans passer par un entrepôt. Marquez « colis prêt » pour l'appeler."
              : "A rider collects this parcel from you and takes it straight to the customer, with no warehouse in between. Mark “package ready” to call the rider."}
          </span>
        </div>
      )}

      <PartialDelivery
        order={{ status: order.orderStatus }}
        lines={order.items_detail.map((it) => ({ id: it.itemId, name: it.name, qty: it.qty, fulfilment: it.fulfilment, deliveredAt: it.deliveredAt }))}
        legs={order.tracking?.legs as unknown as TrackingLegView[] | undefined}
        partial={order.packageStatus === "delivered" && order.orderStatus !== "delivered" && order.orderStatus !== "cancelled" && order.orderStatus !== "returned"}
        fr={fr}
        audience="seller"
      />

      {shared && (
        <p role="note" className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {fr
            ? `Cette commande contient aussi des articles de ${otherSellers} autre${otherSellers > 1 ? "s" : ""} vendeur${otherSellers > 1 ? "s" : ""}. Vous ne voyez et ne préparez que vos articles ; le colis part quand tous les vendeurs sont prêts.`
            : `This order also contains items from ${otherSellers} other seller${otherSellers > 1 ? "s" : ""}. You only see and pack your items; the parcel leaves once every seller is ready.`}
        </p>
      )}

      {access.suspended && (
        <p role="note" className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {fr
            ? "Votre boutique est suspendue : vous pouvez consulter cette commande mais pas la modifier."
            : "Your store is suspended: you can view this order but not change it."}
        </p>
      )}

      {isReady && (
        <section className="card-premium space-y-3 p-4" data-testid="parcel-labels" aria-label={fr ? "Étiquettes du colis" : "Parcel labels"}>
          <h2 className="text-sm font-semibold text-slate-900">{fr ? "Étiquettes du colis" : "Parcel labels"}</h2>
          {packError && !pack ? (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-red-700">{packError}</p>
              <button type="button" onClick={retryPack} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700">{fr ? "Réessayer" : "Retry"}</button>
            </div>
          ) : !pack ? (
            <p className="text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                {fr ? "Boîtes dans cet envoi :" : "Boxes in this package:"} <strong>{boxesPhrase(pack.boxCount, fr)}</strong>
                {" · "}{fr ? "Collez une étiquette KOMORIKO sur chaque boîte : le livreur la scanne à la collecte." : "Stick one KOMORIKO label on each box: the rider scans it at pick-up."}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor="box-count-change" className="text-sm text-slate-700">{fr ? "Modifier" : "Change"}</label>
                <BoxCountStepper id="box-count-change" value={newBoxes ?? pack.boxCount} onChange={setNewBoxes} disabled={pack.locked || savingBoxes || access.suspended} fr={fr} />
                <button
                  type="button"
                  onClick={() => void saveBoxes()}
                  disabled={pack.locked || savingBoxes || access.suspended || newBoxes == null || newBoxes === pack.boxCount}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
                >
                  {savingBoxes ? (fr ? "Envoi…" : "Saving…") : fr ? "Enregistrer" : "Save"}
                </button>
                <Link href={`/seller/orders/${encodeURIComponent(order.orderId)}/labels`} className="btn-primary rounded-lg px-4 py-2 text-sm">
                  {fr ? "Imprimer les étiquettes" : "Print labels"}
                </Link>
              </div>
              {pack.locked && <p role="note" className="text-xs text-amber-700">{fr ? BOXES_LOCKED_COPY.fr : BOXES_LOCKED_COPY.en}</p>}
            </>
          )}
        </section>
      )}

      {error && <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

      <DetailGrid>
        <DetailGridSection title={fr ? "Résumé de la commande" : "Order Summary"}>
          <InfoGrid items={[
            { label: fr ? "Numéro de commande" : "Order Number", value: order.id },
            { label: fr ? "Date de commande" : "Order Date", value: order.date },
            { label: fr ? "Votre colis" : "Your package", value: <Badge variant={packageStatusVariant(order.packageStatus)}>{packageStatusLabel(order.packageStatus, fr)}</Badge> },
            { label: fr ? "Statut de commande" : "Order Status", value: <Badge variant={orderStatusVariant(order.orderStatus)}>{orderStatusLabel(order.orderStatus, fr)}</Badge> },
            { label: fr ? "Expédition" : "Shipping", value: shippingStepLabel(step, fr) },
            ...(order.deliveryMode === "express" ? [{ label: fr ? "Mode de livraison" : "Delivery mode", value: <ExpressBadge fr={fr} /> }] : []),
            { label: fr ? "À livrer avant le" : "Deliver by", value: dayLabel(order.estimatedDeliveryDate, fr) ?? "—" },
            ...(shared ? [{ label: fr ? "Vendeurs" : "Sellers", value: fr ? `Commande partagée · ${order.sellerCount} vendeurs` : `Shared order · ${order.sellerCount} sellers` }] : []),
            { label: fr ? "Montant (vos articles)" : "Amount (your items)", value: formatCurrency(order.amount, locale) },
            ...(order.refunded > 0 ? [{ label: fr ? "Remboursé au client" : "Refunded to customer", value: formatCurrency(order.refunded, locale) }] : []),
          ]} />
        </DetailGridSection>

        <DetailGridSection title={t("customer")}>
          {/* Privacy: sellers see first name + destination city only. Delivery is
              handled by KOMORIKO logistics — no phone, email, or street address. */}
          <InfoGrid items={[
            { label: fr ? "Prénom" : "First Name", value: order.customer },
            { label: fr ? "Ville de destination" : "Destination City", value: order.customerCity },
          ]} />
          <p className="mt-4 text-xs text-slate-500">
            {fr
              ? "Livraison gérée par la logistique KOMORIKO. Les coordonnées du client sont privées."
              : "Delivery handled by KOMORIKO logistics. Customer contact details are private."}
          </p>
          <div className="mt-3 flex gap-3">
            <NavLinkButton href="/seller/support">{fr ? "Ouvrir le support" : "Open Support"}</NavLinkButton>
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Paiement" : "Payment"}>
          <InfoGrid items={[
            { label: fr ? "Mode de paiement" : "Payment Method", value: paymentMethodLabel(order.paymentMethod, fr) },
            { label: fr ? "Statut" : "Status", value: txnStatusLabel(order.paymentStatus, fr) },
            {
              label: fr ? "Commission" : "Commission",
              value: `${formatCurrency(order.commission, locale)}${order.commissionRate === "mixed" ? (fr ? " (taux variés)" : " (mixed rates)") : typeof order.commissionRate === "number" ? ` (${order.commissionRate}%)` : ""}`,
            },
            { label: fr ? "Gains nets" : "Net Earnings", value: formatCurrency(order.netEarnings, locale) },
          ]} />
        </DetailGridSection>
      </DetailGrid>

      {shipment ? (
        <ShipmentDetailGrid shipment={shipment} locale={locale} variant="embedded" showOrderLink={false} />
      ) : (
        <DetailGrid>
          <DetailGridSection title={fr ? "Expédition" : "Shipping"} span={3}>
            <p className="text-sm text-slate-600">
              {order.orderStatus === "cancelled" || order.orderStatus === "returned"
                ? (fr ? "Cette commande n'est plus expédiée." : "This order is no longer being shipped.")
                : fr
                  ? "L'expédition démarre dès que la commande est confirmée."
                  : "Shipping starts as soon as the order is confirmed."}
            </p>
          </DetailGridSection>
        </DetailGrid>
      )}

      <DetailGrid>
        <DetailGridSection title={fr ? "Articles" : "Items"} span={3}>
          {order.items_detail.map((item) => {
            const cancelled = item.state === "cancelled";
            return (
              <div key={item.itemId} className="mb-4 flex gap-4 last:mb-0">
                <div className={`h-14 w-14 overflow-hidden rounded-lg ${cancelled ? "opacity-50" : ""}`}>
                  <ProductImage src={item.image} alt={item.name} />
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/seller/products/${item.productId}`} className={`font-medium text-[var(--primary)] hover:underline ${cancelled ? "line-through opacity-70" : ""}`}>{item.name}</Link>
                    <Badge variant={lineStateVariant(item.state)}>{lineStateLabel(item.state, fr)}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">{item.variant ? `${item.variant} · ` : ""}{item.sku}</p>
                  {!cancelled && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {fr ? "Commission" : "Commission"}: {formatCurrency(item.commissionUsd, locale)}
                      {typeof item.commissionPct === "number" ? ` (${item.commissionPct}%)` : ""}
                      {item.couponDiscountUsd > 0 && ` · ${fr ? "Coupon boutique" : "Store coupon"}: −${formatCurrency(item.couponDiscountUsd, locale)}`}
                    </p>
                  )}
                  {cancelled && (
                    <p className="mt-1 text-xs text-red-700">
                      {fr ? "Motif" : "Reason"}: {item.cancelReason || "—"}
                      {item.refundedUsd > 0 && ` · ${fr ? "Remboursé" : "Refunded"} ${formatCurrency(item.refundedUsd, locale)}`}
                    </p>
                  )}
                </div>
                <div className={`text-right ${cancelled ? "line-through opacity-60" : ""}`}>
                  <p>{formatCurrency(item.price, locale)}</p>
                  <p className="text-xs">{fr ? "Qté" : "Qty"}: {item.qty}</p>
                </div>
              </div>
            );
          })}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline
            events={buildJourney(
              { orderStatus: order.orderStatus, packageStatus: order.packageStatus, tracking: order.tracking, createdAt: order.createdAt, readyAt: order.readyAt },
              fr,
            )}
          />
        </DetailGridSection>
      </DetailGrid>
      {cancelOpen && (
        <CancelItemsDialog
          orderId={order.orderId}
          lines={cancellable.map((l) => ({ itemId: l.itemId, name: l.name, variant: l.variant, qty: l.qty, price: l.price }))}
          onClose={() => setCancelOpen(false)}
        />
      )}
    </div>
  );
}
