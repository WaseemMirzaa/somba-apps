"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useNotifications } from "@/context/notification-context";
import { useLocale } from "@/context/locale-context";

export default function RiderNotificationsPage() {
  const { forPortal, markRead } = useNotifications();
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const items = forPortal("rider");

  return (
    <div className="space-y-6">
      <PageHeader title={t("notifications")} />
      {items.map((n) => (
        <Link key={n.id} href={n.href ?? "#"} onClick={() => markRead(n.id)} className={`block rounded-xl border p-4 ${!n.read ? "border-emerald-100 bg-emerald-50/30" : ""}`}>
          <p className="font-medium">{fr ? n.titleFr : n.title}</p>
          <p className="text-sm text-slate-500">{fr ? n.bodyFr : n.body}</p>
        </Link>
      ))}
    </div>
  );
}
