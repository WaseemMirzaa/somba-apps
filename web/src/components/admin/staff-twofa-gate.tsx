"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageLoader } from "@/components/ui/loader";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { ADMIN_ACCOUNT_PATH, staffTwoFaDecision, type StaffTwoFaStatus } from "@/lib/staff-twofa";

/**
 * Sends an admin to the account page to set up two-factor authentication when the platform requires it and they have
 * not. Until the status is known (one round trip) the page shows a loader, so no screen fires requests the server would refuse.
 */
export function StaffTwoFaGate({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const { status: socket } = useRealtime();
  const pathname = usePathname();
  const router = useRouter();
  // The status read for this path; null until known. A new path re-reads it, so enrolling lifts the hold on the next page.
  const [read, setRead] = useState<{ path: string; status: StaffTwoFaStatus | null } | null>(null);

  useEffect(() => {
    if (socket !== "connected") return;
    let alive = true;
    socketClient
      .request<StaffTwoFaStatus>("auth:2fa:status")
      .then((s) => alive && setRead({ path: pathname, status: s }))
      .catch(() => alive && setRead({ path: pathname, status: null }));
    return () => {
      alive = false;
    };
  }, [socket, pathname]);

  const decision = read && read.path === pathname ? staffTwoFaDecision(read.status, pathname) : null;

  useEffect(() => {
    if (decision === "enrol") router.replace(ADMIN_ACCOUNT_PATH);
  }, [decision, router]);

  // Not connected yet: the pages show their own loading state. Connected but status unknown, or being redirected: a loader.
  if (socket === "connected" && (decision === null || decision === "enrol")) {
    return <PageLoader locale={locale} label="Checking your account security…" labelFr="Vérification de la sécurité de votre compte…" />;
  }
  return <>{children}</>;
}
