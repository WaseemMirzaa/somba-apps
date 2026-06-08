"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useNotifications } from "@/context/notification-context";
import type { NotificationItem } from "@/lib/shared-entities";
import { cn } from "@/lib/utils";

export function NotificationBell({
  portal,
  href,
  className,
}: {
  portal: NotificationItem["portal"];
  href: string;
  className?: string;
}) {
  const { unreadCount } = useNotifications();
  const count = unreadCount(portal);

  return (
    <Link
      href={href}
      className={cn(
        "relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition hover:bg-slate-100",
        className
      )}
      aria-label="Notifications"
    >
      <Bell className="h-5 w-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
