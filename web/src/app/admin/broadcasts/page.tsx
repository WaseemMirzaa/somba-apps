"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { NoticeBar } from "@/components/admin/notice-bar";
import { ErrorNote } from "@/components/admin/modal";
import { Send, Megaphone, Users } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useServerList, type BroadcastServerRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

// The server targets a role room; "all" only reaches customers in practice, so it is not offered.
const AUDIENCES: { id: string; label: string; labelFr: string }[] = [
  { id: "customer", label: "Customers", labelFr: "Clients" },
  { id: "seller", label: "Sellers", labelFr: "Vendeurs" },
  { id: "rider", label: "Riders", labelFr: "Livreurs" },
  { id: "warehouse_staff", label: "Warehouse staff", labelFr: "Personnel entrepôt" },
];

export default function AdminBroadcastsPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const { items, setItems, error: loadError } = useServerList<BroadcastServerRow>("broadcasts:list", {
    pushEvents: ["broadcast:created"],
  });
  const [audience, setAudience] = useState("customer");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalRecipients = items.reduce((s, b) => s + (b.recipients ?? 0), 0);
  const audLabel = (id: string) => {
    const a = AUDIENCES.find((x) => x.id === id);
    return a ? (fr ? a.labelFr : a.label) : id;
  };

  async function send() {
    if (!title.trim() || !body.trim()) {
      setError(fr ? "Titre et message requis." : "Title and message are required.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const sent = await socketClient.request<BroadcastServerRow>("broadcasts:send", {
        title: title.trim(),
        body: body.trim(),
        audience,
      });
      setItems((cur) => (cur.some((b) => b.id === sent.id) ? cur : [sent, ...cur]));
      setTitle("");
      setBody("");
      toast(
        fr
          ? `Diffusion envoyée à ${sent.recipients} destinataire(s)`
          : `Broadcast sent to ${sent.recipients} recipient(s)`,
        "success",
      );
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Notifications de diffusion" : "Broadcast Notifications"}
        subtitle={fr ? "Push + notification dans l'appli vers un rôle" : "Push + in-app notification to one role"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Diffusions" : "Broadcasts" }]}
      />

      <NoticeBar>
        {fr
          ? "Canaux : push et notification dans l'appli uniquement (pas de SMS ni d'e-mail). L'envoi est immédiat, sans programmation."
          : "Channels: push and in-app notification only (no SMS or email). Sending is immediate; there is no scheduling."}
      </NoticeBar>
      {loadError && <NoticeBar tone="warn">{loadError}</NoticeBar>}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard title={fr ? "Diffusions envoyées" : "Broadcasts sent"} value={items.length} icon={Send} />
        <StatCard title={fr ? "Destinataires (total cumulé)" : "Recipients (cumulative)"} value={totalRecipients} icon={Users} />
      </div>

      <div className="card-premium space-y-4 p-6">
        <h3 className="flex items-center gap-2 font-semibold">
          <Megaphone className="h-4 w-4 text-[var(--primary)]" />
          {fr ? "Nouvelle diffusion" : "New broadcast"}
        </h3>
        <div>
          <label className="text-xs font-medium text-slate-500">Audience</label>
          <select className="input-premium mt-1 w-full max-w-xs px-4 py-2 text-sm" value={audience} onChange={(e) => setAudience(e.target.value)}>
            {AUDIENCES.map((a) => (
              <option key={a.id} value={a.id}>{fr ? a.labelFr : a.label}</option>
            ))}
          </select>
        </div>
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Titre" : "Title"} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input-premium w-full px-4 py-2 text-sm" rows={3} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} />
        <ErrorNote message={error} />
        <Button onClick={send} disabled={sending}>
          <Send className="h-4 w-4" />
          {sending ? "…" : fr ? "Envoyer maintenant" : "Send now"}
        </Button>
      </div>

      <div className="card-premium overflow-hidden">
        <DataTable
          data={items as unknown as Record<string, unknown>[]}
          emptyMessage={fr ? "Aucune diffusion envoyée" : "No broadcasts sent yet"}
          columns={[
            {
              key: "title",
              label: fr ? "Titre" : "Title",
              render: (row) => {
                const b = row as unknown as BroadcastServerRow;
                return (
                  <div>
                    <p className="font-semibold text-slate-900">{b.title}</p>
                    <p className="line-clamp-1 text-xs text-slate-400">{b.body}</p>
                  </div>
                );
              },
            },
            { key: "audience", label: "Audience", render: (row) => <Badge variant="primary">{audLabel(String(row.audience))}</Badge> },
            { key: "recipients", label: fr ? "Destinataires" : "Recipients" },
            { key: "sentBy", label: fr ? "Envoyé par" : "Sent by" },
            { key: "createdAt", label: t("date"), render: (row) => <span className="text-slate-500">{String(row.createdAt).slice(0, 16).replace("T", " ")}</span> },
          ]}
        />
      </div>
    </div>
  );
}
