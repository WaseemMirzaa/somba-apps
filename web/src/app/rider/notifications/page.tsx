"use client";

import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { useNotifications } from "@/context/notification-context";

export default function RiderNotificationsPage() {
  const { forPortal, markRead } = useNotifications();
  const items = forPortal("rider");

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" />
      {items.map((n) => (
        <Link key={n.id} href={n.href ?? "#"} onClick={() => markRead(n.id)} className={`block rounded-xl border p-4 ${!n.read ? "border-emerald-100 bg-emerald-50/30" : ""}`}>
          <p className="font-medium">{n.title}</p>
          <p className="text-sm text-slate-500">{n.body}</p>
        </Link>
      ))}
    </div>
  );
}
