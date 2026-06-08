"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { FAQ_ITEMS } from "@/lib/product-landing";
import { cn } from "@/lib/utils";

type FaqItem = { q: string; qFr: string; a: string; aFr: string };

export function FaqAccordion({ fr, items = FAQ_ITEMS }: { fr: boolean; items?: readonly FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-white">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-slate-50"
            >
              <span className="font-semibold text-slate-900">{fr ? item.qFr : item.q}</span>
              <ChevronDown className={cn("h-5 w-5 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-180")} />
            </button>
            {isOpen && (
              <div className="border-t border-[var(--border)] bg-slate-50/50 px-6 py-4 text-sm leading-relaxed text-slate-600">
                {fr ? item.aFr : item.a}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
