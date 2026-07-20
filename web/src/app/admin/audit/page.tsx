"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAdminData } from "@/lib/admin";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useLocale } from "@/context/locale-context";

const ACTION_FR: Record<string, string> = {
  APPROVE_SELLER: "Approuver le vendeur",
  REJECT_PRODUCT: "Rejeter le produit",
  PROCESS_PAYOUT: "Traiter le versement",
  UPDATE_FLASH_SALE: "Mettre à jour la vente flash",
};
const ENTITY_FR: Record<string, string> = {
  Seller: "Vendeur",
  Product: "Produit",
  Payout: "Versement",
  Campaign: "Campagne",
};
const AUDIT_VALUE_FR: Record<string, string> = {
  pending: "en attente",
  approved: "approuvé",
  rejected: "rejeté",
  completed: "terminé",
};
const ACTOR_FR: Record<string, string> = {
  "Admin User": "Administrateur",
  Moderator: "Modérateur",
  "Finance Lead": "Responsable finance",
  "Ops Manager": "Responsable des opérations",
};

export default function AdminAuditPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { auditLogs } = useAdminData();
  return (
    <div className="space-y-6">
      <PageHeader title={fr ? "Journal d'audit" : "Audit Log"} subtitle={fr ? "Flux d'activité avec différences avant/après" : "Activity feed with before/after diffs"} breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Audit" : "Audit" }]} />

      <div className="space-y-3">
        {auditLogs.map((log) => (
          <Card key={log.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="primary">{fr ? (ACTION_FR[log.action] ?? log.action) : log.action}</Badge>
                    <span className="text-xs text-slate-400">{log.timestamp}</span>
                  </div>
                  <p className="mt-2 text-sm"><strong>{fr ? (ACTOR_FR[log.actor] ?? log.actor) : log.actor}</strong> · {fr ? (ENTITY_FR[log.entity] ?? log.entity) : log.entity} <code className="text-[var(--primary)]">{log.entityId}</code></p>
                </div>
              </div>
              {log.before && log.after && (
                <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
                  <div><span className="text-red-600">− {fr ? (AUDIT_VALUE_FR[log.before] ?? log.before) : log.before}</span></div>
                  <div><span className="text-emerald-600">+ {fr ? (AUDIT_VALUE_FR[log.after] ?? log.after) : log.after}</span></div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
