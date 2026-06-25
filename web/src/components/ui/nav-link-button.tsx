import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A navigation link that stays a plain inline text link on desktop (so the
 * desktop UI is unchanged) but renders as a clear, tappable pill button on
 * phones (below the `lg` breakpoint). Use for the "View all" / "Voir tout"
 * card-header links and detail-page cross-links that otherwise give mobile
 * users no real tap target.
 */
export function NavLinkButton({
  href,
  children,
  className,
  onClick,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        // Mobile (< lg): tinted pill with a comfortable tap target.
        "inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border border-[var(--primary)]/25 bg-[var(--primary-light)] px-3 py-1.5 text-xs font-semibold text-[var(--nav-accent)] transition-colors hover:bg-[var(--primary-tint)]",
        // Desktop (lg+): revert to the original inline text-link look (brand red).
        "lg:min-h-0 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:text-[var(--primary)] lg:hover:bg-transparent lg:hover:underline",
        className
      )}
    >
      {children}
    </Link>
  );
}
