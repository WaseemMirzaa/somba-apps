"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { auditLogs, resolveAuditEntityHref } from "@/lib/admin-entities";

export default function AdminAuditPage() {
  const { t } = useLocale();

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("auditLog")}
        subtitle={t("auditSubtitle")}
        breadcrumbs={[{ label: t("adminBreadcrumb"), href: "/admin" }, { label: t("auditLog") }]}
      />

      <div className="space-y-3">
        {auditLogs.map((log) => {
          const entityHref = resolveAuditEntityHref(log.entity, log.entityId);
          return (
            <Link key={log.id} href={`/admin/audit/${log.id}`}>
            <Card className="transition-colors hover:border-blue-200">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="primary">{log.action}</Badge>
                      <span className="text-xs text-slate-400">{log.timestamp}</span>
                    </div>
                    <p className="mt-2 text-sm">
                      <strong>{log.actor}</strong> · {log.entity}{" "}
                      {entityHref ? (
                        <Link href={entityHref} className="text-blue-600 hover:underline"><code>{log.entityId}</code></Link>
                      ) : (
                        <code className="text-slate-600">{log.entityId}</code>
                      )}
                    </p>
                  </div>
                </div>
                {log.before && log.after && (
                  <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-2">
                    <div><span className="text-red-600">− {log.before}</span></div>
                    <div><span className="text-emerald-600">+ {log.after}</span></div>
                  </div>
                )}
              </CardContent>
            </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
