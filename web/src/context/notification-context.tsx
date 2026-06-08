"use client";

import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { MOCK_NOTIFICATIONS, type NotificationItem } from "@/lib/shared-entities";

type NotificationPortal = NotificationItem["portal"];

type NotificationContextType = {
  notifications: NotificationItem[];
  unreadCount: (portal: NotificationPortal) => number;
  markRead: (id: string) => void;
  markAllRead: (portal: NotificationPortal) => void;
  forPortal: (portal: NotificationPortal) => NotificationItem[];
};

const NotificationContext = createContext<NotificationContextType | null>(null);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState(MOCK_NOTIFICATIONS);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  }, []);

  const markAllRead = useCallback((portal: NotificationPortal) => {
    setNotifications((prev) =>
      prev.map((n) => (n.portal === portal ? { ...n, read: true } : n))
    );
  }, []);

  const forPortal = useCallback(
    (portal: NotificationPortal) => notifications.filter((n) => n.portal === portal),
    [notifications]
  );

  const unreadCount = useCallback(
    (portal: NotificationPortal) => notifications.filter((n) => n.portal === portal && !n.read).length,
    [notifications]
  );

  const value = useMemo(
    () => ({ notifications, unreadCount, markRead, markAllRead, forPortal }),
    [notifications, unreadCount, markRead, markAllRead, forPortal]
  );

  return (
    <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
}
