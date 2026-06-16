"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { getModerationProduct } from "@/lib/entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function AdminProductModerationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const router = useRouter();
  const product = getModerationProduct(Number(id));
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "changes_requested">(product?.status ?? "pending");
  const [notes, setNotes] = useState("");

  if (!product) {
    return <div className="p-8 text-center text-slate-500">Product not found</div>;
  }

  function updateStatus(newStatus: "approved" | "rejected" | "changes_requested") {
    setStatus(newStatus);
    toast(`Product ${newStatus === "changes_requested" ? "sent back for changes" : newStatus}`);
    if (newStatus === "approved") router.push("/admin/moderation");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={`Submitted ${product.submittedDate} · Status: ${status}`}
        backHref="/admin/products"
        breadcrumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Product Moderation", href: "/admin/products" },
          { label: product.name },
        ]}
        actions={
          status === "pending" ? (
            <>
              <button onClick={() => updateStatus("approved")} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Approve</button>
              <button onClick={() => updateStatus("rejected")} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white">Reject</button>
            </>
          ) : (
            <Badge variant={status === "approved" ? "success" : status === "rejected" ? "danger" : "warning"}>{status}</Badge>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <DetailSection title="Media">
            <div className="relative aspect-square overflow-hidden rounded-lg">
              <Image src={product.image} alt={product.name} fill className="object-cover" />
            </div>
          </DetailSection>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <DetailSection title="Seller Information">
            <InfoGrid items={[
              { label: "Seller", value: <Link href={`/admin/sellers/${product.sellerId}`} className="text-[var(--primary)] hover:underline">{product.seller}</Link> },
              { label: "Store Rating", value: product.sellerRating > 0 ? `⭐ ${product.sellerRating}` : "New seller" },
            ]} />
          </DetailSection>

          <DetailSection title="Product Information">
            <InfoGrid items={[
              { label: "Title", value: product.name, full: true },
              { label: "Description", value: product.description, full: true },
              { label: "Category", value: product.category },
              { label: "Brand", value: product.brand },
            ]} />
          </DetailSection>

          <DetailSection title="Pricing">
            <InfoGrid items={[
              { label: "Price", value: formatCurrency(product.price, locale) },
              { label: "Discount", value: `${product.discount}%` },
            ]} />
          </DetailSection>

          <DetailSection title="Moderation">
            <div className="space-y-4">
              <textarea
                className="w-full rounded-lg border border-blue-200 p-3 text-sm"
                placeholder="Add moderation notes..."
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              {status === "pending" && (
                <div className="flex gap-2">
                  <button onClick={() => updateStatus("approved")} className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white">Approve</button>
                  <button onClick={() => updateStatus("rejected")} className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white">Reject</button>
                  <button onClick={() => updateStatus("changes_requested")} className="rounded-lg border border-blue-200 px-6 py-2 text-sm font-medium text-slate-600">Request Changes</button>
                </div>
              )}
            </div>
          </DetailSection>
        </div>
      </div>
    </div>
  );
}
