"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { AttachmentGallery, AttachmentPicker } from "@/components/seller/attachments";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { localDateTime } from "@/lib/dates";
import { errMessage } from "@/lib/seller-labels";
import { threadRoleLabel, type CaseMessage } from "@/lib/seller-aftersale";
import { cn } from "@/lib/utils";

/**
 * The conversation on a return or dispute: customer, you and Somba support, with photos. The reply box is open while
 * the request is (the server refuses a reply on a closed one).
 */
export function CaseThread({
  messages,
  canReply,
  onSend,
}: {
  messages: CaseMessage[];
  canReply: boolean;
  onSend: (text: string, attachments: string[]) => Promise<void>;
}) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    const body = text.trim();
    if (!body && files.length === 0) {
      toast(fr ? "Écrivez un message ou ajoutez une photo." : "Write a message or add a photo.", "error");
      return;
    }
    setBusy(true);
    try {
      await onSend(body, files);
      setText("");
      setFiles([]);
      toast(fr ? "Message envoyé" : "Message sent");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
          {fr ? "Aucun message pour le moment." : "No messages yet."}
        </p>
      ) : (
        <ul className="max-h-[28rem] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((m) => {
            const mine = m.role === "seller";
            return (
              <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] rounded-2xl px-4 py-2.5 text-sm", mine ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-slate-900")}>
                  <p className={cn("text-[11px] font-semibold", mine ? "text-white/80" : "text-slate-500")}>
                    {m.authorName ? `${m.authorName} · ` : ""}
                    {threadRoleLabel(m.role, fr)} · {localDateTime(m.createdAt)}
                  </p>
                  {m.text && <p className="mt-1 whitespace-pre-line break-words">{m.text}</p>}
                  <AttachmentGallery urls={m.attachments} className="mt-2" />
                </div>
              </li>
            );
          })}
          <div ref={end} />
        </ul>
      )}

      {canReply ? (
        <div className="space-y-2 border-t border-[var(--border)] pt-4">
          <label htmlFor="case-reply" className="block text-xs font-medium text-slate-600">
            {fr ? "Votre réponse" : "Your reply"}
          </label>
          <textarea
            id="case-reply"
            rows={3}
            maxLength={2000}
            value={text}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            className="input-premium w-full px-3 py-2 text-sm"
            placeholder={fr ? "Écrivez au client et au support Somba…" : "Write to the customer and Somba support…"}
          />
          <AttachmentPicker value={files} onChange={setFiles} max={6} disabled={busy} />
          <button
            type="button"
            disabled={busy}
            onClick={() => void send()}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Envoyer" : "Send"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">{fr ? "Cette demande est clôturée : la conversation est fermée." : "This request is closed: the conversation is closed."}</p>
      )}
    </div>
  );
}
