/** Inline notice (info or warning) used across the admin pages. */
export function NoticeBar({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  return (
    <div
      className={
        tone === "warn"
          ? "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          : "rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-blue-800"
      }
    >
      {children}
    </div>
  );
}
