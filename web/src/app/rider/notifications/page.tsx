"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useRealtime } from "@/context/realtime-context";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errorMessage } from "@/lib/warehouse-live";

const READ_STATUS_OPTIONS = [
  { value: "unread", label: "Unread", labelFr: "Non lu" },
  { value: "read", label: "Read", labelFr: "Lu" },
];

export default function RiderNotificationsPage() {
  const rt = useRealtime();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const items = rt.notifications;

  const filtered = useMemo(
    () =>
      applyListFilters(items, filters, {
        searchFields: ["title", "body", "type"],
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
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={
          fr
            ? `${unread} notification${unread === 1 ? "" : "s"} non lue${unread === 1 ? "" : "s"}`
            : `${unread} unread notification${unread === 1 ? "" : "s"}`
        }
        actions={
          unread > 0 ? (
            <button onClick={() => void markAll()} className="text-sm font-medium text-emerald-700 hover:underline">
              {fr ? "Tout marquer comme lu" : "Mark all read"}
            </button>
          ) : undefined
        }
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={READ_STATUS_OPTIONS}
        searchPlaceholder={fr ? "Titre, type, contenu…" : "Title, type, content…"}
        showDateFilters={false}
      />

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">{fr ? "Aucune notification." : "No notifications."}</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {filtered.map((n) => (
                <li key={n.id} className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${n.read ? "text-slate-600" : "text-slate-900"}`}>{n.title}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {new Date(n.createdAt).toLocaleString(locale)} · {n.type.replace(/_/g, " ")}
                    </p>
                  </div>
                  {n.read ? (
                    <Badge>{fr ? "Lu" : "Read"}</Badge>
                  ) : (
                    <button onClick={() => void markRead(n.id)} className="shrink-0 rounded-lg border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
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
