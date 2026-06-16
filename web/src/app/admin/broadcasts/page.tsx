"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { Send, Megaphone, CalendarClock, Users } from "lucide-react";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { BROADCASTS, BROADCAST_CHANNELS, BROADCAST_AUDIENCES, type Broadcast } from "@/lib/broadcast-entities";
import { adminBreadcrumb } from "@/lib/admin-i18n";

const channelVariant = { push: "primary", sms: "purple", email: "info" } as const;
const statusVariant = { sent: "success", scheduled: "warning", draft: "default" } as const;
const STATUS_FR: Record<string, string> = { sent: "Envoyée", scheduled: "Programmée", draft: "Brouillon" };

export default function AdminBroadcastsPage() {
  const { t, locale } = useLocale();
  const { toast } = useToast();
  const fr = locale === "fr";
  const [items, setItems] = useState<Broadcast[]>(BROADCASTS);
  const [channel, setChannel] = useState<Broadcast["channel"]>("push");
  const [audience, setAudience] = useState("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const sent = items.filter((b) => b.status === "sent").length;
  const scheduled = items.filter((b) => b.status === "scheduled").length;

  function send(status: "sent" | "scheduled") {
    if (!title.trim()) {
      toast(fr ? "Titre requis" : "Title required", "error");
      return;
    }
    const aud = BROADCAST_AUDIENCES.find((a) => a.id === audience);
    setItems((b) => [
      {
        id: `BC-0${50 + b.length}`,
        channel,
        audience: aud ? aud.label : audience,
        title: title.trim(),
        body: body.trim(),
        status,
        reach: "—",
        date: new Date().toISOString().slice(0, 10),
      },
      ...b,
    ]);
    setTitle("");
    setBody("");
    toast(status === "sent" ? (fr ? "Diffusion envoyée" : "Broadcast sent") : fr ? "Diffusion programmée" : "Broadcast scheduled", "success");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Notifications de diffusion" : "Broadcast Notifications"}
        subtitle={fr ? "Push, SMS et e-mail vers des audiences ciblées" : "Push, SMS and email to targeted audiences"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Diffusions" : "Broadcasts" }]}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title={fr ? "Envoyées" : "Sent"} value={sent} icon={Send} />
        <StatCard title={fr ? "Programmées" : "Scheduled"} value={scheduled} icon={CalendarClock} />
        <StatCard title={fr ? "Audience totale" : "Total reach"} value="61K+" icon={Users} />
      </div>

      <div className="card-premium space-y-4 p-6">
        <h3 className="flex items-center gap-2 font-semibold">
          <Megaphone className="h-4 w-4 text-[var(--primary)]" />
          {fr ? "Nouvelle diffusion" : "New broadcast"}
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500">{fr ? "Canal" : "Channel"}</label>
            <select className="input-premium mt-1 w-full px-4 py-2 text-sm" value={channel} onChange={(e) => setChannel(e.target.value as Broadcast["channel"])}>
              {BROADCAST_CHANNELS.map((c) => (
                <option key={c.id} value={c.id}>{fr ? c.labelFr : c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">{fr ? "Audience" : "Audience"}</label>
            <select className="input-premium mt-1 w-full px-4 py-2 text-sm" value={audience} onChange={(e) => setAudience(e.target.value)}>
              {BROADCAST_AUDIENCES.map((a) => (
                <option key={a.id} value={a.id}>{fr ? a.labelFr : a.label}</option>
              ))}
            </select>
          </div>
        </div>
        <input className="input-premium w-full px-4 py-2 text-sm" placeholder={fr ? "Titre" : "Title"} value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input-premium w-full px-4 py-2 text-sm" rows={3} placeholder={fr ? "Message" : "Message"} value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="flex gap-2">
          <Button onClick={() => send("sent")}>
            <Send className="h-4 w-4" />
            {fr ? "Envoyer" : "Send now"}
          </Button>
          <Button variant="secondary" onClick={() => send("scheduled")}>
            <CalendarClock className="h-4 w-4" />
            {fr ? "Programmer" : "Schedule"}
          </Button>
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        <DataTable
          data={items as unknown as Record<string, unknown>[]}
          columns={[
            { key: "channel", label: fr ? "Canal" : "Channel", render: (row) => { const ch = BROADCAST_CHANNELS.find((c) => c.id === row.channel); return <Badge variant={channelVariant[row.channel as Broadcast["channel"]]}>{ch ? (fr ? ch.labelFr : ch.label) : String(row.channel)}</Badge>; } },
            {
              key: "title",
              label: fr ? "Titre" : "Title",
              render: (row) => {
                const b = row as unknown as Broadcast;
                return (
                  <div>
                    <p className="font-semibold text-slate-900">{b.title}</p>
                    <p className="line-clamp-1 text-xs text-slate-400">{b.body}</p>
                  </div>
                );
              },
            },
            { key: "audience", label: "Audience", render: (row) => {
              const val = String(row.audience);
              const aud = BROADCAST_AUDIENCES.find((a) => a.label === val || a.labelFr === val);
              return <span>{aud ? (fr ? aud.labelFr : aud.label) : val}</span>;
            } },
            { key: "reach", label: fr ? "Portée" : "Reach" },
            { key: "status", label: fr ? "Statut" : "Status", render: (row) => <Badge variant={statusVariant[row.status as Broadcast["status"]]}>{fr ? (STATUS_FR[String(row.status)] ?? String(row.status)) : String(row.status)}</Badge> },
            { key: "date", label: t("date"), render: (row) => <span className="text-slate-500">{String(row.date)}</span> },
          ]}
        />
      </div>
    </div>
  );
}
