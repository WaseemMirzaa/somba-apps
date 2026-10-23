"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Phone, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { RiderTaskCard } from "@/components/warehouse/rider-task-card";
import { useRiderAssignment, useRiderData } from "@/lib/rider";
import { useLocale } from "@/context/locale-context";
import { useAuth } from "@/context/auth-context";

export default function RiderProfilePage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const { logout } = useAuth();
  const { riderProfile, getActiveRiderTasks } = useRiderData();
  const assignment = useRiderAssignment();
  const activeTasks = getActiveRiderTasks();
  const initials = riderProfile.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-6">
      <PageHeader title={t("myAccount")} />

      <div className="card-premium p-6 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-2xl font-bold text-white">
          {initials}
        </div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-bold">{riderProfile.name}</h2>
        <p className="text-sm text-slate-500">{riderProfile.email}</p>
        <div className="mt-3 flex justify-center gap-2">
          <Badge variant="primary">{riderProfile.id}</Badge>
        </div>
      </div>

      <DetailSection title={fr ? "Profil" : "Profile"}>
        <InfoGrid items={[
          { label: fr ? "Nom" : "Name", value: riderProfile.name },
          { label: "Email", value: riderProfile.email || "—" },
          {
            label: fr ? "Téléphone" : "Phone",
            value: riderProfile.phone ? (
              <a href={`tel:${riderProfile.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-emerald-600 hover:underline">
                <Phone className="h-3.5 w-3.5" />
                {riderProfile.phone}
              </a>
            ) : "—",
          },
          { label: fr ? "Livraisons en cours" : "Active deliveries", value: riderProfile.activeTasks },
        ]} />
      </DetailSection>

      <DetailSection title={fr ? "Où je travaille" : "Where I work"}>
        {assignment.error ? (
          <p className="text-sm text-red-600">{assignment.error}</p>
        ) : !assignment.data ? (
          <p className="text-sm text-slate-400">{fr ? "Chargement…" : "Loading…"}</p>
        ) : (
          <InfoGrid items={[
            {
              label: fr ? "Entrepôt" : "Home warehouse",
              value: assignment.data.hub ? (
                <span className="inline-flex items-center gap-1"><Warehouse className="h-3.5 w-3.5 text-emerald-600" />{assignment.data.hub.name} · {assignment.data.hub.city}</span>
              ) : (fr ? "Aucun — vous voyez les livraisons de tous les entrepôts" : "None — you see every warehouse's deliveries"),
              full: true,
            },
            {
              label: fr ? "Mes zones" : "My zones",
              value: assignment.data.preferredZones.length ? assignment.data.preferredZones.map((z) => z.name).join(", ") : "—",
            },
            {
              label: fr ? "Zones de l'entrepôt" : "Warehouse zones",
              value: assignment.data.hubZones.length ? assignment.data.hubZones.map((z) => z.name).join(", ") : "—",
            },
          ]} />
        )}
      </DetailSection>

      <DetailSection title={fr ? "Livraisons en cours" : "Current Deliveries"}>
        {activeTasks.length === 0 ? (
          <p className="text-sm text-slate-500">{fr ? "Aucune livraison active." : "No active deliveries."}</p>
        ) : (
          <div className="space-y-3">
            {activeTasks.map((task) => (
              <RiderTaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </DetailSection>

      <DetailSection title={fr ? "Liens rapides" : "Quick Links"}>
        <div className="flex flex-wrap gap-4">
          <Link href="/rider/history" className="text-sm text-emerald-600 hover:underline">{fr ? "Historique" : "Task History"}</Link>
          <Link href="/rider/earnings" className="text-sm text-emerald-600 hover:underline">{t("earnings")}</Link>
          <Link href="/rider/notifications" className="text-sm text-emerald-600 hover:underline">Notifications</Link>
        </div>
      </DetailSection>

      <button
        onClick={() => {
          logout();
          router.push("/login");
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-3 text-sm font-semibold text-red-600 hover:bg-red-50"
      >
        <LogOut className="h-4 w-4" />
        {fr ? "Se déconnecter" : "Sign out"}
      </button>
    </div>
  );
}
