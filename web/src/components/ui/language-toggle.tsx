"use client";

import { useLocale } from "@/context/locale-context";
import { cn } from "@/lib/utils";

/**
 * The EN / FR switch, same look as the one in the portal headers. It goes through `setLocale` of the shared locale
 * context, so the choice is saved in this browser and (signed in) on the account exactly like the header toggles.
 * For pages that have no header: sign-in, seller registration.
 */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const options = [
    { value: "en", label: "EN", name: "English" },
    { value: "fr", label: "FR", name: "Français" },
  ] as const;

  return (
    <div
      role="group"
      aria-label={locale === "fr" ? "Langue" : "Language"}
      className={cn("inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-white/95 p-1 shadow-sm backdrop-blur", className)}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setLocale(o.value)}
          aria-label={o.name}
          aria-pressed={locale === o.value}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-semibold transition-all",
            locale === o.value ? "bg-slate-100 text-[var(--primary)] shadow-sm" : "text-slate-500 hover:text-slate-800",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
