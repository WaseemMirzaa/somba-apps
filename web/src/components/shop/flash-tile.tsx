"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { FlashCountdown } from "@/components/shop/flash-countdown";
import { useFlashSales } from "@/lib/shop-engage";

/** The home page's offer tile: real running flash sales with the soonest ending countdown. */
export function FlashTile({ fr }: { fr: boolean }) {
  const { sales, fetchedAt } = useFlashSales();
  const running = sales.filter((s) => s.phase === "running");
  const soonest = [...running].sort((a, b) => (a.endsInMs ?? Infinity) - (b.endsInMs ?? Infinity))[0];
  return (
    <Link
      href="/shop/deals"
      className="showcase-card group relative flex flex-col justify-between bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] p-5 text-white"
    >
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ring-white/25">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--brand-red)] animate-pulse" />
        {fr ? "Ventes flash" : "Flash deals"}
      </span>
      <div>
        <p className="font-[family-name:var(--font-display)] text-2xl font-extrabold">
          {running.length > 0
            ? fr ? `${running.length} offre${running.length > 1 ? "s" : ""} en cours` : `${running.length} deal${running.length > 1 ? "s" : ""} live`
            : fr ? "Offres du moment" : "Today's deals"}
        </p>
        {soonest ? (
          <FlashCountdown sale={soonest} fetchedAt={fetchedAt} fr={fr} className="mt-0.5 inline-flex items-center gap-1 text-sm text-white/85 tabular-nums" />
        ) : (
          <p className="text-sm text-white/80">{fr ? "sur une sélection" : "on selected items"}</p>
        )}
        <span className="mt-2 inline-flex items-center gap-1 text-sm font-bold">
          {fr ? "Voir" : "Shop"} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </span>
      </div>
    </Link>
  );
}
