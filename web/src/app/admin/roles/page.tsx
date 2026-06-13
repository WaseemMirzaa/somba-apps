"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminRoles as initialRoles } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

export default function AdminRolesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [roles] = useState(initialRoles);

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Rôles & Permissions" : "Roles & Permissions"}
        subtitle={fr ? "Rôles sous-admin — Opérations, Finance, Support, Marketing, Modération, Entrepôt" : "Sub-admin roles — Operations, Finance, Support, Marketing, Moderation, Warehouse"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Rôles" : "Roles" }]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-slate-900">{role.name}</h3>
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
                    toast(fr ? `Permissions enregistrées pour ${role.name}` : `Permissions saved for ${role.name}`);
                  } else {
                    setEditingRole(role.id);
                    toast(fr ? `Modification des permissions de ${role.name}` : `Editing ${role.name} permissions`, "info");
                  }
                }}
                className="mt-4 text-sm font-medium text-blue-600 hover:underline"
              >
                {editingRole === role.id ? (fr ? "Enregistrer les permissions" : "Save permissions") : (fr ? "Modifier les permissions" : "Edit permissions")}
              </button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
