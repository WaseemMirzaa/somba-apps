"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Phone, Navigation, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { getRiderTask, riderBatches } from "@/lib/rider-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { statusLabel } from "@/lib/locale-helpers";

export default function RiderTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale, t } = useLocale();
  const task = getRiderTask(id);
  const [delivered, setDelivered] = useState(task?.status === "delivered");

  if (!task) {
    return <div className="text-center text-slate-500">{t("notFound")}</div>;
  }

  const status = delivered ? "delivered" : task.status;
  const batch = riderBatches.find((b) => b.stops.some((s) => s.taskId === task.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title={task.id}
        subtitle={`${task.type} · ${statusLabel(locale, status)}`}
        backHref="/rider/tasks"
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="primary">{task.type}</Badge>
        <Badge variant={delivered ? "success" : "warning"}>ETA {task.eta}</Badge>
        <Badge>{task.distance}</Badge>
      </div>

      <DetailSection title={t("customer")}>
        <InfoGrid items={[
          { label: t("name"), value: task.customer },
          { label: t("phone"), value: task.phone },
          { label: t("address"), value: task.address, full: true },
          { label: t("order"), value: <Link href={`/shop/orders/${task.orderId}/tracking`} className="text-emerald-600 hover:underline">{task.orderId}</Link> },
          ...(batch ? [{ label: t("batch"), value: <Link href={`/rider/batches/${batch.id}`} className="text-emerald-600 hover:underline">{batch.id}</Link> }] : []),
        ]} />
      </DetailSection>

      {task.codAmount && (
        <div className="card-premium border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-medium text-emerald-800">{t("codCollection")}</p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-emerald-700">
            {formatCurrency(task.codAmount, locale)}
          </p>
        </div>
      )}

      {task.notes && (
        <div className="card-premium p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">{t("notes")}</p>
          <p className="mt-1 text-sm text-slate-700">{task.notes}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <a href={`tel:${task.phone.replace(/\s/g, "")}`} className="contents">
          <Button variant="secondary" className="w-full">
            <Phone className="h-4 w-4" />
            {t("call")}
          </Button>
        </a>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(task.address)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="contents"
        >
          <Button variant="secondary" className="w-full">
            <Navigation className="h-4 w-4" />
            {t("navigate")}
          </Button>
        </a>
      </div>

      {!delivered && (
        <div className="flex flex-col gap-2">
          <Link href={`/rider/tasks/${id}/pod`} className="btn-primary flex w-full items-center justify-center gap-2 py-3">
            <CheckCircle className="h-4 w-4" />
            {t("proofOfDelivery")}
          </Link>
          <Link href={`/rider/tasks/${id}/fail`} className="rounded-xl border border-red-200 py-2 text-center text-sm text-red-600">
            {t("failedDelivery")}
          </Link>
        </div>
      )}
    </div>
  );
}
