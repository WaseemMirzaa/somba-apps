import { ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  /** Color treatment for the wordmark text. */
  tone?: "light" | "dark";
  /** Show the full "Somba & Tekka" lockup instead of just "Somba". */
  full?: boolean;
  /** Hide the wordmark and render only the icon tile. */
  iconOnly?: boolean;
  className?: string;
  /** Extra classes for the wordmark text (e.g. responsive visibility). */
  wordClassName?: string;
};

/**
 * Somba & Tekka brand lockup — a royal-blue shopping-bag tile with the
 * signature red accent stripe, paired with the wordmark (red ampersand).
 */
export function BrandMark({ tone = "dark", full = false, iconOnly = false, className, wordClassName }: BrandMarkProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[var(--primary)] to-[var(--primary-dark)] shadow-md shadow-[var(--primary)]/25">
        <ShoppingBag className="h-5 w-5 text-white" strokeWidth={2.4} />
        <span className="absolute right-0 top-0 h-full w-[5px] bg-[var(--brand-red)]" aria-hidden />
      </span>
      {!iconOnly && (
        <span
          className={cn(
            "font-[family-name:var(--font-display)] text-xl font-extrabold tracking-tight",
            tone === "light" ? "text-white" : "text-[var(--primary)]",
            wordClassName
          )}
        >
          {full ? (
            <>
              Somba <span className="text-[var(--brand-red)]">&amp;</span> Tekka
            </>
          ) : (
            "Somba"
          )}
        </span>
      )}
    </span>
  );
}
