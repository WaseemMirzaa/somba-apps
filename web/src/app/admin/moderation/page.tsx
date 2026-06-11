"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { localizedField, statusLabel } from "@/lib/locale-helpers";
import { moderationQueue as initialQueue } from "@/lib/entities";
import { useToast } from "@/context/toast-context";

export default function AdminModerationPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [queue, setQueue] = useState(initialQueue);
  const pending = queue.filter((p) => p.status === "pending");

  function updateStatus(id: number, status: "approved" | "rejected") {
    setQueue((q) => q.map((p) => (p.id === id ? { ...p, status } : p)));
    toast(status === "approved" ? t("productApproved") : t("productRejected"));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("productModeration")}
        subtitle={`${pending.length} ${t("pendingReview")}`}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("moderation") }]}
      />

      <div className="space-y-4">
        {queue.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex gap-4 p-5">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
                <Image src={p.image} alt={localizedField(locale, p.name, p.nameFr)} fill className="object-cover" sizes="80px" />
              </div>
              <div className="flex-1">
                <div className="flex items-start justify-between">
                  <div>
                    <Link href={`/admin/products/${p.id}`} className="font-semibold text-blue-600 hover:underline">{localizedField(locale, p.name, p.nameFr)}</Link>
                    <p className="text-sm text-slate-500">{p.seller} · {p.category}</p>
                  </div>
                  <Badge variant={p.status === "pending" ? "warning" : p.status === "approved" ? "success" : "danger"}>{statusLabel(locale, p.status)}</Badge>
                </div>
                {p.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" onClick={() => updateStatus(p.id, "approved")}>{t("approve")}</Button>
                    <Button variant="danger" size="sm" onClick={() => updateStatus(p.id, "rejected")}>{t("reject")}</Button>
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
