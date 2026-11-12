"use client";

import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { contactSupportHref, type ContactSupportContext } from "@/lib/contact-support";

/**
 * "Contact support": the one contact entry on the product, store, order and tracking pages. It opens a new support ticket with the
 * order or the product already filled in (customers no longer message sellers).
 */
export function ContactSupport({
  fr,
  className,
  label,
  primary,
  ...ctx
}: ContactSupportContext & { fr: boolean; className?: string; label?: string; primary?: boolean }) {
  return (
    <div className={className}>
      <Link
        href={contactSupportHref(ctx)}
        data-testid="contact-support"
        className={
          primary
            ? "btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm"
            : "inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50"
        }
      >
        <LifeBuoy className="h-4 w-4" aria-hidden="true" />
        {label ?? (fr ? "Contacter le support" : "Contact support")}
      </Link>
    </div>
  );
}
