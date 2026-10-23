"use client";

import Link from "next/link";
import Image from "next/image";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductStatusActions } from "@/components/admin/status-actions";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { useAdminData } from "@/lib/admin";
import { useLocale } from "@/context/locale-context";

const STATUS_FR: Record<string, string> = { pending: "En attente", live: "En ligne", rejected: "Rejeté", removed: "Bloqué", draft: "Brouillon" };
const CATEGORY_FR: Record<string, string> = {
  Electronics: "Électronique",
  Fashion: "Mode",
  "Home & Living": "Maison & Décoration",
  Beauty: "Beauté",
  Grocery: "Épicerie",
};

export default function AdminModerationPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { moderationQueue, loading, error } = useAdminData();
  // Live list: rows update from the `product:updated` push after each decision.
  const queue = moderationQueue;
  const pending = queue.filter((p) => p.status === "pending");

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Modération des produits" : "Product Moderation"} subtitle={fr ? `${pending.length} en attente d'examen` : `${pending.length} pending review`} breadcrumbs={[{ label: fr ? "Admin" : "Admin", href: "/admin" }, { label: fr ? "Modération" : "Moderation" }]} />

      {error && <SectionError message={error} />}
      {loading && !error && <SectionLoading />}
      {!loading && !error && queue.length === 0 && <EmptyState>{fr ? "Aucun produit." : "No products."}</EmptyState>}

      <div className="space-y-4">
        {queue.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex gap-4 p-5">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                <Image src={p.image} alt={p.name} fill className="object-cover" sizes="80px" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/admin/products/${p.id}`} className="font-semibold text-[var(--primary)] hover:underline">{p.name}</Link>
                    <p className="text-sm text-slate-500">{p.seller} · {fr ? (CATEGORY_FR[p.category] ?? p.category) : p.category}</p>
                  </div>
                  <Badge variant={p.status === "pending" ? "warning" : p.status === "live" ? "success" : p.status === "draft" ? "default" : "danger"}>{fr ? (STATUS_FR[p.status] ?? p.status) : p.status}</Badge>
                </div>
                {p.status === "pending" && (
                  <div className="mt-3">
                    <ProductStatusActions productId={p.id} status="pending" name={p.name} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
