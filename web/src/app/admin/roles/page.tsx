"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminRoles as initialRoles } from "@/lib/admin-entities";
import { adminBreadcrumb, permissionLabel } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

const ROLE_NAMES_FR: Record<string, string> = {
  super: "Super administrateur",
  operations: "Opérations",
  finance: "Finance",
  support: "Assistance",
  marketing: "Marketing",
  moderation: "Modération",
  warehouse: "Administrateur d'entrepôt",
};

/** Each department is run by a single manager — their sign-in is the only one scoped to it. */
const ROLE_MANAGERS: Record<string, string> = {
  super: "admin@somba.com",
  operations: "ops@somba.com",
  finance: "finance@somba.com",
  support: "support@somba.com",
  marketing: "marketing@somba.com",
  moderation: "mod@somba.com",
  warehouse: "warehouse-admin@somba.com",
};

function roleDisplayName(role: (typeof initialRoles)[number], fr: boolean) {
  return fr ? (ROLE_NAMES_FR[role.id] ?? role.name) : role.name;
}

export default function AdminRolesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roles] = useState(initialRoles);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Rôles et autorisations" : "Roles & Permissions"}
        subtitle={
          fr
            ? "Rôles de sous-administrateur — Opérations, Finance, Assistance, Marketing, Modération, Entrepôt"
            : "Sub-admin roles — Operations, Finance, Support, Marketing, Moderation, Warehouse"
        }
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Rôles" : "Roles" }]}
      />

      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
        {fr
          ? "Chaque département est géré séparément : un responsable ne voit et n'accède qu'aux pages de son département. Seul le Super administrateur peut attribuer ou révoquer ces identifiants."
          : "Each department is run separately: a manager only sees and can reach their own department's pages. Only the Super Admin can assign or revoke these credentials."}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-slate-900">{roleDisplayName(role, fr)}</h3>
                <Badge variant="primary">
                  {role.permissions.length} {fr ? "portées" : "scopes"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {fr ? "Responsable : " : "Manager: "}
                <span className="font-medium text-slate-700">{ROLE_MANAGERS[role.id] ?? "—"}</span>
                {role.id !== "super" && (
                  <span className="ml-1 text-slate-400">
                    · {fr ? "accès limité à ce département" : "access limited to this department"}
                  </span>
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {role.permissions.map((p) => (
                  <label key={p} className="flex cursor-pointer items-center gap-1">
                    <input
                      type="checkbox"
                      defaultChecked
                      disabled={editingRole !== role.id}
                      className="h-3 w-3 rounded"
                    />
                    <Badge variant="default">{permissionLabel(p, fr)}</Badge>
                  </label>
                ))}
              </div>
              <button
                onClick={() => {
                  const name = roleDisplayName(role, fr);
                  if (editingRole === role.id) {
                    setEditingRole(null);
                    toast(fr ? `Autorisations enregistrées pour ${name}` : `Permissions saved for ${name}`);
                  } else {
                    setEditingRole(role.id);
                    toast(fr ? `Modification des autorisations de ${name}` : `Editing ${name} permissions`, "info");
                  }
                }}
                className="mt-4 text-sm font-medium text-[var(--primary)] hover:underline"
              >
                {editingRole === role.id
                  ? fr
                    ? "Enregistrer les autorisations"
                    : "Save permissions"
                  : fr
                    ? "Modifier les autorisations"
                    : "Edit permissions"}
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
