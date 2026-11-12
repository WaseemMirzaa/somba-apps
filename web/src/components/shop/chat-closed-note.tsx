"use client";

import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { contactSupportHref, type ContactSupportContext } from "@/lib/contact-support";

/** Shown above the old seller chats (read-only): messaging sellers is closed, KOMORIKO support helps instead. */
export function ChatClosedNote({ fr, ...ctx }: { fr: boolean } & ContactSupportContext) {
  return (
    <div role="note" data-testid="chat-closed-note" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="min-w-0 flex-1">
        {fr
          ? "La messagerie avec les vendeurs est fermée : ces anciens échanges sont en lecture seule. Pour toute question, contactez le support KOMORIKO."
          : "Messaging sellers is closed: these old chats are read-only. For any question, contact KOMORIKO support."}
      </p>
      <Link href={contactSupportHref(ctx)} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm">
        <LifeBuoy className="h-4 w-4" aria-hidden="true" />
        {fr ? "Contacter le support" : "Contact support"}
      </Link>
    </div>
  );
}
