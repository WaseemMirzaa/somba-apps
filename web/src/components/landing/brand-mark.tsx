import Image from "next/image";
import { cn } from "@/lib/utils";

type BrandMarkProps = {
  /** Color treatment for the wordmark text. */
  tone?: "light" | "dark";
  /** Show the full "Somba & Teka" lockup instead of just "Somba". */
  full?: boolean;
  /** Hide the wordmark and render only the icon tile. */
  iconOnly?: boolean;
  className?: string;
  /** Extra classes for the wordmark text (e.g. responsive visibility). */
  wordClassName?: string;
};

/**
 * Somba & Teka brand lockup — a royal-blue shopping-bag tile with the
 * signature red accent stripe, paired with the wordmark (red ampersand).
 */
export function BrandMark({ tone = "dark", full = false, iconOnly = false, className, wordClassName }: BrandMarkProps) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/logo.svg"
        alt="Somba & Teka"
        width={40}
        height={40}
        priority
        className="h-10 w-10 shrink-0 rounded-xl shadow-md shadow-[var(--logo-primary)]/25"
      />
      {!iconOnly && (
        <span
          className={cn(
            "font-[family-name:var(--font-display)] text-xl font-extrabold tracking-tight",
            tone === "light" ? "text-white" : "text-[var(--logo-primary)]",
            wordClassName
          )}
        >
          {full ? (
            <>
              Somba <span className="text-[var(--brand-red)]">&amp;</span> Teka
            </>
          ) : (
            "Somba"
          )}
        </span>
      )}
    </span>
  );
}
