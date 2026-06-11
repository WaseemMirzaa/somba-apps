"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useNotifications } from "@/context/notification-context";
import { useLocale } from "@/context/locale-context";
import { localizedField } from "@/lib/locale-helpers";

export default function ShopNotificationsPage() {
  const { forPortal, markRead, markAllRead } = useNotifications();
  const { locale, t } = useLocale();
  const items = forPortal("customer");

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("notifications")}
        actions={
          <button onClick={() => markAllRead("customer")} className="text-sm text-blue-600">
            {t("markAllRead")}
          </button>
        }
      />
      <div className="space-y-2">
        {items.map((n) => (
          <Link
            key={n.id}
            href={n.href ?? "#"}
            onClick={() => markRead(n.id)}
            className={`block rounded-xl border p-4 transition hover:border-blue-200 ${n.read ? "opacity-60" : "border-blue-100 bg-blue-50/30"}`}
          >
            <p className="font-medium">{localizedField(locale, n.title, n.titleFr)}</p>
            <p className="text-sm text-slate-500">{localizedField(locale, n.body, n.bodyFr)}</p>
            <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
