"use client";

import Link from "next/link";
import { MapPin, Navigation, Package } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useRiderZones } from "@/context/rider-zone-context";
import { useRiderData } from "@/lib/rider";
import { ADMIN_ZONES } from "@/lib/zones-admin";
import { DualCurrency } from "@/components/ui/dual-currency";

export default function RiderZonePage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { getRiderZone } = useRiderZones();
  const { riderProfile, riderTasks } = useRiderData();

  const zone = getRiderZone(riderProfile.id) || riderProfile.zone;
  // The assigned zone may read like "Kinshasa — Gombe"; tasks carry the commune.
  const commune = zone.includes("—") ? zone.split("—").pop()!.trim() : zone;
  const zoneInfo = ADMIN_ZONES.find((z) => commune.toLowerCase().includes(z.commune.toLowerCase()));

  const inZone = riderTasks.filter((tk) => zone.toLowerCase().includes(tk.zone.toLowerCase()) || tk.zone.toLowerCase() === commune.toLowerCase());
  const other = riderTasks.filter((tk) => !inZone.includes(tk));

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title={fr ? "Ma zone" : "My Zone"}
        subtitle={fr ? "Votre zone assignée et sa file de livraisons" : "Your assigned zone and its delivery queue"}
      />

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)]/10">
              <MapPin className="h-6 w-6 text-[var(--primary)]" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{fr ? "Zone assignée" : "Assigned zone"}</p>
              <p className="text-lg font-bold text-slate-900">{zone}</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xl font-bold text-slate-900">{inZone.length}</p>
              <p className="text-xs text-slate-500">{fr ? "Tâches dans ma zone" : "Tasks in my zone"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xl font-bold text-slate-900">{zoneInfo ? <DualCurrency amount={zoneInfo.deliveryFeeUsd} /> : "—"}</p>
              <p className="text-xs text-slate-500">{fr ? "Frais de livraison" : "Delivery fee"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xl font-bold text-slate-900">{zoneInfo ? zoneInfo.riders.length : "—"}</p>
              <p className="text-xs text-slate-500">{fr ? "Livreurs zone" : "Zone riders"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">{fr ? "File de ma zone" : "My zone queue"}</h2>
        {inZone.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">{fr ? "Aucune tâche dans votre zone." : "No tasks in your zone."}</p>
        ) : (
          <div className="space-y-2">
            {inZone.map((tk) => (
              <Link key={tk.id} href={`/rider/tasks/${tk.id}`} className="card-premium flex items-center justify-between p-4 transition-colors hover:border-blue-200">
                <div className="flex items-center gap-3">
                  <span className="rounded-lg bg-blue-50 p-2"><Package className="h-4 w-4 text-[var(--primary)]" /></span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{tk.id} · {tk.customer}</p>
                    <p className="text-xs text-slate-500">{tk.address}</p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge variant="info">{tk.zone}</Badge>
                  <p className="mt-1 flex items-center justify-end gap-1 text-xs text-slate-500"><Navigation className="h-3 w-3" />{tk.distance} · {tk.eta}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {other.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-400">{fr ? "Autres zones" : "Other zones"}</h2>
          <div className="space-y-2 opacity-70">
            {other.map((tk) => (
              <Link key={tk.id} href={`/rider/tasks/${tk.id}`} className="card-premium flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-slate-900">{tk.id} · {tk.customer}</p>
                  <p className="text-xs text-slate-500">{tk.address}</p>
                </div>
                <Badge variant="default">{tk.zone}</Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
