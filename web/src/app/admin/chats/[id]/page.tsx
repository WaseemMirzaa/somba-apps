"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { TranslatableText } from "@/components/shop/translatable-text";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useRole, assetUrl } from "@/lib/admin-live";
import { canReadChats } from "@/lib/admin-controls";
import { chatOlderBody, prependOlder, type AdminChatThread } from "@/lib/admin-chats";
import { localDateTime } from "@/lib/dates";
import { localized } from "@/lib/i18n-fields";
import { socketClient } from "@/lib/realtime/socket-client";

/** One old customer-seller chat, read-only (no composer, nothing is marked read). */
export default function AdminChatThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const role = useRole();
  const allowed = canReadChats(role);
  const [thread, setThread] = useState<AdminChatThread | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [older, setOlder] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const connected = rt.status === "connected";

  const load = useCallback(async () => {
    try {
      setThread(await socketClient.request<AdminChatThread>("chat:adminMessages", { conversationId: id, limit: 50 }));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [id]);

  useEffect(() => {
    if (!connected || !allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the conversation once connected
    void load();
  }, [connected, allowed, load]);

  const count = thread?.messages.length ?? 0;
  useEffect(() => {
    if (count > 0 && !older) bottom.current?.scrollIntoView({ block: "end" });
  }, [count, older]);

  if (!allowed) return <div className="p-8 text-center text-slate-500">{fr ? "Action non autorisée." : "Not allowed."}</div>;
  if (error && !thread) return <SectionError message={error} onRetry={() => void load()} />;
  if (!thread) return <SectionLoading className="min-h-[40vh]" />;
  const { conversation: c, messages, hasMore } = thread;

  async function loadOlder() {
    setOlder(true);
    try {
      const page = await socketClient.request<AdminChatThread>("chat:adminMessages", chatOlderBody(id, messages));
      setThread((cur) => (cur ? { ...cur, messages: prependOlder(cur.messages, page.messages), hasMore: page.hasMore } : cur));
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={`${c.buyerName} ↔ ${c.storeName}`}
        subtitle={[c.productName ? localized(c, "productName", fr) : null, c.orderReference].filter(Boolean).join(" · ") || (fr ? "Conversation" : "Conversation")}
        backHref="/admin/chats"
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Conversations" : "Chats", href: "/admin/chats" }, { label: c.storeName }]}
        actions={
          <div className="flex gap-3 text-sm">
            <Link href={`/admin/customers/${c.buyerId}`} className="text-[var(--primary)] hover:underline">{fr ? "Client" : "Customer"}</Link>
            <Link href={`/admin/sellers/${c.sellerId}`} className="text-[var(--primary)] hover:underline">{fr ? "Boutique" : "Store"}</Link>
            {c.orderId && <Link href={`/admin/orders/${c.orderId}`} className="text-[var(--primary)] hover:underline">{fr ? "Commande" : "Order"}</Link>}
          </div>
        }
      />
      <p role="note" data-testid="chat-read-only" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {fr ? "Lecture seule : la messagerie avec les vendeurs est fermée. Rien ne peut être envoyé depuis cette page." : "Read-only: messaging sellers is closed. Nothing can be sent from this page."}
      </p>
      <Card>
        <CardContent className="p-5">
          <div className="space-y-3" data-testid="admin-chat-thread">
          {hasMore && (
            <button type="button" onClick={() => void loadOlder()} className="mx-auto block text-xs font-medium text-[var(--primary)] hover:underline">
              {fr ? "Messages précédents" : "Earlier messages"}
            </button>
          )}
          {messages.length === 0 && <p className="text-sm text-slate-400">{fr ? "Aucun message." : "No messages."}</p>}
          {messages.map((m) => {
            const fromStore = m.senderSide === "seller";
            return (
              <div key={m.id} className={`flex ${fromStore ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${fromStore ? "bg-slate-200 text-slate-900" : "bg-blue-50 text-slate-900"}`}>
                  <p className="mb-0.5 text-xs font-semibold text-slate-600">{m.senderName} · {fromStore ? (fr ? "Boutique" : "Store") : fr ? "Client" : "Customer"}</p>
                  {m.text && <TranslatableText kind="chat_message" id={m.id} auto text={m.text} i18n={m.textI18n} className="whitespace-pre-wrap break-words" />}
                  {m.attachments?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {m.attachments.map((u) => (
                        <a key={u} href={assetUrl(u)} target="_blank" rel="noopener noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg bg-white/40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={assetUrl(u)} alt={fr ? "Photo jointe" : "Attached photo"} className="h-full w-full object-cover" loading="lazy" />
                        </a>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 text-[11px] text-slate-500">{localDateTime(m.createdAt)}</p>
                </div>
              </div>
            );
          })}
          <div ref={bottom} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
