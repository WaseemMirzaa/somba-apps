"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { ChangePasswordForm } from "@/components/seller/account-security";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";

/** The signed-in warehouse member's own account: who they are, and the password (open to every tier). */
export default function WarehouseAccountPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { user } = useRealtime();
  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Mon compte" : "My account"}
        subtitle={user ? `${user.name} · ${user.email}` : undefined}
        breadcrumbs={[{ label: fr ? "Entrepôt" : "Warehouse", href: "/warehouse" }, { label: fr ? "Mon compte" : "My account" }]}
      />
      <DetailGrid>
        <DetailGridSection title={fr ? "Mot de passe" : "Password"} span={3}>
          <ChangePasswordForm />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
