"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Languages, Lock, MessageCircle, Package, Receipt, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadError, SectionLoader } from "@/components/seller/data-state";
import { AttachmentGallery, AttachmentPicker } from "@/components/seller/attachments";
import { ProductImage } from "@/components/seller/product-image";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { useSellerAccess } from "@/lib/seller";
import { assetUrl, sellerRequest, useLiveQuery, useSocketEvent } from "@/lib/seller-api";
import { errMessage } from "@/lib/seller-labels";
import {
  agoText,
  CHAT_MAX_CHARS,
  CHAT_MAX_PHOTOS,
  type ChatConversation,
  type ChatMessage,
} from "@/lib/seller-engage";
import { cn } from "@/lib/utils";

const PAGE = 30;

/** Context chips of a conversation: the product and / or order it started from. */
function ContextChips({ c, fr }: { c: ChatConversation; fr: boolean }) {
  return (
    <>
      {c.productName && (
        <span className="inline-flex max-w-[14rem] items-center gap-1 truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          <Package className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{c.productName}</span>
        </span>
      )}
      {c.orderReference && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          <Receipt className="h-3 w-3 shrink-0" aria-hidden="true" />
          {fr ? "Commande" : "Order"} {c.orderReference}
        </span>
      )}
    </>
  );
}

// ─── Inbox ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export function ChatInbox() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(50);
  const list = useLiveQuery<ChatConversation[]>("chat:list", { as: "seller", limit }, { pushes: ["chat:message", "chat:read"], debounceMs: 200 });
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data ?? []).filter(
      (c) =>
        (!unreadOnly || c.unread > 0) &&
        (!needle || [c.buyerName, c.productName, c.orderReference, c.lastMessagePreview].some((v) => (v ?? "").toLowerCase().includes(needle))),
    );
  }, [list.data, unreadOnly, q]);
  const unreadTotal = (list.data ?? []).reduce((n, c) => n + c.unread, 0);

  return (
    <div className="space-y-4">
      {list.error && <LoadError message={list.error} onRetry={list.reload} />}
      <div className="card-premium flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1.5 block text-xs font-medium text-slate-600">{fr ? "Rechercher" : "Search"}</label>
          <input type="search" className="input-premium w-full px-3 py-2 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={fr ? "Client, produit, commande…" : "Customer, product, order…"} />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          {fr ? `Non lus (${unreadTotal})` : `Unread (${unreadTotal})`}
        </label>
      </div>
      {list.loading ? (
        <SectionLoader />
      ) : rows.length === 0 ? (
        <EmptyState>
          {(list.data ?? []).length === 0
            ? fr ? "Aucune conversation. Quand un client vous écrit depuis une page produit ou une commande, elle apparaît ici en direct." : "No conversations yet. When a customer writes to you from a product or an order, it appears here live."
            : fr ? "Aucune conversation ne correspond." : "No conversation matches."}
        </EmptyState>
      ) : (
        <ul className="card-premium divide-y divide-slate-100 overflow-hidden p-0" data-testid="chat-list">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/seller/messages/${c.id}`} className={cn("flex items-start gap-3 px-4 py-3 hover:bg-slate-50", c.unread > 0 && "bg-sky-50/40")}>
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                  {c.productImage ? <ProductImage src={assetUrl(c.productImage)} alt="" /> : (c.buyerName || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-sm", c.unread > 0 ? "font-bold text-slate-900" : "font-semibold text-slate-800")}>{c.buyerName}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{agoText(c.lastMessageAt, fr)}</span>
                  </span>
                  <span className={cn("block truncate text-sm", c.unread > 0 ? "text-slate-800" : "text-slate-500")}>{c.lastMessagePreview || "…"}</span>
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    <ContextChips c={c} fr={fr} />
                  </span>
                </span>
                {c.unread > 0 && (
                  <span aria-label={fr ? `${c.unread} non lu(s)` : `${c.unread} unread`} className="mt-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--primary)] px-1.5 text-[11px] font-bold text-white">
                    {c.unread}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(list.data?.length ?? 0) >= limit && (
        <div className="text-center">
          <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + 50)} disabled={list.refreshing}>
            {fr ? "Voir plus" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Thread ─────────────────────────────────────────────────────────────────────────────────────────────────────────
interface Translation {
  busy: boolean;
  shown: boolean;
  text?: string;
  same?: boolean;
}

export function ChatThread({ id }: { id: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const access = useSellerAccess();
  const { status } = useRealtime();
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [tr, setTr] = useState<Record<string, Translation>>({});
  const bottom = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const markRead = useCallback(() => {
    void sellerRequest("chat:markRead", { conversationId: id }).catch(() => undefined);
  }, [id]);

  const load = useCallback(async () => {
    try {
      const r = await sellerRequest<{ conversation: ChatConversation; messages: ChatMessage[]; hasMore: boolean }>("chat:messages", { conversationId: id, limit: PAGE });
      setError(null);
      setConversation(r.conversation);
      setMessages(r.messages);
      setHasMore(r.hasMore);
      markRead();
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, markRead]);

  // First read, and again whenever the socket (re)connects: whatever arrived while offline is read back.
  useEffect(() => {
    if (status !== "connected") return;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [status, load]);
  useSocketEvent<{ conversation: ChatConversation; message: ChatMessage }>("chat:message", (p) => {
    if (!p?.message || p.message.conversationId !== id) return;
    setConversation((c) => (c ? { ...c, ...p.conversation, unread: 0 } : c));
    setMessages((cur) => (cur.some((m) => m.id === p.message.id) ? cur : [...cur, p.message]));
    stick.current = true;
    if (p.message.senderSide === "buyer") markRead();
  });
  useSocketEvent<{ conversationId: string; side: string }>("chat:read", (p) => {
    if (p?.conversationId === id && p.side === "buyer") setSeenAt(new Date().toISOString());
  });

  useEffect(() => {
    if (stick.current) bottom.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  async function older() {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    stick.current = false;
    try {
      const r = await sellerRequest<{ messages: ChatMessage[]; hasMore: boolean }>("chat:messages", { conversationId: id, before: messages[0].id, limit: PAGE });
      setMessages((cur) => [...r.messages.filter((m) => !cur.some((x) => x.id === m.id)), ...cur]);
      setHasMore(r.hasMore);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const body = text.trim();
    if ((!body && photos.length === 0) || sending) return;
    if (body.length > CHAT_MAX_CHARS) return;
    setSending(true);
    setSendError(null);
    try {
      const r = await sellerRequest<{ message: ChatMessage }>("chat:send", { conversationId: id, text: body, ...(photos.length ? { attachments: photos } : {}) });
      setMessages((cur) => (cur.some((m) => m.id === r.message.id) ? cur : [...cur, r.message]));
      stick.current = true;
      setText("");
      setPhotos([]);
    } catch (e) {
      const msg = errMessage(e);
      setSendError(msg);
      toast(msg, "error");
    } finally {
      setSending(false);
    }
  }

  async function translate(m: ChatMessage) {
    const cur = tr[m.id];
    if (cur?.shown) {
      setTr((t) => ({ ...t, [m.id]: { ...cur, shown: false } }));
      return;
    }
    if (cur?.text !== undefined) {
      setTr((t) => ({ ...t, [m.id]: { ...cur, shown: true } }));
      return;
    }
    setTr((t) => ({ ...t, [m.id]: { busy: true, shown: false } }));
    try {
      const r = await sellerRequest<{ text: string; sourceLang?: string; same?: boolean }>("translate:text", { kind: "chat_message", id: m.id, target: fr ? "fr" : "en" });
      setTr((t) => ({ ...t, [m.id]: { busy: false, shown: !r.same, text: r.text, same: !!r.same } }));
    } catch (e) {
      setTr((t) => ({ ...t, [m.id]: { busy: false, shown: false } }));
      toast(errMessage(e), "error");
    }
  }

  const lastOwnId = [...messages].reverse().find((m) => m.senderSide === "seller")?.id;
  const readOnly = access.suspended || !access.can("support");

  if (loading) return <SectionLoader />;
  if (error && !conversation) return <LoadError message={error} onRetry={load} />;
  if (!conversation) return <EmptyState>{fr ? "Conversation introuvable." : "Conversation not found."}</EmptyState>;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => router.push("/seller/messages")} className="mt-1 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50" aria-label={fr ? "Retour aux messages" : "Back to messages"}>
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-slate-900">{conversation.buyerName}</h1>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <ContextChips c={conversation} fr={fr} />
            {conversation.orderReference && (
              <Link href={`/seller/orders/${conversation.orderReference}`} className="text-xs font-medium text-[var(--primary)] hover:underline">
                {fr ? "Voir la commande" : "View order"}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="card-premium space-y-3 p-4" data-testid="chat-thread">
        {hasMore && (
          <div className="text-center">
            <Button size="sm" variant="secondary" onClick={() => void older()} disabled={loadingOlder}>
              {loadingOlder ? (fr ? "Chargement…" : "Loading…") : fr ? "Messages précédents" : "Load older messages"}
            </Button>
          </div>
        )}
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-500">
            <MessageCircle className="mx-auto mb-1 h-5 w-5 text-slate-300" aria-hidden="true" />
            {fr ? "Aucun message pour le moment." : "No messages yet."}
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderSide === "seller";
          const t = tr[m.id];
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")} data-testid={mine ? "msg-mine" : "msg-theirs"}>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-2 text-sm", mine ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-slate-800")}>
                <p className={cn("text-[10px] font-semibold uppercase tracking-wide", mine ? "text-white/70" : "text-slate-500")}>
                  {mine ? m.senderName || (fr ? "Vous" : "You") : m.senderName} · {new Date(m.createdAt).toLocaleString(locale)}
                </p>
                {m.text && <p className="mt-1 whitespace-pre-wrap break-words">{m.text}</p>}
                {t?.shown && t.text !== undefined && (
                  <p className="mt-1 whitespace-pre-wrap break-words border-t border-slate-300/60 pt-1 text-slate-700" data-testid="msg-translation">
                    {t.text}
                  </p>
                )}
                {m.attachments?.length > 0 && <AttachmentGallery urls={m.attachments} className="mt-2" />}
                {!mine && m.text && (
                  <button type="button" onClick={() => void translate(m)} disabled={t?.busy} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[var(--primary)] hover:underline disabled:opacity-60">
                    <Languages className="h-3 w-3" aria-hidden="true" />
                    {t?.busy
                      ? fr ? "Traduction…" : "Translating…"
                      : t?.shown
                        ? fr ? "Voir l'original" : "Show original"
                        : t?.same
                          ? fr ? "Déjà dans votre langue" : "Already in your language"
                          : fr ? "Traduire" : "Translate"}
                  </button>
                )}
                {mine && m.id === lastOwnId && seenAt && seenAt > m.createdAt && (
                  <p className="mt-0.5 text-right text-[10px] text-white/70">{fr ? "Vu" : "Seen"}</p>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      {readOnly ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {access.suspended
            ? fr ? "Votre boutique est suspendue : vous pouvez lire les messages mais pas répondre." : "Your store is suspended: you can read messages but not reply."
            : fr ? "Votre rôle d'équipe ne permet pas de répondre aux clients." : "Your team role does not allow replying to customers."}
        </p>
      ) : (
        <div className="space-y-2">
          <textarea
            className="input-premium w-full px-3 py-2 text-sm"
            rows={3}
            value={text}
            onChange={(e) => { setText(e.target.value); setSendError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send(); }}
            placeholder={fr ? "Votre message…" : "Your message…"}
            aria-label={fr ? "Votre message" : "Your message"}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <AttachmentPicker value={photos} onChange={setPhotos} max={CHAT_MAX_PHOTOS} disabled={sending} />
            <span className={cn("text-xs", text.length > CHAT_MAX_CHARS ? "text-red-600" : "text-slate-500")}>
              {text.length}/{CHAT_MAX_CHARS}
            </span>
          </div>
          {sendError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{sendError}</p>}
          <Button onClick={() => void send()} disabled={sending || (!text.trim() && photos.length === 0) || text.length > CHAT_MAX_CHARS}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {sending ? (fr ? "Envoi…" : "Sending…") : fr ? "Envoyer" : "Send"}
          </Button>
        </div>
      )}
    </div>
  );
}
