"use client";

import Link from "next/link";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { ProductImage } from "@/components/seller/product-image";
import { formatCurrency } from "@/lib/utils";
import { customerColumnLabel } from "@/lib/admin-i18n";
import { localDateTime } from "@/lib/dates";
import {
  buildJourney,
  legKindLabel,
  legStatusLabel,
  legStatusVariant,
  shippingStepLabel,
  shippingStepVariant,
  type Shipment,
} from "@/lib/seller-orders";

type ShipmentDetailGridProps = {
  shipment: Shipment;
  locale: "en" | "fr";
  showOrderLink?: boolean;
  /** full = all sections; embedded = omit order/customer/products/timeline (for order detail page) */
  variant?: "full" | "embedded";
};

const when = (iso: string | null | undefined) => (iso ? localDateTime(iso) : "—");

/**
 * Shipment view built ONLY from facts the server gave the seller: the order status, the delivery legs it created
 * (pickup rider, transfer between warehouses, delivery), the moment the seller marked the package ready and the
 * seller's own pickup address. No invented hubs, riders or phones; riders are shown by first name only.
 */
export function ShipmentDetailGrid({ shipment, locale, showOrderLink = true, variant = "full" }: ShipmentDetailGridProps) {
  const fr = locale === "fr";
  const embedded = variant === "embedded";
  const status = <Badge variant={shippingStepVariant(shipment.status)}>{shippingStepLabel(shipment.status, fr)}</Badge>;
  const orderLink = showOrderLink ? (
    <Link href={`/seller/orders/${shipment.orderId}`} className="text-[var(--primary)] hover:underline">
      {shipment.orderId}
    </Link>
  ) : (
    shipment.orderId
  );
  const pickup = shipment.legs.filter((l) => l.kind === "pickup").at(-1);

  return (
    <DetailGrid>
      <DetailGridSection title={fr ? "Aperçu expédition" : "Shipment Overview"}>
        <InfoGrid
          items={[
            { label: fr ? "N° expédition" : "Shipment ID", value: shipment.id },
            { label: fr ? "Commande" : "Order ID", value: orderLink },
            { label: fr ? "Statut" : "Status", value: status },
            { label: fr ? "Créée le" : "Created", value: shipment.createdDate },
            { label: fr ? "Transporteur" : "Carrier", value: shipment.carrier },
            {
              label: fr ? "Étape en cours" : "Current leg",
              value: shipment.currentLeg ? legKindLabel(shipment.currentLeg, fr) : "—",
            },
            { label: fr ? "Dernière mise à jour" : "Last update", value: when(shipment.lastUpdateAt) },
          ]}
        />
      </DetailGridSection>

      <DetailGridSection title={fr ? "Enlèvement" : "Pickup"}>
        <InfoGrid
          items={[
            {
              label: fr ? "Livreur d'enlèvement" : "Pickup rider",
              value: pickup?.riderFirstName ?? (fr ? "Pas encore assigné" : "Not assigned yet"),
            },
            {
              label: fr ? "Colis prêt" : "Package ready",
              value: shipment.readyAt ? localDateTime(shipment.readyAt) : fr ? "Pas encore marqué prêt" : "Not marked ready yet",
            },
            { label: fr ? "Collecté chez vous" : "Picked up from you", value: when(pickup?.pickedUpAt) },
            { label: fr ? "Arrivé à l'entrepôt" : "At the warehouse", value: when(pickup?.receivedAt ?? pickup?.deliveredAt) },
            {
              label: fr ? "Adresse de collecte" : "Pickup address",
              value: shipment.pickupAddress || (
                <Link href="/seller/storefront" className="text-amber-700 hover:underline">
                  {fr ? "Non renseignée : à ajouter dans la boutique" : "Not set: add it in Storefront"}
                </Link>
              ),
              full: true,
            },
          ]}
        />
      </DetailGridSection>

      {!embedded && (
        <DetailGridSection title={fr ? "Commande & client" : "Order & Customer"}>
          <InfoGrid
            items={[
              { label: fr ? "N° commande" : "Order ID", value: orderLink },
              { label: customerColumnLabel(locale), value: shipment.customer.name },
              { label: fr ? "Ville de destination" : "Destination City", value: shipment.customer.city },
              {
                label: fr ? "Livraison" : "Delivery",
                value: fr ? "Gérée par la logistique Somba&Teka" : "Handled by Somba&Teka logistics",
                full: true,
              },
            ]}
          />
        </DetailGridSection>
      )}

      <DetailGridSection title={fr ? "Étapes de livraison" : "Delivery legs"} span={3}>
        {shipment.legs.length === 0 ? (
          <p className="text-sm text-slate-600">
            {fr ? "Aucune étape de livraison n'a encore été créée pour cette commande." : "No delivery leg has been created for this order yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3 font-semibold">{fr ? "Étape" : "Leg"}</th>
                  <th className="py-2 pr-3 font-semibold">{fr ? "Statut" : "Status"}</th>
                  <th className="py-2 pr-3 font-semibold">{fr ? "Livreur" : "Rider"}</th>
                  <th className="py-2 pr-3 font-semibold">{fr ? "Collecté" : "Picked up"}</th>
                  <th className="py-2 pr-3 font-semibold">{fr ? "Terminé" : "Completed"}</th>
                  <th className="py-2 font-semibold">{fr ? "Tentatives" : "Attempts"}</th>
                </tr>
              </thead>
              <tbody>
                {[...shipment.legs]
                  .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                  .map((leg) => (
                    <tr key={leg.id} className="border-b border-[var(--border)] last:border-0 align-top">
                      <td className="py-2 pr-3 font-medium text-slate-900">{legKindLabel(leg.kind, fr)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={legStatusVariant(leg.status)}>{legStatusLabel(leg.status, fr)}</Badge>
                      </td>
                      <td className="py-2 pr-3">{leg.riderFirstName ?? "—"}</td>
                      <td className="py-2 pr-3">{when(leg.pickedUpAt)}</td>
                      <td className="py-2 pr-3">{when(leg.receivedAt ?? leg.deliveredAt)}</td>
                      <td className="py-2">
                        {leg.attempts}
                        {leg.failureReason && (
                          <p className="mt-0.5 text-xs text-red-700">
                            {fr ? "Dernier échec" : "Last failure"}: {leg.failureReason}
                          </p>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {shipment.status === "ready" && (
          <p className="mt-3 text-xs text-slate-500">
            {fr ? "Le livreur d'enlèvement est assigné par l'entrepôt qui couvre votre zone." : "The warehouse covering your area assigns the pickup rider."}
          </p>
        )}
      </DetailGridSection>

      {!embedded && (
        <DetailGridSection title={fr ? "Produits" : "Products"} span={2}>
          <div className="space-y-2">
            {shipment.products.map((item) => (
              <div key={`${item.itemId}`} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg">
                  <ProductImage src={item.image} alt={item.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <Link href={`/seller/products/${item.productId}`} className="truncate text-sm font-medium text-[var(--primary)] hover:underline">
                    {item.name}
                  </Link>
                  <p className="text-xs text-slate-500">
                    SKU: {item.sku} · {fr ? "Qté" : "Qty"} {item.qty}
                  </p>
                </div>
                <p className="text-sm font-medium text-slate-900">{formatCurrency(item.price, locale)}</p>
              </div>
            ))}
          </div>
        </DetailGridSection>
      )}

      {!embedded && (
        <DetailGridSection title={fr ? "Chronologie" : "Timeline"} span={3}>
          <ActivityTimeline
            events={buildJourney(
              { orderStatus: shipment.orderStatus, packageStatus: shipment.packageStatus, tracking: shipment.tracking, createdAt: shipment.createdAt, readyAt: shipment.readyAt },
              fr,
            )}
          />
        </DetailGridSection>
      )}
    </DetailGrid>
  );
}
