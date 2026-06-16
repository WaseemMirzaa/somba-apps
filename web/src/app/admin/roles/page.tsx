"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminRoles as initialRoles } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

const ROLE_NAMES_FR: Record<string, string> = {
  super: "Super administrateur",
  operations: "Opérations",
  finance: "Finance",
  support: "Support",
  marketing: "Marketing",
  moderation: "Modération",
  warehouse: "Administrateur d'entrepôt",
};

export default function AdminRolesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roles] = useState(initialRoles);

  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Rôles et autorisations" : "Roles & Permissions"} subtitle={fr ? "Rôles de sous-administrateur — Opérations, Finance, Support, Marketing, Modération, Entrepôt" : "Sub-admin roles — Operations, Finance, Support, Marketing, Moderation, Warehouse"} breadcrumbs={[{ label: fr ? "Admin" : "Admin", href: "/admin" }, { label: fr ? "Rôles" : "Roles" }]} />

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-slate-900">{fr ? (ROLE_NAMES_FR[role.id] ?? role.name) : role.name}</h3>
                <Badge variant="primary">{role.permissions.length} {fr ? "portées" : "scopes"}</Badge>
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
                    toast(fr ? `Autorisations enregistrées pour ${role.name}` : `Permissions saved for ${role.name}`);
                  } else {
                    setEditingRole(role.id);
                    toast(fr ? `Modification des autorisations de ${role.name}` : `Editing ${role.name} permissions`, "info");
                  }
                }}
                className="mt-4 text-sm font-medium text-[var(--primary)] hover:underline"
              >
                {editingRole === role.id ? (fr ? "Enregistrer les autorisations" : "Save permissions") : (fr ? "Modifier les autorisations" : "Edit permissions")}
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
