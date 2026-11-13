"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { TranslatableText } from "@/components/shop/translatable-text";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { errMessage } from "@/lib/seller-labels";
import { localDateTime } from "@/lib/dates";
import type { CaseKind, ThreadMessage } from "@/lib/seller-aftersale";

/**
 * The PRIVATE thread between a store and KOMORIKO support about one return, exchange or replacement
 * (docs/contracts/admin-controls.md §13). The seller portal shows it as "Talk to support"; the admin desk as the "Seller thread"
 * pane next to the customer conversation. The customer never sees it. Live (`caseThread:message`), marks the other side's
 * messages read while it is open.
 */
export function CaseThreadPanel({
  kind,
  caseId,
  side,
  canWrite = true,
  onChanged,
}: {
  kind: CaseKind;
  caseId: string;
  /** Who is looking: the store ("seller") or KOMORIKO support ("support"). */
  side: "seller" | "support";
  canWrite?: boolean;
  /** The unread count may have changed (a message read or sent). */
  onChanged?: () => void;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const { toast } = useToast();
  const connected = rt.status === "connected";
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  });

  const markRead = useCallback(() => {
    // Finance reads without marking (the server answers 0): ignore any failure, the list is what matters.
    socketClient
      .request("caseThread:markRead", { kind, caseId })
      .then(() => changed.current?.())
      .catch(() => undefined);
  }, [kind, caseId]);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    (async () => {
      try {
        const rows = await socketClient.request<ThreadMessage[]>("caseThread:list", { kind, caseId });
        if (!alive) return;
        setMessages(rows);
        setError(null);
        markRead();
      } catch (e) {
        if (alive) setError(errMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [connected, kind, caseId, attempt, markRead]);

  useEffect(() => {
    if (!connected) return;
    const sock = socketClient.current;
    if (!sock) return;
    const onMessage = (m: ThreadMessage) => {
      if (m.caseId !== caseId || m.caseKind !== kind) return;
      setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      if (m.authorSide !== side) markRead();
    };
    sock.on("caseThread:message", onMessage);
    return () => {
      sock.off("caseThread:message", onMessage);
    };
  }, [connected, kind, caseId, side, markRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body) {
      toast(fr ? "Écrivez d'abord un message." : "Write a message first.", "error");
      return;
    }
    setSending(true);
    try {
      const m = await socketClient.request<ThreadMessage>("caseThread:send", { kind, caseId, text: body });
      setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
      setText("");
      toast(side === "seller" ? (fr ? "Message envoyé au support" : "Message sent to support") : fr ? "Message envoyé au vendeur" : "Message sent to the seller", "success");
      changed.current?.();
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setSending(false);
    }
  }

  const mineSide = side;
  return (
    <div className="space-y-3" data-testid="case-thread">
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {side === "seller"
          ? fr
            ? "Cette discussion est privée entre votre boutique et le support KOMORIKO. Le client ne la voit pas."
            : "This conversation is private between your store and KOMORIKO support. The customer cannot see it."
          : fr
            ? "Discussion privée avec le vendeur. Le client ne la voit pas ; elle est séparée de la conversation avec le client."
            : "Private conversation with the seller. The customer cannot see it; it is separate from the conversation with the customer."}
      </p>
      {loading && <p className="text-sm text-slate-400">{fr ? "Chargement…" : "Loading…"}</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}{" "}
          <button type="button" className="font-semibold underline" onClick={() => { setLoading(true); setAttempt((n) => n + 1); }}>
            {fr ? "Réessayer" : "Retry"}
          </button>
        </p>
      )}
      {!loading && !error && messages.length === 0 && <p className="text-sm text-slate-400">{fr ? "Aucun message pour l'instant." : "No messages yet."}</p>}
      <div className="max-h-96 space-y-2 overflow-y-auto" data-testid="case-thread-messages">
        {messages.map((m) => {
          const mine = m.authorSide === mineSide;
          return (
            <div key={m.id} className={`rounded-xl p-3 text-sm ${mine ? "bg-blue-50" : "bg-slate-50"}`}>
              <p className="text-xs font-semibold text-slate-700">
                {mine ? (fr ? "Vous" : "You") : m.authorSide === "support" ? "KOMORIKO" : m.authorName}
                <span className="ml-1 font-normal text-slate-500">
                  · {m.authorSide === "support" ? (fr ? "Support" : "Support") : fr ? "Vendeur" : "Seller"} · {localDateTime(m.createdAt)}
                </span>
              </p>
              {mine ? (
                <p className="mt-1 whitespace-pre-line text-slate-800">{m.text}</p>
              ) : (
                <TranslatableText kind="case_seller_message" id={m.id} auto text={m.text} i18n={m.textI18n} className="mt-1 whitespace-pre-line text-slate-800" />
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      {canWrite ? (
        <div className="space-y-2">
          <textarea
            className="input-premium w-full px-3 py-2 text-sm"
            rows={3}
            maxLength={2000}
            aria-label={fr ? "Votre message" : "Your message"}
            placeholder={side === "seller" ? (fr ? "Écrire au support KOMORIKO…" : "Write to KOMORIKO support…") : fr ? "Répondre au vendeur…" : "Reply to the seller…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button size="sm" onClick={() => void send()} disabled={sending}>
            {sending ? "…" : fr ? "Envoyer" : "Send"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">{fr ? "Lecture seule." : "Read-only."}</p>
      )}
    </div>
  );
}
