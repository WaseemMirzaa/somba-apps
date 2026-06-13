"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { riderProfile } from "@/lib/rider-entities";
import { useLocale } from "@/context/locale-context";

export default function RiderProfilePage() {
  const { t } = useLocale();
  const [onDuty, setOnDuty] = useState(true);

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
          <Badge variant={onDuty ? "success" : "warning"}>{onDuty ? "Online" : "Offline"}</Badge>
          <Badge variant="primary">⭐ {riderProfile.rating}</Badge>
        </div>
        <label className="mt-4 flex items-center justify-center gap-2 text-sm">
          <input type="checkbox" checked={onDuty} onChange={(e) => setOnDuty(e.target.checked)} />
          Availability toggle (RF-04)
        </label>
      </div>

      <DetailSection title="Quick Links">
        <div className="flex flex-wrap gap-2">
          <Link href="/rider/history" className="text-sm text-emerald-600 hover:underline">Task History</Link>
          <Link href="/rider/notifications" className="text-sm text-emerald-600 hover:underline">Notifications</Link>
        </div>
      </DetailSection>

      <DetailSection title="Profile">
        <InfoGrid items={[
          { label: "Phone", value: riderProfile.phone },
          { label: "Vehicle", value: riderProfile.vehicle },
          { label: "Zone", value: riderProfile.zone },
          { label: "Status", value: riderProfile.status },
        ]} />
      </DetailSection>
    </div>
  );
}
