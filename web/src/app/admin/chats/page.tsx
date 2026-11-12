"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SectionError, SectionLoading, EmptyState } from "@/components/admin/query-state";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useRole } from "@/lib/admin-live";
import { canReadChats } from "@/lib/admin-controls";
import { CHAT_PAGE, chatListBody, type AdminConversation } from "@/lib/admin-chats";
import { localDateTime } from "@/lib/dates";
import { localized } from "@/lib/i18n-fields";
import { socketClient } from "@/lib/realtime/socket-client";
import { previewText } from "@/lib/text-i18n";

/** Old customer-seller chats, newest activity first. Read-only: messaging sellers is closed. */
export default function AdminChatsPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const role = useRole();
  const allowed = canReadChats(role);
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [rows, setRows] = useState<AdminConversation[] | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const connected = rt.status === "connected";

  const load = useCallback(async (offset: number, query: string, append: boolean) => {
    try {
      const list = await socketClient.request<AdminConversation[]>("chat:adminList", chatListBody(query, offset));
      const page = Array.isArray(list) ? list : [];
      setRows((cur) => (append && cur ? [...cur, ...page.filter((r) => !cur.some((c) => c.id === r.id))] : page));
      setMore(page.length >= CHAT_PAGE);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    if (!connected || !allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first read, and again when the search changes
    void load(0, applied, false);
  }, [connected, allowed, applied, load]);

  if (!allowed) return <div className="p-8 text-center text-slate-500">{fr ? "Action non autorisée." : "Not allowed."}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Conversations (lecture seule)" : "Chats (read-only)"}
        subtitle={fr ? "Anciens échanges entre clients et vendeurs. La messagerie est fermée : les clients passent par le support." : "Old conversations between customers and sellers. Messaging is closed: customers contact support."}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Conversations" : "Chats" }]}
      />
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setRows(null);
          setApplied(q.trim());
        }}
      >
        <input
          className="input-premium min-w-[16rem] flex-1 px-3 py-2 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={fr ? "Nom du client ou de la boutique…" : "Customer or store name…"}
          aria-label={fr ? "Rechercher" : "Search"}
        />
        <Button type="submit" size="sm" variant="secondary">{fr ? "Rechercher" : "Search"}</Button>
      </form>

      {error && !rows ? (
        <SectionError message={error} onRetry={() => void load(0, applied, false)} />
      ) : !rows ? (
        <SectionLoading className="min-h-[20vh]" />
      ) : rows.length === 0 ? (
        <EmptyState>{fr ? "Aucune conversation." : "No conversations."}</EmptyState>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100" data-testid="admin-chat-list">
            {rows.map((c) => (
              <Link key={c.id} href={`/admin/chats/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><MessageCircle className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-900">{c.buyerName} ↔ {c.storeName}</span>
                    <span className="shrink-0 text-xs text-slate-500">{c.lastMessageAt ? localDateTime(c.lastMessageAt) : ""}</span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {c.productName ? `${localized(c, "productName", fr)} · ` : ""}
                    {c.orderReference ? `${c.orderReference} · ` : ""}
                    {previewText(c.lastMessageI18n, locale, c.lastMessagePreview)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{c.messageCount}</span>
              </Link>
            ))}
            </div>
          </CardContent>
        </Card>
      )}
      {more && rows && (
        <div className="text-center">
          <Button
            variant="secondary"
            size="sm"
            disabled={loadingMore}
            onClick={async () => {
              setLoadingMore(true);
              await load(rows.length, applied, true);
              setLoadingMore(false);
            }}
          >
            {loadingMore ? "…" : fr ? "Voir plus" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}
