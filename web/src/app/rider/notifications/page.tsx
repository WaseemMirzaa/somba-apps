"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useNotifications } from "@/context/notification-context";
import { useLocale } from "@/context/locale-context";

const READ_STATUS_OPTIONS = [
  { value: "unread", label: "Unread", labelFr: "Non lu" },
  { value: "read", label: "Read", labelFr: "Lu" },
];

export default function RiderNotificationsPage() {
  const { forPortal, markRead, markAllRead } = useNotifications();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const items = forPortal("rider");

  const filtered = useMemo(
    () =>
      applyListFilters(items, filters, {
        searchFields: ["title", "titleFr", "body", "bodyFr", "type", (n) => (n.read ? "read" : "unread")],
        dateField: "createdAt",
        statusField: (n) => (n.read ? "read" : "unread"),
      }),
    [items, filters]
  );

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={
          fr
            ? `${unreadCount} notification${unreadCount === 1 ? "" : "s"} non lue${unreadCount === 1 ? "" : "s"}`
            : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
        }
        breadcrumbs={[{ label: fr ? "Livreur" : "Rider", href: "/rider" }, { label: "Notifications" }]}
        actions={
          unreadCount > 0 ? (
            <button
              onClick={() => markAllRead("rider")}
              className="text-sm font-medium text-[var(--primary)] hover:underline"
            >
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
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "title",
                label: fr ? "Titre" : "Title",
                render: (row) => (
                  <div>
                    <Link
                      href={String(row.href ?? "#")}
                      onClick={() => markRead(String(row.id))}
                      className={`font-medium hover:underline ${row.read ? "text-slate-600" : "text-[var(--primary)]"}`}
                    >
                      {fr ? String(row.titleFr) : String(row.title)}
                    </Link>
                    <p className="mt-0.5 text-sm text-slate-500">{fr ? String(row.bodyFr) : String(row.body)}</p>
                  </div>
                ),
              },
              {
                key: "type",
                label: "Type",
                render: (row) => (
                  <Badge variant="info">{String((fr && row.typeFr) ? row.typeFr : row.type).replace(/_/g, " ")}</Badge>
                ),
              },
              {
                key: "createdAt",
                label: t("date"),
                render: (row) => new Date(String(row.createdAt)).toLocaleString(locale),
              },
              {
                key: "read",
                label: t("status"),
                render: (row) => (
                  <Badge variant={row.read ? "default" : "warning"}>
                    {row.read ? (fr ? "Lu" : "Read") : (fr ? "Non lu" : "Unread")}
                  </Badge>
                ),
              },
              {
                key: "actions",
                label: t("action"),
                render: (row) => (
                  <Link
                    href={String(row.href ?? "#")}
                    onClick={() => markRead(String(row.id))}
                    className="text-sm text-[var(--primary)] hover:underline"
                  >
                    {t("view")}
                  </Link>
                ),
              },
            ]}
            data={filtered as unknown as Record<string, unknown>[]}
          />
        </CardContent>
      </Card>
    </div>
  );
}
