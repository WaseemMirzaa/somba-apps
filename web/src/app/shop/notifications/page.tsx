"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useRealtime } from "@/context/realtime-context";
import { useLocale } from "@/context/locale-context";

const READ_STATUS_OPTIONS = [
  { value: "unread", label: "Unread", labelFr: "Non lu" },
  { value: "read", label: "Read", labelFr: "Lu" },
];

export default function ShopNotificationsPage() {
  const { notifications, markRead } = useRealtime();
  const { t, locale } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  // Live backend notifications, shaped for the bilingual list UI.
  const items = useMemo(
    () =>
      notifications.map((n) => ({
        ...n,
        titleFr: n.title,
        bodyFr: n.body,
        typeFr: n.type,
      })),
    [notifications],
  );
  const markAllRead = () =>
    notifications.filter((n) => !n.read).forEach((n) => void markRead(n.id));

  const filtered = useMemo(
    () =>
      applyListFilters(items, filters, {
        searchFields: [
          "title",
          "titleFr",
          "body",
          "bodyFr",
          "type",
          "typeFr",
          (n) => (n.read ? "read" : "unread"),
        ],
        dateField: "createdAt",
        statusField: (n) => (n.read ? "read" : "unread"),
      }),
    [items, filters]
  );

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "fr" ? "Notifications" : "Notifications"}
        subtitle={
          locale === "fr"
            ? `${unreadCount} notification(s) non lue(s)`
            : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
        }
        breadcrumbs={[
          { label: locale === "fr" ? "Compte" : "Account", href: "/shop/account" },
          { label: locale === "fr" ? "Notifications" : "Notifications" },
        ]}
        actions={
          unreadCount > 0 ? (
            <button
              onClick={() => markAllRead()}
              className="text-sm font-medium text-[var(--primary)] hover:underline"
            >
              {locale === "fr" ? "Tout marquer lu" : "Mark all read"}
            </button>
          ) : undefined
        }
      />

      <ListFilters
        values={filters}
        onChange={setFilters}
        statusOptions={READ_STATUS_OPTIONS}
        searchPlaceholder={
          locale === "fr" ? "Titre, type, contenu…" : "Title, type, content…"
        }
      />

      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={[
              {
                key: "title",
                label: locale === "fr" ? "Titre" : "Title",
                render: (row) => (
                  <div>
                    <Link
                      href={String(row.href ?? "#")}
                      onClick={() => markRead(String(row.id))}
                      className={`font-medium hover:underline ${row.read ? "text-slate-600" : "text-[var(--primary)]"}`}
                    >
                      {locale === "fr" ? String(row.titleFr) : String(row.title)}
                    </Link>
                    <p className="mt-0.5 max-w-md text-sm text-slate-500">
                      {locale === "fr" ? String(row.bodyFr) : String(row.body)}
                    </p>
                  </div>
                ),
              },
              {
                key: "type",
                label: locale === "fr" ? "Type" : "Type",
                render: (row) => (
                  <Badge variant="info">
                    {locale === "fr" && row.typeFr
                      ? String(row.typeFr)
                      : String(row.type).replace(/_/g, " ")}
                  </Badge>
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
                    {row.read
                      ? locale === "fr"
                        ? "Lu"
                        : "Read"
                      : locale === "fr"
                        ? "Non lu"
                        : "Unread"}
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
