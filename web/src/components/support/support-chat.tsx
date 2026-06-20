"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Paperclip, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/context/locale-context";
import type { SupportMessage, SupportSender, SupportAttachment } from "@/lib/support-tickets";

const FROM_LABELS: Record<SupportSender, { en: string; fr: string }> = {
  customer: { en: "Customer", fr: "Client" },
  seller: { en: "Seller", fr: "Vendeur" },
  admin: { en: "Support", fr: "Support" },
};

const FROM_STYLES: Record<SupportSender, string> = {
  customer: "bg-blue-50 border-blue-100",
  seller: "bg-slate-50 border-slate-200",
  admin: "bg-emerald-50 border-emerald-100",
};

function formatTime(at: string) {
  try {
    return new Date(at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return at;
  }
}

/**
 * Reusable support conversation. `perspective` is the current viewer's role —
 * their own messages align right; everyone else aligns left. The message area
 * scrolls independently and the whole thing is responsive.
 */
export function SupportChat({
  messages,
  perspective,
  onSend,
  disabled,
}: {
  messages: SupportMessage[];
  perspective: SupportSender;
  onSend: (text: string, attachments: SupportAttachment[]) => void;
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<SupportAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const panel = scrollRef.current;
    if (panel) panel.scrollTop = panel.scrollHeight;
  }, [messages.length]);

  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () =>
        setPending((prev) => [
          ...prev,
          { name: file.name, kind: file.type.startsWith("image/") ? "image" : "file", url: String(reader.result) },
        ]);
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  }

  function send() {
    const text = draft.trim();
    if ((!text && pending.length === 0) || disabled) return;
    onSend(text, pending);
    setDraft("");
    setPending([]);
  }

  return (
    <div className="flex h-[70vh] max-h-[640px] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-white shadow-sm">
      <div className="shrink-0 border-b border-[var(--border)] bg-slate-50/80 px-4 py-3 sm:px-5">
        <p className="text-sm font-semibold text-slate-900">{fr ? "Conversation" : "Conversation"}</p>
        <p className="text-xs text-slate-500">
          {messages.length} message{messages.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">{fr ? "Aucun message pour le moment." : "No messages yet."}</p>
        ) : (
          messages.map((m, i) => {
            const mine = m.from === perspective;
            return (
              <div
                key={`${m.at}-${i}`}
                className={cn("max-w-[88%] rounded-xl border px-3 py-2.5 sm:px-4 sm:py-3", FROM_STYLES[m.from], mine ? "ml-auto" : "mr-auto")}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    {mine ? (fr ? "Vous" : "You") : (fr ? FROM_LABELS[m.from].fr : FROM_LABELS[m.from].en)}
                  </span>
                  <span className="text-xs text-slate-400">{formatTime(m.at)}</span>
                </div>
                {m.text && <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{fr ? (m.textFr ?? m.text) : m.text}</p>}
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.attachments.map((a, ai) =>
                      a.kind === "image" && a.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={ai} src={a.url} alt={a.name} className="h-20 w-20 rounded-lg border border-slate-200 object-cover" />
                      ) : (
                        <a
                          key={ai}
                          href={a.url}
                          download={a.name}
                          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600"
                        >
                          <FileText className="h-3.5 w-3.5" /> {a.name}
                        </a>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {!disabled && (
        <div className="shrink-0 border-t border-[var(--border)] bg-slate-50/50 p-3 sm:p-4">
          {pending.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {pending.map((a, i) => (
                <span key={i} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600">
                  {a.kind === "image" ? "🖼️" : <FileText className="h-3.5 w-3.5" />} {a.name}
                  <button onClick={() => setPending((p) => p.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-500">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="shrink-0 rounded-lg border border-slate-300 p-2.5 text-slate-500 hover:bg-white"
              title={fr ? "Joindre un fichier" : "Attach a file"}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={onPickFiles} />
            <textarea
              className="input-premium min-h-[44px] flex-1 resize-none px-3 py-2.5 text-sm"
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={fr ? "Écrire un message…" : "Type a message…"}
            />
            <Button onClick={send} className="shrink-0 px-4" disabled={!draft.trim() && pending.length === 0}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
