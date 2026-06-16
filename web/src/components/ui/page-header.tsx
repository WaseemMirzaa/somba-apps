import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Breadcrumb } from "./breadcrumb";

export function PageHeader({
  title,
  subtitle,
  backHref,
  breadcrumbs,
  actions,
}: {
  title?: string;
  subtitle?: string;
  backHref?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
      {(title || actions) && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {backHref && (
              <Link
                href={backHref}
                className="mt-1 rounded-xl border border-[var(--border)] bg-white p-2.5 text-slate-500 shadow-sm transition-colors hover:border-blue-200 hover:text-[var(--primary)]"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
            )}
            {title && (
              <div>
                <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">
                  {title}
                </h1>
                {subtitle && <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p>}
              </div>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
    </div>
  );
}
