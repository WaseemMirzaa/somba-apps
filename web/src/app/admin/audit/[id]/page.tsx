"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DetailSection, InfoGrid } from "@/components/ui/info-grid";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { auditLogs, resolveAuditEntityHref, getAuditLog } from "@/lib/admin-entities";

export default function AdminAuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useLocale();
  const log = getAuditLog(id);

  if (!log) return <div className="p-8 text-center text-slate-500">{t("notFound")}</div>;

  const entityHref = resolveAuditEntityHref(log.entity, log.entityId);

  return (
    <div className="space-y-6">
      <PageHeader title={log.id} subtitle={log.action} backHref="/admin/audit" actions={<Badge variant="primary">{log.role}</Badge>} />
      <DetailSection title={t("auditDetail")}>
        <InfoGrid items={[
          { label: t("name"), value: log.actor },
          { label: t("type"), value: log.action },
          { label: t("reference"), value: log.entity },
          { label: "ID", value: entityHref ? <Link href={entityHref} className="text-blue-600 hover:underline"><code>{log.entityId}</code></Link> : <code>{log.entityId}</code> },
          { label: t("date"), value: log.timestamp },
        ]} />
        {log.before && log.after && (
          <div className="mt-4 grid gap-2 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
            <div><span className="text-red-600">− {log.before}</span></div>
            <div><span className="text-emerald-600">+ {log.after}</span></div>
          </div>
        )}
      </DetailSection>
      <DetailSection title={t("recentActivity")}>
        <p className="text-sm text-slate-500">{auditLogs.filter((l) => l.entity === log.entity).length} total {log.entity} events in feed.</p>
      </DetailSection>
    </div>
  );
}
