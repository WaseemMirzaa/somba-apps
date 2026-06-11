"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import { getAdminRole } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";

export default function AdminRoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLocale();
  const { toast } = useToast();
  const role = getAdminRole(id);

  if (!role) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  return (
    <div className="space-y-6">
      <PageHeader title={role.name} subtitle={`${role.permissions.length} ${t("permissions")}`} backHref="/admin/roles" />
      <DetailSection title={t("roleDetail")}>
        <div className="flex flex-wrap gap-2">
          {role.permissions.map((p) => (
            <Badge key={p} variant="primary">{p}</Badge>
          ))}
        </div>
        <Button className="mt-4" size="sm" onClick={() => toast(t("save"))}>{t("save")} {t("permissions")}</Button>
      </DetailSection>
    </div>
  );
}
