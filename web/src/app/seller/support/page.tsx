"use client";

import { localDay } from "@/lib/dates";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SellerListPage } from "@/components/seller/list-page";
import { AttachmentPicker } from "@/components/seller/attachments";
import { OrderLink, useOrderRefs } from "@/components/seller/engage-support";
import { ListFilters, EMPTY_LIST_FILTERS } from "@/components/ui/list-filters";
import { applyListFilters } from "@/lib/list-filter-utils";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerTickets } from "@/lib/seller";
import { TICKET_STATUS_OPTIONS, errMessage, ticketStatusLabel, ticketStatusVariant } from "@/lib/seller-labels";

const CATEGORIES = [
  { value: "general", en: "General", fr: "Général" },
  { value: "orders", en: "Orders & delivery", fr: "Commandes et livraison" },
  { value: "payouts", en: "Payouts & finance", fr: "Versements et finance" },
  { value: "products", en: "Products & moderation", fr: "Produits et modération" },
  { value: "account", en: "Store account", fr: "Compte boutique" },
];

export default function SellerSupportPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const router = useRouter();
  const { tickets, openTicket } = useSellerTickets();
  const { orders, refOf, canLink } = useOrderRefs();
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      tickets.map((tk) => ({
        id: tk.id,
        reference: tk.reference,
        category: tk.category,
        subject: tk.subject,
        status: tk.status,
        orderId: tk.orderId,
        orderRef: refOf(tk.orderId),
        assignee: tk.assigneeName ?? "",
        unread: tk.userUnread ?? 0,
        lastUpdate: localDay(tk.updatedAt),
        messages: tk.messages.length,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickets, orders]
  );

  const filtered = useMemo(
    () => applyListFilters(rows, filters, { searchFields: ["reference", "subject", "category", "orderRef", "assignee"], dateField: "lastUpdate", statusField: "status" }),
    [rows, filters]
  );
  const unreadTotal = rows.reduce((n, r) => n + r.unread, 0);

  const formValid = subject.trim().length >= 3 && message.trim().length >= 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const tk = await openTicket({
        subject: subject.trim(),
        message: message.trim(),
        category,
        ...(orderId ? { orderId } : {}),
        ...(photos.length ? { attachments: photos } : {}),
      });
      toast(fr ? "Ticket créé" : "Ticket created");
      router.push(`/seller/support/${tk.id}`);
    } catch (err) {
      const msg = errMessage(err);
      setError(msg);
      toast(msg, "error");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {showForm && (
        <form onSubmit={submit} className="card-premium space-y-3 p-5">
          <h2 className="font-semibold text-slate-900">{fr ? "Nouveau ticket" : "New ticket"}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <input className="input-premium px-3 py-2 text-sm sm:col-span-2" placeholder={fr ? "Sujet" : "Subject"} aria-label={fr ? "Sujet" : "Subject"} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            <select className="input-premium px-3 py-2 text-sm" aria-label={fr ? "Catégorie" : "Category"} value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{fr ? c.fr : c.en}</option>)}
            </select>
          </div>
          {canLink && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600" htmlFor="ticket-order">{fr ? "Commande concernée (facultatif)" : "Related order (optional)"}</label>
              <select id="ticket-order" className="input-premium w-full px-3 py-2 text-sm" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                <option value="">{fr ? "Aucune commande" : "No order"}</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>{o.reference} · {localDay(o.createdAt)}</option>
                ))}
              </select>
            </div>
          )}
          <textarea className="input-premium w-full px-3 py-2 text-sm" rows={5} aria-label="Message" placeholder={fr ? "Décrivez votre demande (numéro de commande, produit…)" : "Describe your request (order number, product…)"} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} />
          <AttachmentPicker value={photos} onChange={setPhotos} max={4} disabled={busy} />
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={!formValid || busy}>{busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Envoyer" : "Send"}</Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
          </div>
        </form>
      )}

      <SellerListPage
        title={t("support")}
        subtitle={
          unreadTotal > 0
            ? fr ? `${unreadTotal} réponse(s) du support non lue(s)` : `${unreadTotal} unread support repl${unreadTotal === 1 ? "y" : "ies"}`
            : fr ? "Vos conversations avec l'équipe support, en direct" : "Your conversations with the support team, live"
        }
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: t("support") }]}
        actions={
          !showForm ? (
            <button onClick={() => setShowForm(true)} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium">
              {fr ? "Nouveau ticket" : "New Ticket"}
            </button>
          ) : undefined
        }
        filters={
          <ListFilters
            values={filters}
            onChange={setFilters}
            statusOptions={TICKET_STATUS_OPTIONS}
            searchPlaceholder={fr ? "Référence, sujet, commande, catégorie…" : "Reference, subject, order, category…"}
          />
        }
        columns={[
          { key: "reference", label: fr ? "Référence" : "Reference", render: (row) => (
            <Link href={`/seller/support/${row.id}`} className="inline-flex items-center gap-2 font-medium text-[var(--primary)] hover:underline">
              {String(row.reference)}
              {Number(row.unread) > 0 && <Badge variant="primary">{fr ? `${row.unread} non lu(s)` : `${row.unread} unread`}</Badge>}
            </Link>
          )},
          { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => {
            const c = CATEGORIES.find((x) => x.value === row.category);
            return c ? (fr ? c.fr : c.en) : String(row.category);
          }},
          { key: "subject", label: fr ? "Sujet" : "Subject", render: (row) => <span className={Number(row.unread) > 0 ? "font-semibold text-slate-900" : ""}>{String(row.subject)}</span> },
          { key: "orderId", label: fr ? "Commande" : "Order", render: (row) => (
            <OrderLink orderId={row.orderId as string | null} reference={row.orderRef as string | null} fr={fr} enabled={canLink} />
          )},
          { key: "status", label: t("status"), render: (row) => (
            <Badge variant={ticketStatusVariant(String(row.status))}>{ticketStatusLabel(String(row.status), fr)}</Badge>
          )},
          { key: "assignee", label: fr ? "Agent" : "Agent", render: (row) => String(row.assignee || "—") },
          { key: "messages", label: "Messages" },
          { key: "lastUpdate", label: fr ? "Dernière mise à jour" : "Last Update" },
          { key: "actions", label: t("action"), render: (row) => (
            <Link href={`/seller/support/${row.id}`} className="text-sm text-[var(--primary)] hover:underline">{t("view")}</Link>
          )},
        ]}
        data={filtered as unknown as Record<string, unknown>[]}
      />
    </div>
  );
}
