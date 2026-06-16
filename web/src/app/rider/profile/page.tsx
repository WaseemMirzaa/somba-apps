"use client";

import { useState } from "react";
import Link from "next/link";
import { Phone } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { ActiveDeliveryCard } from "@/components/delivery/active-delivery-card";
import { riderProfile, getActiveRiderTasks } from "@/lib/rider-entities";
import { riderTaskToDeliveryDetail } from "@/lib/delivery-detail";
import { useLocale } from "@/context/locale-context";

export default function RiderProfilePage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [onDuty, setOnDuty] = useState(true);
  const activeTasks = getActiveRiderTasks();

  return (
    <div className="space-y-6">
      <PageHeader title={t("myAccount")} />

      <div className="card-premium p-6 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-2xl font-bold text-white">
          {riderProfile.name.split(" ").map((n) => n[0]).join("")}
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">{riderProfile.name}</h2>
        <p className="text-sm text-slate-500">{riderProfile.id}</p>
        <div className="mt-3 flex justify-center gap-2">
          <Badge variant={onDuty ? "success" : "warning"}>{onDuty ? (fr ? "En ligne" : "Online") : (fr ? "Hors ligne" : "Offline")}</Badge>
          <Badge variant="primary">⭐ {riderProfile.rating}</Badge>
        </div>
        <label className="mt-4 flex items-center justify-center gap-2 text-sm">
          <input type="checkbox" checked={onDuty} onChange={(e) => setOnDuty(e.target.checked)} />
          {fr ? "Disponibilité (RF-04)" : "Availability toggle (RF-04)"}
        </label>
      </div>

      <DetailSection title={fr ? "Livraisons actives" : "Current Deliveries"}>
        {activeTasks.length === 0 ? (
          <p className="text-sm text-slate-500">{fr ? "Aucune livraison active." : "No active deliveries."}</p>
        ) : (
          <div className="space-y-3">
            {activeTasks.map((task) => (
              <ActiveDeliveryCard
                key={task.id}
                delivery={riderTaskToDeliveryDetail(task)}
                locale={locale}
                alwaysExpanded
                linkClass="text-emerald-600"
              />
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title={fr ? "Liens rapides" : "Quick Links"}>
        <div className="flex flex-wrap gap-2">
          <Link href="/rider/cod/summary" className="text-sm text-emerald-600 hover:underline">
            {fr ? "Résumé paiements" : "Payment Shift Summary"}
          </Link>
          <Link href="/rider/history" className="text-sm text-emerald-600 hover:underline">
            {fr ? "Historique" : "Task History"}
          </Link>
          <Link href="/rider/notifications" className="text-sm text-emerald-600 hover:underline">
            {fr ? "Notifications" : "Notifications"}
          </Link>
        </div>
      </DetailSection>

      <DetailSection title={fr ? "Profil" : "Profile"}>
        <InfoGrid items={[
          {
            label: fr ? "Téléphone" : "Phone",
            value: (
              <a
                href={`tel:${riderProfile.phone.replace(/\s/g, "")}`}
                className="inline-flex items-center gap-1 text-emerald-600 hover:underline"
              >
                <Phone className="h-3.5 w-3.5" />
                {riderProfile.phone}
              </a>
            ),
          },
          { label: fr ? "Véhicule" : "Vehicle", value: fr ? riderProfile.vehicleFr : riderProfile.vehicle },
          { label: t("zone"), value: riderProfile.zone },
          {
            label: fr ? "Statut" : "Status",
            value: fr
              ? riderProfile.status === "on_duty"
                ? "En service"
                : "Hors service"
              : riderProfile.status.replace(/_/g, " "),
          },
        ]} />
      </DetailSection>
    </div>
  );
}
