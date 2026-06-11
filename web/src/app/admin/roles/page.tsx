"use client";

import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { localizedField } from "@/lib/locale-helpers";
import { adminRoles as initialRoles } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";

export default function AdminRolesPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roles] = useState(initialRoles);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("roles")}
        subtitle={t("permissions")}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("roles") }]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <Link key={role.id} href={`/admin/roles/${role.id}`}>
          <Card className="transition-colors hover:border-blue-200">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-slate-900">{localizedField(locale, role.name, role.nameFr)}</h3>
                <Badge variant="primary">{role.permissions.length} {t("permissions")}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {role.permissions.map((p) => (
                  <label key={p} className="flex cursor-pointer items-center gap-1">
                    <input
                      type="checkbox"
                      defaultChecked
                      disabled={editingRole !== role.id}
                      className="h-3 w-3 rounded"
                    />
                    <Badge variant="default">{p}</Badge>
                  </label>
                ))}
              </div>
              <button
                onClick={() => {
                  if (editingRole === role.id) {
                    setEditingRole(null);
                    toast(t("save"));
                  } else {
                    setEditingRole(role.id);
                    toast(t("edit"), "info");
                  }
                }}
                className="mt-4 text-sm font-medium text-blue-600 hover:underline"
              >
                {editingRole === role.id ? t("save") : t("edit")} {t("permissions")}
              </button>
            </CardContent>
          </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
