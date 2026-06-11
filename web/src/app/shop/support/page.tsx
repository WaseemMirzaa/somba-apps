"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useSupport } from "@/context/support-context";

function ShopSupportContent() {
  const { t, locale } = useLocale();
  const { tickets, createTicket } = useSupport();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderFromQuery = searchParams.get("order") ?? "";
  const fr = locale === "fr";

  const [showForm, setShowForm] = useState(!!orderFromQuery);
  const [subject, setSubject] = useState(orderFromQuery ? (fr ? "Problème de commande" : "Order issue") : "");
  const [orderId, setOrderId] = useState(orderFromQuery);
  const [message, setMessage] = useState("");

  const myTickets = tickets.filter((t) => t.portal === "customer");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ticket = createTicket({ subject, message, orderId: orderId || undefined });
    router.push(`/shop/support/${ticket.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader
        title={t("support")}
        subtitle={fr ? "Nous sommes là pour vous aider" : "We're here to help"}
        breadcrumbs={[
          { label: "Shop", href: "/" },
          { label: t("support") },
        ]}
        actions={
          <Button variant="secondary" onClick={() => setShowForm((v) => !v)}>
            {showForm ? (fr ? "Mes tickets" : "My tickets") : (fr ? "Nouveau ticket" : "New ticket")}
          </Button>
        }
      />

      {!showForm && (
        <div className="space-y-3">
          {myTickets.length === 0 ? (
            <div className="card-premium p-8 text-center text-slate-500">
              {fr ? "Aucun ticket. Créez-en un ci-dessus." : "No tickets yet. Create one above."}
            </div>
          ) : (
            myTickets.map((ticket) => (
              <Link key={ticket.id} href={`/shop/support/${ticket.id}`} className="card-premium block p-5 hover:border-blue-200">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">{ticket.id} — {ticket.subject}</p>
                    {ticket.orderId && <p className="text-sm text-slate-500">{ticket.orderId}</p>}
                    <p className="mt-1 text-xs text-slate-400">{ticket.lastUpdate}</p>
                  </div>
                  <Badge variant={ticket.status === "resolved" ? "success" : "info"}>{ticket.status.replace("_", " ")}</Badge>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card-premium space-y-5 p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Subject</label>
            <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="Order issue, return, payment..." value={subject} onChange={(e) => setSubject(e.target.value)} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Order ID (optional)</label>
            <input className="input-premium w-full px-4 py-2.5 text-sm" placeholder="ORD-2024-XXXX" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Message</label>
            <textarea className="input-premium w-full px-4 py-2.5 text-sm" rows={4} placeholder="Describe your issue..." value={message} onChange={(e) => setMessage(e.target.value)} required />
          </div>
          <Button type="submit">Submit Ticket</Button>
        </form>
      )}
    </div>
  );
}

export default function ShopSupportPage() {
  return (
    <Suspense fallback={<div className="text-center text-slate-500">Loading...</div>}>
      <ShopSupportContent />
    </Suspense>
  );
}
