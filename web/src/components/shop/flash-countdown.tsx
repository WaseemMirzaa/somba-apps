"use client";

import { Timer } from "lucide-react";
import { formatCountdown, remainingMs, useNow, type FlashSale } from "@/lib/shop-engage";

/** A ticking "ends in 02:14:09" / "starts in …" label for a flash sale (client clock, anchored on the server's value). */
export function FlashCountdown({
  sale,
  fetchedAt,
  fr,
  className,
}: {
  sale: FlashSale;
  fetchedAt: number;
  fr: boolean;
  className?: string;
}) {
  const now = useNow();
  const ms = remainingMs(sale, fetchedAt, now);
  const scheduled = sale.phase === "scheduled";
  return (
    <span className={className ?? "inline-flex items-center gap-1 text-xs font-semibold tabular-nums"} data-testid="flash-countdown" data-ms={ms}>
      <Timer className="h-3.5 w-3.5" aria-hidden="true" />
      {scheduled ? (fr ? "Débute dans " : "Starts in ") : fr ? "Se termine dans " : "Ends in "}
      {formatCountdown(ms, fr)}
    </span>
  );
}
