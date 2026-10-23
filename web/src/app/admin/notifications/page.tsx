"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { noticeHref } from "@/lib/notice-links";
import { useRealtime } from "@/context/realtime-context";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";

const READ_STATUS_OPTIONS = [
  { value: "unread", label: "Unread", labelFr: "Non lu" },
  { value: "read", label: "Read", labelFr: "Lu" },
];

/** Every notice for this admin: their own and their team's (support, finance, operations…), each opening its page. */
export default function AdminNotificationsPage() {
  const { notifications, markRead, markAllRead } = useRealtime();
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const items = useMemo(
    () =>
      [...notifications]
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .map((n) => ({ ...n, href: noticeHref(n, "admin"), state: n.read ? "read" : "unread", audience: n.userId ? "you" : "team" })),
    [notifications],
  );
  const filtered = useMemo(
    () => applyListFilters(items, filters, { searchFields: ["title", "body", "type", "state"], dateField: "createdAt", statusField: "state" }),
    [items, filters],
  );
  const unread = items.filter((n) => !n.read).length;

  const fail = (e: unknown) => toast(e instanceof Error ? e.message : String(e), "error");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={fr ? `${unread} non lue(s) · les vôtres et celles de votre équipe` : `${unread} unread · yours and your team's`}
        breadcrumbs={[adminBreadcrumb(locale), { label: "Notifications" }]}
        actions={
          unread > 0 ? (
            <button onClick={() => void markAllRead().catch(fail)} className="text-sm font-medium text-[var(--primary)] hover:underline">
              {fr ? "Tout marquer lu" : "Mark all read"}
            </button>
          ) : undefined
        }
      />
      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={READ_STATUS_OPTIONS}
        searchPlaceholder={fr ? "Titre, type, contenu…" : "Title, type, content…"}
      />
      <Card>
        <CardContent className="p-0">
          <DataTable
            emptyMessage={fr ? "Aucune notification" : "No notifications yet"}
            columns={[
              {
                key: "title",
                label: fr ? "Titre" : "Title",
                render: (row) => (
                  <div>
                    <Link
                      href={String(row.href)}
                      onClick={() => !row.read && void markRead(String(row.id)).catch(fail)}
                      className={`font-medium hover:underline ${row.read ? "text-slate-600" : "text-[var(--primary)]"}`}
                    >
                      {String(row.title)}
                    </Link>
                    <p className="mt-0.5 max-w-xl text-sm text-slate-500">{String(row.body)}</p>
                  </div>
                ),
              },
              { key: "type", label: "Type", render: (row) => <Badge variant="info">{String(row.type).replace(/_/g, " ")}</Badge> },
              {
                key: "audience",
                label: fr ? "Pour" : "For",
                render: (row) => <span className="text-xs text-slate-500">{row.audience === "you" ? (fr ? "Vous" : "You") : fr ? "Équipe" : "Team"}</span>,
              },
              { key: "createdAt", label: t("date"), render: (row) => new Date(String(row.createdAt)).toLocaleString(locale) },
              {
                key: "read",
                label: t("status"),
                render: (row) => <Badge variant={row.read ? "default" : "warning"}>{row.read ? (fr ? "Lu" : "Read") : fr ? "Non lu" : "Unread"}</Badge>,
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
