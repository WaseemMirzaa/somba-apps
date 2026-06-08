"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useNotifications } from "@/context/notification-context";
import { useLocale } from "@/context/locale-context";

export default function SellerNotificationsPage() {
  const { forPortal, markRead } = useNotifications();
  const { locale } = useLocale();
  const items = forPortal("seller");

  return (
    <div className="space-y-6">
      <PageHeader title={locale === "fr" ? "Notifications" : "Notifications"} />
      {items.map((n) => (
        <Link key={n.id} href={n.href ?? "#"} onClick={() => markRead(n.id)} className={`block rounded-xl border p-4 ${!n.read ? "border-sky-100 bg-sky-50/30" : ""}`}>
          <p className="font-medium">{locale === "fr" ? n.titleFr : n.title}</p>
          <p className="text-sm text-slate-500">{locale === "fr" ? n.bodyFr : n.body}</p>
        </Link>
      ))}
    </div>
  );
}
