"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useNotifications } from "@/context/notification-context";
import { useLocale } from "@/context/locale-context";

export default function ShopNotificationsPage() {
  const { forPortal, markRead, markAllRead } = useNotifications();
  const { locale } = useLocale();
  const items = forPortal("customer");

  return (
    <div className="space-y-6">
      <PageHeader
        title={locale === "fr" ? "Notifications" : "Notifications"}
        actions={
          <button onClick={() => markAllRead("customer")} className="text-sm text-blue-600">
            {locale === "fr" ? "Tout marquer lu" : "Mark all read"}
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
            <p className="font-medium">{locale === "fr" ? n.titleFr : n.title}</p>
            <p className="text-sm text-slate-500">{locale === "fr" ? n.bodyFr : n.body}</p>
            <p className="mt-1 text-xs text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
