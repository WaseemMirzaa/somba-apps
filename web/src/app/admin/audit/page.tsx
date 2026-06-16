"use client";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { auditLogs } from "@/lib/admin-entities";

export default function AdminAuditPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" subtitle="Activity feed with before/after diffs" breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Audit" }]} />

      <div className="space-y-3">
        {auditLogs.map((log) => (
          <Card key={log.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="primary">{log.action}</Badge>
                    <span className="text-xs text-slate-400">{log.timestamp}</span>
                  </div>
                  <p className="mt-2 text-sm"><strong>{log.actor}</strong> · {log.entity} <code className="text-[var(--primary)]">{log.entityId}</code></p>
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
        ))}
      </div>
    </div>
  );
}
