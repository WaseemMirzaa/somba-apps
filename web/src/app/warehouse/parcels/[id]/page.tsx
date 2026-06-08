"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { Badge } from "@/components/ui/badge";
import { getInboundParcel } from "@/lib/warehouse-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseParcelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLocale();
  const { toast } = useToast();
  const parcel = getInboundParcel(id);

  if (!parcel) {
    return <div className="p-8 text-center text-slate-500">Parcel not found</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={parcel.id}
        subtitle={`Order ${parcel.orderId} · ${parcel.status} · ${parcel.zone}`}
        backHref="/warehouse/inbound"
        breadcrumbs={[
          { label: "Warehouse", href: "/warehouse" },
          { label: "Inbound", href: "/warehouse/inbound" },
          { label: parcel.id },
        ]}
        actions={
          parcel.status === "inbound" ? (
            <button onClick={() => toast("Parcel received")} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">{t("receive")}</button>
          ) : (
            <Badge variant="info">{parcel.status}</Badge>
          )
        }
      />

      <DetailGrid>
        <DetailGridSection title="Parcel Information">
          <InfoGrid items={[
            { label: "Parcel ID", value: parcel.id },
            { label: "Barcode", value: parcel.barcode },
            { label: "Order ID", value: <Link href={`/admin/orders/${parcel.orderId}`} className="text-indigo-600 hover:underline">{parcel.orderId}</Link> },
            { label: "Weight", value: parcel.weight },
            { label: "Volume", value: parcel.volume },
            { label: "Status", value: parcel.status },
            { label: "Arrival Time", value: parcel.arrival },
            { label: "Zone", value: parcel.zone },
          ]} />
        </DetailGridSection>

        <DetailGridSection title="Seller">
          <InfoGrid items={[
            { label: "Seller Name", value: parcel.seller },
            { label: "Store Name", value: parcel.storeName },
            { label: "Phone", value: parcel.sellerPhone },
            { label: "Pickup Rider", value: parcel.pickupRider },
          ]} />
          <div className="mt-4 flex gap-3">
            <Link href={`/admin/sellers/${parcel.sellerId}`} className="text-sm text-indigo-600 hover:underline">Open Seller →</Link>
            <a href={`tel:${parcel.sellerPhone}`} className="text-sm text-slate-500">Call Seller</a>
          </div>
        </DetailGridSection>

        <DetailGridSection title="Customer">
          <InfoGrid items={[
            { label: "Customer Name", value: parcel.customer },
            { label: "Phone", value: parcel.customerPhone },
            { label: "Address", value: parcel.customerAddress, full: true },
            { label: "Delivery Zone", value: parcel.zone },
          ]} />
          <div className="mt-4 flex gap-3">
            <Link href={`/admin/orders/${parcel.orderId}`} className="text-sm text-indigo-600 hover:underline">Open Order →</Link>
            <Link href={`/admin/customers/${parcel.customerId}`} className="text-sm text-indigo-600 hover:underline">Open Customer →</Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title="Inspection">
          <InfoGrid items={[
            { label: "Condition", value: parcel.inspectionDetail.condition },
            { label: "Photos", value: `${parcel.inspectionDetail.photos} uploaded` },
            { label: "Damage Notes", value: parcel.inspectionDetail.damageNotes || "None", full: true },
            { label: "Exceptions", value: parcel.inspectionDetail.exceptions },
          ]} />
          <div className="mt-4 flex gap-2">
            <button onClick={() => toast("Parcel accepted")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white">Accept</button>
            <button onClick={() => toast("Parcel rejected")} className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white">Reject</button>
            <Link href="/warehouse/exceptions" className="rounded-lg border border-amber-200 px-4 py-2 text-sm text-amber-700">Create Incident</Link>
          </div>
        </DetailGridSection>

        <DetailGridSection title="Items" span={2}>
          <div className="space-y-4">
            {parcel.itemsWithImages.map((item) => (
              <div key={item.sku} className="flex items-center gap-4 rounded-lg border border-[var(--border)] p-3">
                <div className="relative h-14 w-14 overflow-hidden rounded-lg">
                  <Image src={item.image} alt={item.product} fill className="object-cover" sizes="56px" />
                </div>
                <div className="flex-1">
                  <Link href={`/shop/products/${item.productId}`} className="font-medium text-indigo-600 hover:underline">{item.product}</Link>
                  <p className="text-xs text-slate-500">SKU: {item.sku} · {item.variant}</p>
                </div>
                <span className="text-sm font-medium">Qty: {item.qty}</span>
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title="Timeline" span={3}>
          <ActivityTimeline events={[
            ...parcel.timeline,
            { time: "—", label: "Dispatched", done: parcel.status === "dispatched" },
            { time: "—", label: "Delivered", done: false },
          ]} />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
