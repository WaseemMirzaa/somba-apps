"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminRoles as initialRoles } from "@/lib/admin-entities";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";

// Master list of grantable scopes (union across all seed roles, minus the "all" super-scope)
const ALL_SCOPES = Array.from(new Set(initialRoles.flatMap((r) => r.permissions)))
  .filter((p) => p !== "all")
  .sort();

export default function AdminRolesPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [roles, setRoles] = useState(initialRoles);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);

  function startEdit(roleId: string, current: string[], roleName: string) {
    // "all" expands to every scope so the editor shows a concrete, toggleable set
    setDraft(current.includes("all") ? [...ALL_SCOPES] : current);
    setEditingRole(roleId);
    toast(fr ? `Modification des permissions de ${roleName}` : `Editing ${roleName} permissions`, "info");
  }

  function toggleScope(scope: string) {
    setDraft((d) => (d.includes(scope) ? d.filter((s) => s !== scope) : [...d, scope]));
  }

  function saveEdit(roleId: string, roleName: string) {
    setRoles((rs) => rs.map((r) => (r.id === roleId ? { ...r, permissions: [...draft].sort() } : r)));
    setEditingRole(null);
    setDraft([]);
    toast(fr ? `Permissions enregistrées pour ${roleName}` : `Permissions saved for ${roleName}`, "success");
  }

  function cancelEdit() {
    setEditingRole(null);
    setDraft([]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Rôles & Permissions" : "Roles & Permissions"}
        subtitle={fr ? "Rôles sous-admin — Opérations, Finance, Support, Marketing, Modération, Entrepôt" : "Sub-admin roles — Operations, Finance, Support, Marketing, Moderation, Warehouse"}
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Rôles" : "Roles" }]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {roles.map((role) => {
          const isEditing = editingRole === role.id;
          const isSuper = role.permissions.includes("all");
          // While editing, offer the full scope list; otherwise show what the role holds.
          const visibleScopes = isEditing ? ALL_SCOPES : role.permissions;

          return (
            <Card key={role.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-slate-900">{role.name}</h3>
                  <Badge variant="primary">
                    {isEditing ? draft.length : role.permissions.length} {fr ? "portées" : "scopes"}
                  </Badge>
                </div>

                {isSuper && !isEditing && (
                  <p className="mt-2 text-xs text-slate-500">{fr ? "Accès complet à toutes les portées." : "Full access to every scope."}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {visibleScopes.map((p) => {
                    const checked = isEditing ? draft.includes(p) : true;
                    return (
                      <label key={p} className={`flex items-center gap-1 ${isEditing ? "cursor-pointer" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!isEditing}
                          onChange={() => toggleScope(p)}
                          className="h-3 w-3 rounded"
                        />
                        <Badge variant={checked ? "default" : "muted"}>{p}</Badge>
                      </label>
                    );
                  })}
                </div>

                {isEditing ? (
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={() => saveEdit(role.id, role.name)}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      {fr ? "Enregistrer les permissions" : "Save permissions"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="text-sm font-medium text-slate-500 hover:underline"
                    >
                      {fr ? "Annuler" : "Cancel"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => startEdit(role.id, role.permissions, role.name)}
                    className="mt-4 text-sm font-medium text-blue-600 hover:underline"
                  >
                    {fr ? "Modifier les permissions" : "Edit permissions"}
                  </button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
