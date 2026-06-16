"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";

type ChatMessage = { from: "buyer" | "seller" | "admin"; text: string; at: string };

const FROM_LABELS: Record<ChatMessage["from"], string> = {
  buyer: "Buyer",
  seller: "Seller",
  admin: "Admin",
};

const FROM_LABELS_FR: Record<ChatMessage["from"], string> = {
  buyer: "Acheteur",
  seller: "Vendeur",
  admin: "Admin",
};

const FROM_STYLES: Record<ChatMessage["from"], string> = {
  buyer: "mr-auto bg-blue-50 border-blue-100",
  seller: "mr-auto bg-slate-50 border-slate-200",
  admin: "ml-auto bg-emerald-50 border-emerald-100",
};

function formatMessageTime(at: string) {
  try {
    return new Date(at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return at;
  }
}

export function DisputeChat({
  messages,
  onSend,
  placeholder,
  disabled,
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const resolvedPlaceholder =
    placeholder ?? (fr ? "Tapez un message en tant qu'admin…" : "Type a message as admin…");
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = scrollRef.current;
    if (!panel) return;
    panel.scrollTop = panel.scrollHeight;
  }, [messages.length]);

  function send() {
    const text = draft.trim();
    if (!text || disabled) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex h-[520px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      <div className="shrink-0 border-b border-[var(--border)] bg-slate-50/80 px-5 py-4">
        <p className="text-sm font-semibold text-slate-900">{fr ? "Discussion du litige" : "Dispute chat"}</p>
        <p className="text-xs text-slate-500">
          {messages.length} message{messages.length !== 1 ? "s" : ""} ·{" "}
          {fr ? "Fil acheteur, vendeur et admin" : "Buyer, seller & admin thread"}
        </p>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4"
      >
        {messages.length === 0 ? (
          <p className="text-center text-sm text-slate-400">{fr ? "Aucun message pour le moment." : "No messages yet."}</p>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.at}-${index}`}
              className={cn("max-w-[85%] rounded-xl border px-4 py-3", FROM_STYLES[message.from])}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {(fr ? FROM_LABELS_FR : FROM_LABELS)[message.from]}
                </span>
                <span className="text-xs text-slate-400">{formatMessageTime(message.at)}</span>
              </div>
              <p className="text-sm leading-relaxed text-slate-800">{message.text}</p>
            </div>
          ))
        )}
      </div>

      {!disabled && (
        <div className="shrink-0 border-t border-[var(--border)] bg-slate-50/50 p-4">
          <div className="flex gap-3">
            <textarea
              className="input-premium min-h-[48px] flex-1 resize-none px-3 py-2.5 text-sm"
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={resolvedPlaceholder}
            />
            <Button onClick={send} className="shrink-0 self-end px-4" disabled={!draft.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
