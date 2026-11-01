"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { noticeHref } from "@/lib/notice-links";
import { localizedNotice, noticeTypeLabel } from "@/lib/i18n-fields";
import { errorMessage } from "@/lib/warehouse-live";
import { useOpsBase } from "@/lib/ops-path";
import { useRealtime } from "@/context/realtime-context";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

const READ_STATUS_OPTIONS = [
  { value: "unread", label: "Unread", labelFr: "Non lu" },
  { value: "read", label: "Read", labelFr: "Lu" },
];

/** Every notice for this warehouse member: their own and the warehouse's (tasks to assign, returns, replacements…). */
export default function WarehouseNotificationsPage() {
  const rt = useRealtime();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const base = useOpsBase();
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const items = useMemo(
    () =>
      [...rt.notifications]
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .map((n) => ({ ...n, ...localizedNotice(n, fr), href: noticeHref(n, "warehouse") })),
    [rt.notifications, fr],
  );
  const filtered = useMemo(
    () =>
      applyListFilters(items, filters, {
        searchFields: ["title", "body", "titleFr", "bodyFr", "type"],
        statusField: (n) => (n.read ? "read" : "unread"),
      }),
    [items, filters],
  );
  const unread = rt.unreadCount;

  async function markRead(id: string) {
    try {
      await rt.markRead(id);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }
  async function markAll() {
    try {
      await rt.markAllRead();
      toast(fr ? "Tout est marqué comme lu" : "All marked as read");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={fr ? `${unread} non lue${unread === 1 ? "" : "s"}` : `${unread} unread`}
        breadcrumbs={[{ label: base.startsWith("/admin") ? "Admin" : fr ? "Entrepôt" : "Warehouse", href: base.startsWith("/admin") ? "/admin/fulfillment" : "/warehouse" }, { label: "Notifications" }]}
        actions={
          unread > 0 ? (
            <button onClick={() => void markAll()} className="text-sm font-medium text-[var(--primary)] hover:underline">
              {fr ? "Tout marquer comme lu" : "Mark all read"}
            </button>
          ) : undefined
        }
      />
      <ListFilters values={filters} onChange={setFilters} statusOptions={READ_STATUS_OPTIONS} searchPlaceholder={fr ? "Titre, type, contenu…" : "Title, type, content…"} showDateFilters={false} />
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">{fr ? "Aucune notification." : "No notifications."}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {filtered.map((n) => (
                <li key={n.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={n.href}
                      onClick={() => !n.read && void markRead(n.id)}
                      className={`text-sm font-medium hover:underline ${n.read ? "text-slate-600" : "text-[var(--primary)]"}`}
                    >
                      {n.title}
                    </Link>
                    <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(n.createdAt).toLocaleString(fr ? "fr-FR" : "en-GB")} · {noticeTypeLabel(n.type, fr)}
                    </p>
                  </div>
                  {n.read ? (
                    <Badge>{fr ? "Lu" : "Read"}</Badge>
                  ) : (
                    <button onClick={() => void markRead(n.id)} className="shrink-0 rounded-lg border border-indigo-200 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50">
                      {fr ? "Marquer lu" : "Mark read"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
