"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SellerListPage } from "@/components/seller/list-page";
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
  const [filters, setFilters] = useState(EMPTY_LIST_FILTERS);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("general");
  const [message, setMessage] = useState("");
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
        lastUpdate: new Date(tk.updatedAt).toISOString().slice(0, 10),
        messages: tk.messages.length,
      })),
    [tickets]
  );

  const filtered = useMemo(
    () => applyListFilters(rows, filters, { searchFields: ["reference", "subject", "category"], dateField: "lastUpdate", statusField: "status" }),
    [rows, filters]
  );

  const formValid = subject.trim().length >= 3 && message.trim().length >= 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const tk = await openTicket({ subject: subject.trim(), message: message.trim(), category });
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
            <input className="input-premium px-3 py-2 text-sm sm:col-span-2" placeholder={fr ? "Sujet" : "Subject"} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            <select className="input-premium px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{fr ? c.fr : c.en}</option>)}
            </select>
          </div>
          <textarea className="input-premium w-full px-3 py-2 text-sm" rows={5} placeholder={fr ? "Décrivez votre demande (numéro de commande, produit…)" : "Describe your request (order number, product…)"} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={4000} />
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={!formValid || busy}>{busy ? (fr ? "Envoi…" : "Sending…") : fr ? "Envoyer" : "Send"}</Button>
            <Button type="button" variant="ghost" onClick={() => setShowForm(false)} disabled={busy}>{fr ? "Annuler" : "Cancel"}</Button>
          </div>
        </form>
      )}

      <SellerListPage
        title={t("support")}
        subtitle={fr ? "Vos conversations avec l'équipe support, en direct" : "Your conversations with the support team, live"}
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
            searchPlaceholder={fr ? "Référence, sujet, catégorie…" : "Reference, subject, category…"}
          />
        }
        columns={[
          { key: "reference", label: fr ? "Référence" : "Reference", render: (row) => (
            <Link href={`/seller/support/${row.id}`} className="font-medium text-[var(--primary)] hover:underline">{String(row.reference)}</Link>
          )},
          { key: "category", label: fr ? "Catégorie" : "Category", render: (row) => {
            const c = CATEGORIES.find((x) => x.value === row.category);
            return c ? (fr ? c.fr : c.en) : String(row.category);
          }},
          { key: "subject", label: fr ? "Sujet" : "Subject" },
          { key: "status", label: t("status"), render: (row) => (
            <Badge variant={ticketStatusVariant(String(row.status))}>{ticketStatusLabel(String(row.status), fr)}</Badge>
          )},
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
