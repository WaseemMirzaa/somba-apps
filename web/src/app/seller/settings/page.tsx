"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { storeSettings } from "@/lib/seller-entities";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

export default function SellerSettingsPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";

  const permissions: { en: string; fr: string }[] = [
    { en: "Products", fr: "Produits" },
    { en: "Orders", fr: "Commandes" },
    { en: "Finance", fr: "Finance" },
    { en: "Analytics", fr: "Analyses" },
    { en: "Support", fr: "Support" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t("settings")} subtitle={fr ? "Profil de la boutique, informations sur l'entreprise, équipe et permissions" : "Store profile, business info, team & permissions"} breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("settings") }]} />

      <DetailGrid>
        <DetailGridSection title={fr ? "Profil de la boutique" : "Store Profile"} span={2}>
          <InfoGrid items={[
            { label: fr ? "Nom de la boutique" : "Store Name", value: storeSettings.storeName },
            { label: fr ? "Description" : "Description", value: storeSettings.description, full: true },
          ]} />
          <div className="mt-4 flex h-24 w-full items-center justify-center rounded-lg border-2 border-dashed border-sky-200 text-sm text-slate-400">
            {fr ? "Téléversement logo et bannière (démo)" : "Logo & Banner upload (mock)"}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Entreprise" : "Business"}>
          <InfoGrid items={[
            { label: fr ? "Nom de l'entreprise" : "Business Name", value: storeSettings.businessName },
            { label: fr ? "Numéro fiscal" : "Tax ID", value: storeSettings.taxId },
            { label: fr ? "Téléphone" : "Phone", value: storeSettings.phone },
            { label: fr ? "E-mail" : "Email", value: storeSettings.email },
          ]} />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Permissions de rôle" : "Role Permissions"} span={2}>
          <div className="space-y-3 text-sm">
            {permissions.map((perm) => (
              <div key={perm.en} className="flex items-center justify-between rounded-lg border border-sky-50 p-3">
                <span>{fr ? perm.fr : perm.en}</span>
                <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-sky-300" />
              </div>
            ))}
          </div>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Membres de l'équipe" : "Team Members"} span={3}>
          <DataTable
            columns={[
              { key: "name", label: fr ? "Nom" : "Name" },
              { key: "role", label: fr ? "Rôle" : "Role" },
              { key: "email", label: fr ? "E-mail" : "Email" },
              { key: "status", label: t("status"), render: (row) => <Badge variant="success">{fr ? (String(row.status) === "active" ? "Actif" : String(row.status)) : String(row.status)}</Badge> },
            ]}
            data={storeSettings.teamMembers as unknown as Record<string, unknown>[]}
          />
        </DetailGridSection>
      </DetailGrid>

      <button onClick={() => toast(fr ? "Paramètres enregistrés avec succès" : "Settings saved successfully")} className="btn-primary rounded-lg px-6 py-2 text-sm font-medium">{fr ? "Enregistrer les paramètres" : "Save Settings"}</button>
    </div>
  );
}
