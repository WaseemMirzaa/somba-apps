"use client";

import { PageHeader } from "@/components/ui/page-header";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { ChangePasswordForm, TwoFactorCard } from "@/components/seller/account-security";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";

/** The signed-in admin's own account: password and two-factor authentication (open to every admin role). */
export default function AdminAccountPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { user } = useRealtime();
  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Mon compte" : "My account"}
        subtitle={user ? `${user.name} · ${user.email}` : undefined}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Mon compte" : "My account" }]}
      />
      <DetailGrid>
        <DetailGridSection title={fr ? "Authentification à deux facteurs" : "Two-factor authentication"} span={3}>
          <TwoFactorCard />
        </DetailGridSection>
        <DetailGridSection title={fr ? "Mot de passe" : "Password"} span={3}>
          <ChangePasswordForm />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}
