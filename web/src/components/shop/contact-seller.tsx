"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhotoPicker } from "@/components/shop/photo-picker";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";

export interface ChatConversation {
  id: string;
  side: "buyer" | "seller";
  buyerId: string;
  buyerName: string;
  sellerId: string;
  storeName: string;
  storeLogo: string | null;
  productId: string | null;
  productName: string | null;
  productImage: string | null;
  orderId: string | null;
  orderReference: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: number;
}

/**
 * "Message the seller": starts (or reuses) the conversation for this store, product or order and opens the thread.
 * Signed-out visitors are sent to sign in first.
 */
export function ContactSeller({
  sellerId,
  productId,
  orderId,
  fr,
  className,
  label,
  returnTo,
}: {
  sellerId: string | null | undefined;
  productId?: string;
  orderId?: string;
  fr: boolean;
  className?: string;
  label?: string;
  returnTo: string;
}) {
  const rt = useRealtime();
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  if (!sellerId) return null;

  async function send() {
    if (!text.trim()) {
      toast(fr ? "Écrivez d'abord un message." : "Write a message first.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await socketClient.request<{ conversation: ChatConversation }>("chat:start", {
        sellerId,
        ...(productId ? { productId } : {}),
        ...(orderId ? { orderId } : {}),
        text: text.trim(),
        ...(photos.length ? { attachments: photos } : {}),
      });
      toast(fr ? "Message envoyé au vendeur" : "Message sent to the seller");
      router.push(`/shop/messages/${res.conversation.id}`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  function start() {
    if (!rt.user) {
      router.push(`/shop/login?next=${encodeURIComponent(returnTo)}`);
      return;
    }
    setOpen((v) => !v);
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={start}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-blue-50"
      >
        <MessageCircle className="h-4 w-4" />
        {label ?? (fr ? "Écrire au vendeur" : "Message the seller")}
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl border border-[var(--border)] bg-white p-4" data-testid="contact-seller-form">
          <textarea
            className="input-premium w-full px-3 py-2 text-sm"
            rows={3}
            maxLength={2000}
            aria-label={fr ? "Votre message" : "Your message"}
            placeholder={fr ? "Votre question au vendeur…" : "Your question for the seller…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <PhotoPicker value={photos} onChange={setPhotos} max={4} fr={fr} />
          <div className="flex gap-2">
            <Button onClick={send} disabled={busy || !text.trim()}>{busy ? "…" : fr ? "Envoyer" : "Send"}</Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>{fr ? "Annuler" : "Cancel"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
