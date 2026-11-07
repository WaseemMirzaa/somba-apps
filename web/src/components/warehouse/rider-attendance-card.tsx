"use client";

import { Badge } from "@/components/ui/badge";
import { DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { useRealtime } from "@/context/realtime-context";
import { useLocale } from "@/context/locale-context";
import { localDateTime } from "@/lib/dates";
import { formatWorked, mayReadAttendance, statusLabel, statusVariant, type Attendance } from "@/lib/rider-attendance";
import { useOpsQuery } from "@/lib/warehouse-live";

/**
 * Attendance of one rider on the staff rider page (warehouse portal and admin fulfilment share it): currently on shift,
 * the last shift, and the hours of the last 7 days. Read from `attendance:rider`; it follows `attendance:updated` live.
 * The server decides who may read (Operations admins; supervisors and managers of the rider's warehouse).
 */
export function RiderAttendanceCard({ riderId }: { riderId: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const allowed = mayReadAttendance(rt.user?.role);
  const q = useOpsQuery<Attendance | null>("attendance:rider", {
    body: { riderId },
    push: ["attendance:updated"],
    initial: null,
    enabled: allowed,
  });
  if (!allowed) return null;

  const a = q.data;
  const title = fr ? "Présence" : "Attendance";
  if (!a) {
    return (
      <DetailGridSection title={title}>
        <p className="text-sm text-slate-500" role={q.error ? "alert" : undefined}>
          {q.error ?? (fr ? "Chargement…" : "Loading…")}
        </p>
      </DetailGridSection>
    );
  }

  const last = a.lastShift;
  return (
    <DetailGridSection title={title}>
      <InfoGrid
        items={[
          {
            label: fr ? "Actuellement en service" : "Currently on shift",
            value: <Badge variant={statusVariant(a.status)}>{statusLabel(a.status, fr)}</Badge>,
          },
          {
            label: fr ? "Début du service" : "On shift since",
            value: a.current ? localDateTime(a.current.startedAt) : "—",
          },
          {
            label: fr ? "Heures sur 7 jours" : "Hours, last 7 days",
            value: `${formatWorked(a.minutesLast7Days)} (${a.shiftsLast7Days} ${fr ? "services" : a.shiftsLast7Days === 1 ? "shift" : "shifts"})`,
          },
          {
            label: fr ? "Dernier service" : "Last shift",
            value: last?.endedAt ? (
              <span>
                {localDateTime(last.startedAt)} → {localDateTime(last.endedAt)} · {formatWorked(last.workedMinutes)}
                {last.endReason === "auto" ? (
                  <span className="ml-1 text-slate-500">({fr ? "clôturé automatiquement" : "closed automatically"})</span>
                ) : null}
              </span>
            ) : (
              "—"
            ),
            full: true,
          },
        ]}
      />
    </DetailGridSection>
  );
}
