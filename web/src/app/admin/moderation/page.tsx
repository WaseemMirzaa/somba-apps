"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { moderationQueue as initialQueue } from "@/lib/entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

const STATUS_FR: Record<string, string> = { pending: "En attente", approved: "Approuvé", rejected: "Rejeté" };

export default function AdminModerationPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [queue, setQueue] = useState(initialQueue);
  const pending = queue.filter((p) => p.status === "pending");

  function updateStatus(id: number, status: "approved" | "rejected") {
    setQueue((q) => q.map((p) => (p.id === id ? { ...p, status } : p)));
    toast(fr ? `Produit ${status === "approved" ? "approuvé" : "rejeté"}` : `Product ${status}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Modération des produits" : "Product Moderation"} subtitle={fr ? `${pending.length} en attente d'examen` : `${pending.length} pending review`} breadcrumbs={[{ label: fr ? "Admin" : "Admin", href: "/admin" }, { label: fr ? "Modération" : "Moderation" }]} />

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
                    <p className="text-sm text-slate-500">{p.seller} · {p.category}</p>
                  </div>
                  <Badge variant={p.status === "pending" ? "warning" : p.status === "approved" ? "success" : "danger"}>{fr ? (STATUS_FR[p.status] ?? p.status) : p.status}</Badge>
                </div>
                {p.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => updateStatus(p.id, "approved")}>{fr ? "Approuver" : "Approve"}</Button>
                    <Button variant="danger" size="sm" onClick={() => updateStatus(p.id, "rejected")}>{fr ? "Rejeter" : "Reject"}</Button>
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
