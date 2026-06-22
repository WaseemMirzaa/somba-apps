import Image from "next/image";
import { cn } from "@/lib/utils";

export const BRAND_LOGO_ALT = "S&T Marketplace";

type BrandMarkProps = {
  /** Adds a white tile behind raster logos on dark backgrounds. */
  tone?: "light" | "dark";
  /** Stacked hexagon lockup with MARKETPLACE wordmark. */
  full?: boolean;
  /** Hexagon mark only — for tight spaces (sidebar, mobile header). */
  iconOnly?: boolean;
  /** Always show the horizontal bag lockup at a compact height (portal chrome). */
  compact?: boolean;
  className?: string;
  /** Extra classes for the horizontal lockup wrapper (e.g. responsive visibility). */
  wordClassName?: string;
};

function logoSurface(tone: "light" | "dark") {
  return tone === "light" ? "rounded-xl bg-white px-2 py-1 shadow-sm" : "";
}

function HexagonIcon({ className, surface }: { className?: string; surface?: string }) {
  return (
    <span className={cn("relative block h-10 w-10 shrink-0 overflow-hidden rounded-lg", surface, className)}>
      {/* Frame the hexagon S&T mark (crops the "MARKETPLACE" sub-wordmark and
          surrounding whitespace) with enough margin that the mark never clips. */}
      <Image
        src="/brand/logo-stack.png"
        alt={BRAND_LOGO_ALT}
        fill
        priority
        className="origin-[50%_16%] scale-[1.5] object-cover"
        sizes="40px"
      />
    </span>
  );
}

function HorizontalLockup({
  className,
  surface,
  heightClass = "h-11",
}: {
  className?: string;
  surface?: string;
  heightClass?: string;
}) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", surface, className)}>
      <Image
        src="/brand/logo-horizontal.png"
        alt={BRAND_LOGO_ALT}
        width={180}
        height={80}
        priority
        className={cn("w-auto", heightClass)}
      />
    </span>
  );
}

/**
 * S&T Marketplace brand lockups — hexagon mark and shopping-bag horizontal lockup.
 */
export function BrandMark({
  tone = "dark",
  full = false,
  iconOnly = false,
  compact = false,
  className,
  wordClassName,
}: BrandMarkProps) {
  const surface = logoSurface(tone);

  if (full) {
    return (
      <span className={cn("inline-block", surface, className)}>
        <Image
          src="/brand/logo-stack.png"
          alt={BRAND_LOGO_ALT}
          width={220}
          height={150}
          priority
          className="h-auto w-[min(220px,78vw)]"
        />
      </span>
    );
  }

  if (iconOnly) {
    return <HexagonIcon className={className} surface={surface} />;
  }

  if (compact) {
    return <HorizontalLockup className={className} surface={surface} heightClass="h-9" />;
  }

  return (
    <span className={cn("flex items-center", className)}>
      <HexagonIcon className="sm:hidden" surface={surface} />
      <HorizontalLockup className={cn("hidden sm:inline-flex", wordClassName)} surface={surface} />
    </span>
  );
}
