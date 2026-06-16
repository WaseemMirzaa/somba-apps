"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Phone, Navigation } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { InfoGrid } from "@/components/ui/info-grid";
import { ActivityTimeline } from "@/components/ui/timeline";
import { getRiderTask } from "@/lib/rider-entities";
import { formatCurrency } from "@/lib/utils";
import { useLocale } from "@/context/locale-context";

const BATCH_STOPS = [
  { seq: 1, taskId: "TSK-8839", status: "completed" as const },
  { seq: 2, taskId: "TSK-8841", status: "current" as const },
  { seq: 3, taskId: "TSK-8842", status: "pending" as const },
];

export default function RiderBatchPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${fr ? "Lot" : "Batch"} ${id}`}
        subtitle={fr ? "Séquence des arrêts" : "Stop sequence"}
        backHref="/rider/tasks"
      />

      <ol className="space-y-4">
        {BATCH_STOPS.map((stop) => {
          const task = getRiderTask(stop.taskId);
          if (!task) return null;

          return (
            <li
              key={stop.seq}
              className={`rounded-xl border p-4 ${
                stop.status === "current" ? "border-emerald-300 bg-emerald-50" : "border-[var(--border)]"
              }`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">
                  #{stop.seq} · {task.address}
                </span>
                <div className="flex gap-2">
                  <Badge variant={stop.status === "completed" ? "success" : stop.status === "current" ? "primary" : "default"}>
                    {fr
                      ? stop.status === "completed"
                        ? "Terminé"
                        : stop.status === "current"
                          ? "En cours"
                          : "En attente"
                      : stop.status}
                  </Badge>
                  <Badge>ETA {task.eta}</Badge>
                </div>
              </div>

              <InfoGrid
                items={[
                  { label: fr ? "Tâche" : "Task", value: task.id },
                  { label: fr ? "Commande" : "Order", value: task.orderId },
                  { label: fr ? "Client" : "Customer", value: task.customer },
                  {
                    label: fr ? "Téléphone" : "Phone",
                    value: (
                      <a
                        href={`tel:${task.phone.replace(/\s/g, "")}`}
                        className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {task.phone}
                      </a>
                    ),
                  },
                  { label: fr ? "Zone" : "Zone", value: task.zone },
                  { label: fr ? "Vendeur" : "Seller", value: `${task.sellerName} · ${task.sellerStore}` },
                  {
                    label: fr ? "Paiement" : "Payment",
                    value: task.codAmount
                      ? `${fr ? "À la livraison" : "At delivery"} · ${formatCurrency(task.codAmount, locale)}`
                      : task.paymentType,
                  },
                ]}
              />

              {task.products.length > 0 && (
                <div className="mt-3 space-y-2">
                  {task.products.slice(0, 2).map((item) => (
                    <div key={item.sku} className="flex items-center gap-3 rounded-lg border border-[var(--border)] p-2">
                      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                        <Image src={item.image} alt={item.name} fill className="object-cover" sizes="40px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-slate-500">{fr ? "Qté" : "Qty"} {item.qty}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(task.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50"
                >
                  <Navigation className="h-3.5 w-3.5" />
                  {fr ? "Naviguer" : "Navigate"}
                </a>
                <Link
                  href={`/rider/tasks/${task.id}`}
                  className="text-xs text-slate-400 hover:text-emerald-600"
                >
                  {fr ? "Actions livraison" : "Delivery actions"} · {task.id}
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
