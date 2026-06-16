"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useNotifications } from "@/context/notification-context";
import { useLocale } from "@/context/locale-context";

const READ_STATUS_OPTIONS = [
  { value: "unread", label: "Unread", labelFr: "Non lu" },
  { value: "read", label: "Read", labelFr: "Lu" },
];

export default function SellerNotificationsPage() {
  const { forPortal, markRead, markAllRead } = useNotifications();
  const { t, locale } = useLocale();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const items = forPortal("seller");

  const filtered = useMemo(
    () =>
      applyListFilters(items, filters, {
        searchFields: [
          "title",
          "titleFr",
          "body",
          "bodyFr",
          "type",
          (n) => (n.read ? "read" : "unread"),
        ],
        dateField: "createdAt",
        statusField: (n) => (n.read ? "read" : "unread"),
      }),
    [items, filters]
  );

  const unreadCount = items.filter((n) => !n.read).length;

  return (
    <SellerListPage
      title={locale === "fr" ? "Notifications" : "Notifications"}
      subtitle={
        locale === "fr"
          ? `${unreadCount} notification(s) non lue(s)`
          : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
      }
      breadcrumbs={[
        { label: locale === "fr" ? "Vendeur" : "Seller", href: "/seller" },
        { label: locale === "fr" ? "Notifications" : "Notifications" },
      ]}
      actions={
        unreadCount > 0 ? (
          <button
            onClick={() => markAllRead("seller")}
            className="text-sm font-medium text-[var(--primary)] hover:underline"
          >
            {locale === "fr" ? "Tout marquer lu" : "Mark all read"}
          </button>
        ) : undefined
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={READ_STATUS_OPTIONS}
          searchPlaceholder={
            locale === "fr" ? "Titre, type, contenu…" : "Title, type, content…"
          }
        />
      }
      columns={[
        {
          key: "title",
          label: locale === "fr" ? "Titre" : "Title",
          render: (row) => (
            <Link
              href={String(row.href ?? "#")}
              onClick={() => markRead(String(row.id))}
              className={`font-medium hover:underline ${row.read ? "text-slate-600" : "text-[var(--primary)]"}`}
            >
              {locale === "fr" ? String(row.titleFr) : String(row.title)}
            </Link>
          ),
        },
        {
          key: "type",
          label: locale === "fr" ? "Type" : "Type",
          render: (row) => (
            <Badge variant="info">{String(row.type).replace(/_/g, " ")}</Badge>
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
  );
}
