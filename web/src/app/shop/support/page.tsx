"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoader } from "@/components/ui/loader";
import { RequireSignIn } from "@/components/shop/require-sign-in";
import { PhotoPicker } from "@/components/shop/photo-picker";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { useSupportTickets, ticketStatusLabel, type SupportTicketRow } from "@/lib/shop-live";
import { MessageSquare } from "lucide-react";

const CATEGORIES = [
  { id: "general", en: "General", fr: "Général" },
  { id: "orders", en: "Orders", fr: "Commandes" },
  { id: "payment", en: "Payment", fr: "Paiement" },
  { id: "delivery", en: "Delivery", fr: "Livraison" },
  { id: "returns", en: "Returns & refunds", fr: "Retours et remboursements" },
  { id: "account", en: "Account", fr: "Compte" },
];

function SupportContent() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const rt = useRealtime();
  const { tickets, loaded, error: listError, put } = useSupportTickets();

  const [subject, setSubject] = useState(params.get("subject") ?? "");
  const [category, setCategory] = useState(params.get("order") ? "orders" : "general");
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  // Prefill the order from ?order= (an order id or reference) once the orders are loaded.
  const orderParam = params.get("order");
  const [orderId, setOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orders = rt.orders;
  const prefilled = useMemo(
    () => (orderParam ? orders.find((o) => o.id === orderParam || o.reference === orderParam) : undefined),
    [orderParam, orders],
  );
  useEffect(() => {
    // Intentional: one-time prefill when the linked order becomes known.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (prefilled) {
      setOrderId((cur) => cur || prefilled.id);
      setSubject((cur) => cur || (fr ? `Question sur la commande ${prefilled.reference}` : `Question about order ${prefilled.reference}`));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [prefilled, fr]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!subject.trim() || !message.trim()) {
      setError(fr ? "Sujet et message requis" : "Subject and message are required");
      return;
    }
    setBusy(true);
    try {
      const ticket = await socketClient.request<SupportTicketRow>("support:open", {
        subject: subject.trim(),
        category,
        message: message.trim(),
        ...(orderId ? { orderId } : {}),
        ...(photos.length ? { attachments: photos } : {}),
      });
      put(ticket);
      toast(fr ? "Ticket envoyé" : "Ticket submitted");
      router.push(`/shop/support/${ticket.id}`);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title={t("support")}
        subtitle={fr ? "Nous sommes là pour vous aider" : "We're here to help"}
        breadcrumbs={[
          { label: fr ? "Boutique" : "Shop", href: "/" },
          { label: t("support") },
        ]}
      />

      {listError && <p role="alert" className="text-sm text-red-600">{listError}</p>}

      {tickets.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">{fr ? "Mes tickets" : "My tickets"}</p>
          {tickets.map((tk) => (
            <Link
              key={tk.id}
              href={`/shop/support/${tk.id}`}
              className="card-premium flex items-center justify-between p-4 transition-colors hover:border-blue-200"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-blue-50 p-2"><MessageSquare className="h-4 w-4 text-[var(--primary)]" /></span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{tk.subject}</p>
                  <p className="text-xs text-slate-500">{tk.reference} · {new Date(tk.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(tk.userUnread ?? 0) > 0 && (
                  <span data-testid="ticket-unread" className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-bold text-white" aria-label={fr ? `${tk.userUnread} message(s) non lu(s)` : `${tk.userUnread} unread`}>
                    {tk.userUnread}
                  </span>
                )}
                <Badge variant={tk.status === "resolved" || tk.status === "closed" ? "success" : tk.status === "pending" ? "info" : "warning"}>
                  {ticketStatusLabel(tk.status, fr)}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
      {loaded && tickets.length === 0 && !listError && (
        <p className="text-sm text-slate-500">{fr ? "Vous n'avez pas encore de ticket." : "You have no tickets yet."}</p>
      )}

      <form onSubmit={submit} className="card-premium space-y-5 p-6">
        <p className="text-sm font-semibold text-slate-900">{fr ? "Nouveau ticket" : "New ticket"}</p>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">{fr ? "Sujet" : "Subject"}</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Problème de commande, retour, paiement..." : "Order issue, return, payment..."} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{fr ? "Catégorie" : "Category"}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input-premium w-full px-4 py-2.5 text-sm">
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{fr ? c.fr : c.en}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">{fr ? "Commande concernée (facultatif)" : "Related order (optional)"}</label>
            <select value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input-premium w-full px-4 py-2.5 text-sm">
              <option value="">{fr ? "Aucune" : "None"}</option>
              {orders.map((o) => <option key={o.id} value={o.id}>{o.reference} · {new Date(o.createdAt).toLocaleDateString(fr ? "fr-FR" : "en-GB")}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Message</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="input-premium w-full px-4 py-2.5 text-sm" rows={4} placeholder={fr ? "Décrivez votre problème..." : "Describe your issue..."} />
        </div>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">{fr ? "Photos (facultatif)" : "Photos (optional)"}</p>
          <PhotoPicker value={photos} onChange={setPhotos} max={4} fr={fr} />
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={busy}>{busy ? "…" : fr ? "Soumettre le ticket" : "Submit Ticket"}</Button>
      </form>
    </div>
  );
}

export default function ShopSupportPage() {
  return (
    <RequireSignIn next="/shop/support">
      <Suspense fallback={<PageLoader className="py-12" />}>
        <SupportContent />
      </Suspense>
    </RequireSignIn>
  );
}
