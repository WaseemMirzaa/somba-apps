"use client";

import { Clock } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { countdownText, useNow } from "@/lib/seller-api";
import { cn } from "@/lib/utils";

/** "2 d 4 h left" / "Overdue" pill for a deadline (response time, clearance, campaign end). */
export function Countdown({ until, className }: { until: string | null | undefined; className?: string }) {
  const { locale } = useLocale();
  const now = useNow(30_000);
  const c = countdownText(until, now, locale === "fr");
  if (!c.text) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        c.overdue ? "bg-red-50 text-red-700 ring-1 ring-red-100" : c.urgent ? "bg-amber-50 text-amber-700 ring-1 ring-amber-100" : "bg-slate-100 text-slate-700",
        className,
      )}
    >
      <Clock className="h-3 w-3" aria-hidden="true" />
      {c.text}
    </span>
  );
}
