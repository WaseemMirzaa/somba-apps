"use client";

import { localDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { useServerList } from "@/lib/admin-live";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useLocale } from "@/context/locale-context";

interface AuditRow {
  id: string;
  actor: string;
  role: string;
  action: string;
  entity: string;
  entityId: string;
  detail?: string | null;
  timestamp?: string;
  createdAt?: string;
}

export default function AdminAuditPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { items, loading, error, reload } = useServerList<AuditRow>("audit:list", { pushEvents: ["audit:created"] });
  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Journal d'audit" : "Audit Log"}
        subtitle={fr ? "Actions du personnel enregistrées par le serveur" : "Staff actions recorded by the server"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Audit" : "Audit" }]}
      />

      {error && <SectionError message={error} onRetry={reload} />}
      {loading && !error && <SectionLoading />}
      {!loading && !error && items.length === 0 && <EmptyState>{fr ? "Aucune activité enregistrée." : "No activity recorded yet."}</EmptyState>}

      <div className="space-y-3">
        {items.map((log) => (
          <Card key={log.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">{log.action}</Badge>
                <span className="text-xs text-slate-400">{log.timestamp ?? (log.createdAt ? localDateTime(log.createdAt) : "")}</span>
              </div>
              <p className="mt-2 break-words text-sm">
                <strong>{log.actor}</strong> <span className="text-slate-400">({log.role})</span> · {log.entity}{" "}
                <code className="break-all text-[var(--primary)]">{log.entityId}</code>
                {log.detail ? <span className="text-slate-500"> · {log.detail}</span> : null}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
