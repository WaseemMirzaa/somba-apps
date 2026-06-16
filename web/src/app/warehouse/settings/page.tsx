"use client";

import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { PageHeader } from "@/components/ui/page-header";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function WarehouseSettingsPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("settings")}
        subtitle={fr ? "Heures d'ouverture · Zones · Règles d'expédition · Taille de lot · Attribution automatique" : "Working Hours · Zones · Dispatch Rules · Batch Size · Auto Assignment"}
        breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: t("settings") }]}
      />

      <DetailSection title={fr ? "Heures d'ouverture" : "Working Hours"}>
        <InfoGrid items={[
          { label: fr ? "Ouverture" : "Open", value: "06:00" },
          { label: fr ? "Fermeture" : "Close", value: "22:00" },
          { label: fr ? "Fuseau horaire" : "Timezone", value: "Africa/Kinshasa" },
        ]} />
      </DetailSection>

      <DetailSection title="Zones">
        <InfoGrid items={[
          { label: "Zone A", value: "Gombe, Centre-Ville" },
          { label: "Zone B", value: "Limete, Matete" },
          { label: "Zone C", value: "Bandal, Kintambo" },
        ]} />
      </DetailSection>

      <DetailSection title={fr ? "Règles d'expédition" : "Dispatch Rules"}>
        <InfoGrid items={[
          { label: fr ? "Taille de lot maximale" : "Max Batch Size", value: fr ? "15 colis" : "15 parcels" },
          { label: fr ? "Attribution automatique" : "Auto Assignment", value: fr ? "Activé" : "Enabled" },
          { label: fr ? "Optimisation d'itinéraire" : "Route Optimization", value: fr ? "Activé" : "Enabled" },
        ]} />
      </DetailSection>

      <div className="flex gap-3">
        <button onClick={() => toast(fr ? "Paramètres de l'entrepôt enregistrés" : "Warehouse settings saved")} className="btn-primary rounded-lg px-6 py-2 text-sm font-medium">{fr ? "Enregistrer" : "Save"}</button>
        <button onClick={() => toast(fr ? "Paramètres réinitialisés par défaut" : "Settings reset to defaults", "info")} className="rounded-lg border border-indigo-200 px-6 py-2 text-sm font-medium text-slate-600 hover:bg-indigo-50">{fr ? "Réinitialiser" : "Reset"}</button>
      </div>
    </div>
  );
}
