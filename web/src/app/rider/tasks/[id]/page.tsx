"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { MapPin, Phone, Navigation, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { getRiderTask } from "@/lib/rider-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function RiderTaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const { toast } = useToast();
  const task = getRiderTask(id);
  const [delivered, setDelivered] = useState(task?.status === "delivered");

  if (!task) {
    return <div className="text-center text-slate-500">Task not found</div>;
  }

  const status = delivered ? "delivered" : task.status;

  return (
    <div className="space-y-6">
      <PageHeader
        title={task.id}
        subtitle={`${task.type} · ${status.replace("_", " ")}`}
        backHref="/rider/tasks"
      />

      <div className="flex flex-wrap gap-2">
        <Badge variant="primary">{task.type}</Badge>
        <Badge variant={delivered ? "success" : "warning"}>ETA {task.eta}</Badge>
        <Badge>{task.distance}</Badge>
      </div>

      <DetailSection title="Customer">
        <InfoGrid items={[
          { label: "Name", value: task.customer },
          { label: "Phone", value: task.phone },
          { label: "Address", value: task.address, full: true },
          { label: "Order", value: task.orderId },
        ]} />
      </DetailSection>

      {task.codAmount && (
        <div className="card-premium border-emerald-200 bg-emerald-50/50 p-4">
          <p className="text-sm font-medium text-emerald-800">COD Collection</p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-emerald-700">
            {formatCurrency(task.codAmount, locale)}
          </p>
        </div>
      )}

      {task.notes && (
        <div className="card-premium p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Notes</p>
          <p className="mt-1 text-sm text-slate-700">{task.notes}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <a href={`tel:${task.phone.replace(/\s/g, "")}`} className="contents">
          <Button variant="secondary" className="w-full">
            <Phone className="h-4 w-4" />
            Call
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
            Navigate
          </Button>
        </a>
      </div>

      {!delivered && (
        <div className="flex flex-col gap-2">
          <Link href={`/rider/tasks/${id}/pod`} className="btn-primary flex w-full items-center justify-center gap-2 py-3">
            <CheckCircle className="h-4 w-4" />
            {locale === "fr" ? "Preuve de livraison" : "Proof of Delivery"}
          </Link>
          <Link href={`/rider/tasks/${id}/fail`} className="rounded-xl border border-red-200 py-2 text-center text-sm text-red-600">
            {locale === "fr" ? "Échec livraison" : "Failed Delivery"}
          </Link>
        </div>
      )}
    </div>
  );
}
