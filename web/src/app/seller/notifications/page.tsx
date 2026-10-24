"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { SellerListPage } from "@/components/seller/list-page";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useRealtime } from "@/context/realtime-context";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { errMessage } from "@/lib/seller-labels";
import { ArrowLeftRight, Bell, Megaphone, PackageCheck, RefreshCw, RotateCcw, ShieldAlert, ShieldCheck, LifeBuoy, Truck, Wallet, type LucideIcon } from "lucide-react";
import { noticeHref } from "@/lib/notice-links";
import { localizedNotice, noticeTypeLabel } from "@/lib/i18n-fields";

const READ_STATUS_OPTIONS = [
  { value: "unread", label: "Unread", labelFr: "Non lu" },
  { value: "read", label: "Read", labelFr: "Lu" },
];

const TYPE_ICON: Record<string, LucideIcon> = {
  order: PackageCheck,
  delivery: Truck,
  payout: Wallet,
  campaign: Megaphone,
  moderation: ShieldCheck,
  support: LifeBuoy,
  return: RotateCcw,
  dispute: ShieldAlert,
  exchange: ArrowLeftRight,
  replacement: RefreshCw,
};

export default function SellerNotificationsPage() {
  const { notifications, markRead, markAllRead } = useRealtime();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);

  const items = useMemo(
    () =>
      [...notifications]
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .map((n) => ({ ...n, ...localizedNotice(n, fr), href: noticeHref(n, "seller"), state: n.read ? "read" : "unread" })),
    [notifications, fr]
  );

  const filtered = useMemo(
    () =>
      applyListFilters(items, filters, {
        searchFields: ["title", "body", "titleFr", "bodyFr", "type", "state"],
        dateField: "createdAt",
        statusField: "state",
      }),
    [items, filters]
  );

  const unreadCount = items.filter((n) => !n.read).length;

  async function read(id: string) {
    try {
      await markRead(id);
    } catch (e) {
      toast(errMessage(e), "error");
    }
  }

  async function readAll() {
    try {
      await markAllRead();
    } catch (e) {
      toast(errMessage(e), "error");
    }
  }

  return (
    <SellerListPage
      title="Notifications"
      subtitle={fr ? `${unreadCount} notification(s) non lue(s)` : `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`}
      breadcrumbs={[
        { label: fr ? "Vendeur" : "Seller", href: "/seller" },
        { label: "Notifications" },
      ]}
      actions={
        unreadCount > 0 ? (
          <button onClick={() => void readAll()} className="text-sm font-medium text-[var(--primary)] hover:underline">
            {fr ? "Tout marquer lu" : "Mark all read"}
          </button>
        ) : undefined
      }
      filters={
        <ListFilters
          values={filters}
          onChange={setFilters}
          statusOptions={READ_STATUS_OPTIONS}
          searchPlaceholder={fr ? "Titre, type, contenu…" : "Title, type, content…"}
        />
      }
      columns={[
        {
          key: "title",
          label: fr ? "Titre" : "Title",
          render: (row) => {
            const Icon = TYPE_ICON[String(row.type)] ?? Bell;
            return (
              <Link href={String(row.href)} onClick={() => void read(String(row.id))} className={`inline-flex items-center gap-2 font-medium hover:underline ${row.read ? "text-slate-600" : "text-[var(--primary)]"}`}>
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {String(row.title)}
              </Link>
            );
          },
        },
        { key: "body", label: fr ? "Message" : "Message", render: (row) => <span className="text-slate-600">{String(row.body)}</span> },
        { key: "type", label: "Type", render: (row) => <Badge variant="info">{noticeTypeLabel(String(row.type), fr)}</Badge> },
        { key: "createdAt", label: t("date"), render: (row) => new Date(String(row.createdAt)).toLocaleString(locale) },
        {
          key: "read",
          label: t("status"),
          render: (row) => (
            <Badge variant={row.read ? "default" : "warning"}>
              {row.read ? (fr ? "Lu" : "Read") : fr ? "Non lu" : "Unread"}
            </Badge>
          ),
        },
        {
          key: "actions",
          label: t("action"),
          render: (row) => (
            <div className="flex gap-3 text-sm">
              <Link href={String(row.href)} onClick={() => void read(String(row.id))} className="text-[var(--primary)] hover:underline">{t("view")}</Link>
              {!row.read && (
                <button type="button" onClick={() => void read(String(row.id))} className="text-slate-500 hover:underline">
                  {fr ? "Marquer lu" : "Mark read"}
                </button>
              )}
            </div>
          ),
        },
      ]}
      data={filtered as unknown as Record<string, unknown>[]}
    />
  );
}
