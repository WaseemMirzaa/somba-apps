"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { PhotoPicker } from "@/components/shop/photo-picker";
import { useChatThread, type ChatMessage } from "@/lib/shop-engage";
import { useLocale } from "@/context/locale-context";
import { localized } from "@/lib/i18n-fields";
import { useToast } from "@/context/toast-context";
import { TranslatableText } from "@/components/shop/translatable-text";

/** One message: the other side's text shows in the page language by itself (the server's translations, else fetched). */
function Bubble({ m, mine, fr }: { m: ChatMessage; mine: boolean; fr: boolean }) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${mine ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-slate-900"}`} data-testid={mine ? "msg-mine" : "msg-theirs"}>
        {!mine && <p className="mb-0.5 text-xs font-semibold text-slate-600">{m.senderName}</p>}
        {m.text && (mine ? <p className="whitespace-pre-wrap break-words">{m.text}</p> : <TranslatableText kind="chat_message" id={m.id} auto text={m.text} i18n={m.textI18n} className="whitespace-pre-wrap break-words" />)}
        {m.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {m.attachments.map((u) => (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg bg-white/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={fr ? "Photo jointe" : "Attached photo"} className="h-full w-full object-cover" />
              </a>
            ))}
          </div>
        )}
        <p className={`mt-1 flex flex-wrap items-center gap-x-2 text-[11px] ${mine ? "text-white/80" : "text-slate-500"}`}>
          <span>{new Date(m.createdAt).toLocaleString(fr ? "fr-FR" : "en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
        </p>
      </div>
    </div>
  );
}

function Thread() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { conversation, messages, hasMore, loaded, error, send, loadOlder } = useChatThread(id);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (!conversation) {
    return (
      <div className="space-y-3 py-12 text-center text-slate-500">
        <p role={error ? "alert" : undefined}>{!loaded ? (fr ? "Chargement…" : "Loading…") : error ?? (fr ? "Conversation introuvable" : "Conversation not found")}</p>
        <Link href="/shop/messages" className="text-[var(--primary)] hover:underline">{fr ? "Mes messages" : "My messages"}</Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && photos.length === 0) return;
    setBusy(true);
    try {
      await send(text.trim(), photos);
      setText("");
      setPhotos([]);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title={conversation.storeName}
        subtitle={[conversation.productName ? localized(conversation, "productName", fr) : null, conversation.orderReference].filter(Boolean).join(" · ") || (fr ? "Conversation avec le vendeur" : "Conversation with the seller")}
        backHref="/shop/messages"
        actions={
          <div className="flex gap-3 text-sm">
            {conversation.productId && <Link href={`/shop/products/${conversation.productId}`} className="text-[var(--primary)] hover:underline">{fr ? "Voir le produit" : "View product"}</Link>}
            {conversation.orderId && <Link href={`/shop/orders/${conversation.orderId}`} className="text-[var(--primary)] hover:underline">{fr ? "Voir la commande" : "View order"}</Link>}
          </div>
        }
      />
      <div className="card-premium space-y-3 p-4" data-testid="chat-thread">
        {hasMore && (
          <button type="button" onClick={() => void loadOlder()} className="mx-auto block text-xs font-medium text-[var(--primary)] hover:underline">{fr ? "Messages précédents" : "Earlier messages"}</button>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} m={m} mine={m.senderSide === "buyer"} fr={fr} />
        ))}
        <div ref={bottom} />
      </div>
      <form onSubmit={submit} className="card-premium space-y-3 p-4">
        <textarea className="input-premium w-full px-3 py-2 text-sm" rows={2} maxLength={2000} aria-label={fr ? "Votre message" : "Your message"} placeholder={fr ? "Écrire un message…" : "Write a message…"} value={text} onChange={(e) => setText(e.target.value)} />
        <PhotoPicker value={photos} onChange={setPhotos} max={4} fr={fr} />
        <Button type="submit" disabled={busy || (!text.trim() && photos.length === 0)}>{busy ? "…" : fr ? "Envoyer" : "Send"}</Button>
      </form>
    </div>
  );
}

export default function ShopMessageThreadPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireSignIn next={`/shop/messages/${id}`}>
      <Thread />
    </RequireSignIn>
  );
}
