"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useAuth } from "@/context/auth-context";
import { useSupport } from "@/context/support-context";
import { SUPPORT_STATUS_LABELS } from "@/lib/support-tickets";
import { MessageSquare } from "lucide-react";

export default function ShopSupportPage() {
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const router = useRouter();
  const { toast } = useToast();
  const { persona } = useAuth();
  const { tickets, addTicket } = useSupport();

  const [subject, setSubject] = useState("");
  const [orderId, setOrderId] = useState("");
  const [message, setMessage] = useState("");

  const myTickets = tickets.filter((tk) => tk.audience === "customer");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast(fr ? "Sujet et message requis" : "Subject and message are required", "info");
      return;
    }
    const id = addTicket({
      subject: subject.trim(),
      category: orderId.trim() ? "Orders" : "General",
      categoryFr: orderId.trim() ? "Commandes" : "Général",
      audience: "customer",
      party: persona.name && persona.role !== "guest" ? persona.name : "Customer",
      message: orderId.trim() ? `${message.trim()}\n\n${fr ? "Commande" : "Order"}: ${orderId.trim()}` : message.trim(),
    });
    toast(fr ? "Ticket soumis" : "Ticket submitted");
    router.push(`/shop/support/${id}`);
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

      {myTickets.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900">{fr ? "Mes tickets" : "My tickets"}</p>
          {myTickets.map((tk) => (
            <Link
              key={tk.id}
              href={`/shop/support/${tk.id}`}
              className="card-premium flex items-center justify-between p-4 transition-colors hover:border-blue-200"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-blue-50 p-2"><MessageSquare className="h-4 w-4 text-[var(--primary)]" /></span>
                <div>
                  <p className="text-sm font-medium text-slate-900">{fr ? tk.subjectFr : tk.subject}</p>
                  <p className="text-xs text-slate-500">{tk.id} · {tk.date}</p>
                </div>
              </div>
              <Badge variant={tk.status === "resolved" ? "success" : tk.status === "in_progress" ? "info" : "warning"}>
                {fr ? SUPPORT_STATUS_LABELS[tk.status].fr : SUPPORT_STATUS_LABELS[tk.status].en}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="card-premium space-y-5 p-6">
        <p className="text-sm font-semibold text-slate-900">{fr ? "Nouveau ticket" : "New ticket"}</p>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">{fr ? "Sujet" : "Subject"}</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Problème de commande, retour, paiement..." : "Order issue, return, payment..."} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">{fr ? "ID de commande (facultatif)" : "Order ID (optional)"}</label>
          <input value={orderId} onChange={(e) => setOrderId(e.target.value)} className="input-premium w-full px-4 py-2.5 text-sm" placeholder="ORD-2024-XXXX" />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">{fr ? "Message" : "Message"}</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="input-premium w-full px-4 py-2.5 text-sm" rows={4} placeholder={fr ? "Décrivez votre problème..." : "Describe your issue..."} />
        </div>
        <Button type="submit">{fr ? "Soumettre le ticket" : "Submit Ticket"}</Button>
      </form>
    </div>
  );
}
