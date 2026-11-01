"use client";

/* eslint-disable @next/next/no-img-element */
import { supportCategoryLabel } from "@/lib/i18n-fields";
import { localDay, localDateTime } from "@/lib/dates";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Paperclip, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import {
  ROLE_BADGE,
  ROLE_LABEL,
  SUPPORT_STATUS_BADGE,
  SUPPORT_STATUS_LABEL,
  assetUrl,
  errMsg,
  lab,
  parseMessages,
  uploadImage,
  useRole,
  useServerList,
  type StaffRow,
  type SupportTicketRow,
} from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";

export default function AdminSupportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const rt = useRealtime();
  const role = useRole();
  const { items, setItems, loading } = useServerList<SupportTicketRow>("support:list", { pushEvents: ["support:updated"] });
  // Only the super admin can list admin accounts; every agent can assign a ticket to themselves.
  const admins = useServerList<StaffRow>("roles:staff", { enabled: role === "admin" });
  const ticket = items.find((t) => t.id === id || t.reference === id);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const messages = useMemo(() => (ticket ? parseMessages(ticket.messages) : []), [ticket]);

  // Opening the ticket reads it: the unread counter of the agents goes back to zero (also for messages arriving live).
  const unread = ticket?.staffUnread ?? 0;
  const ticketId = ticket?.id;
  useEffect(() => {
    if (!ticketId || unread <= 0) return;
    socketClient
      .request<SupportTicketRow>("support:markRead", { id: ticketId })
      .then((saved) => setItems((cur) => cur.map((x) => (x.id === saved.id ? { ...x, ...saved } : x))))
      .catch(() => undefined);
  }, [ticketId, unread, setItems]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  if (!ticket) {
    return (
      <div className="p-8 text-center text-slate-500">
        {loading ? (fr ? "Chargement…" : "Loading…") : fr ? "Ticket introuvable" : "Ticket not found"}
      </div>
    );
  }
  const t0 = ticket;

  async function attach(list: FileList | null) {
    if (!list || list.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const urls: string[] = [];
      for (const f of Array.from(list).slice(0, Math.max(0, 4 - files.length))) urls.push(await uploadImage(f));
      setFiles((cur) => [...cur, ...urls]);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function send() {
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const saved = await socketClient.request<SupportTicketRow>("support:reply", { id: t0.id, ...(text.trim() ? { text: text.trim() } : {}), ...(files.length ? { attachments: files } : {}) });
      setItems((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
      setText("");
      setFiles([]);
      toast(fr ? "Réponse envoyée" : "Reply sent", "success");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSending(false);
    }
  }

  async function setStatus(status: SupportTicketRow["status"]) {
    setStatusBusy(true);
    try {
      const saved = await socketClient.request<SupportTicketRow>("support:setStatus", { id: t0.id, status });
      setItems((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
      toast(fr ? "Statut mis à jour" : "Status updated", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setStatusBusy(false);
    }
  }

  async function assign(assigneeId: string | null) {
    setAssignBusy(true);
    try {
      const saved = await socketClient.request<SupportTicketRow>("support:assign", { id: t0.id, assigneeId });
      setItems((cur) => cur.map((x) => (x.id === saved.id ? saved : x)));
      toast(assigneeId ? (fr ? "Ticket assigné" : "Ticket assigned") : fr ? "Ticket remis dans la file" : "Ticket back in the queue", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setAssignBusy(false);
    }
  }

  const adminAccounts = admins.items.filter((u) => u.role.startsWith("admin") && u.active !== false);
  const creatorRole = t0.role ?? "customer";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t0.reference}
        subtitle={`${supportCategoryLabel(t0.category, fr)} · ${t0.subject}`}
        backHref="/admin/support"
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Support" : "Support", href: "/admin/support" }, { label: t0.reference }]}
        actions={
          <>
            <Badge variant={ROLE_BADGE[creatorRole] ?? "default"}>{lab(ROLE_LABEL, creatorRole, fr)}</Badge>
            <Badge variant={SUPPORT_STATUS_BADGE[t0.status] ?? "default"}>{SUPPORT_STATUS_LABEL[t0.status]?.[fr ? "fr" : "en"] ?? t0.status}</Badge>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardContent className="max-h-[60vh] space-y-3 overflow-y-auto p-5">
              {messages.length === 0 && <p className="text-sm text-slate-400">{fr ? "Aucun message." : "No messages."}</p>}
              {messages.map((m, i) => {
                const staff = m.role.startsWith("admin");
                return (
                  <div key={m.id ?? i} className={`flex ${staff ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${staff ? "bg-[var(--primary)] text-white" : "bg-slate-100 text-slate-800"}`}>
                      <p className={`mb-0.5 text-xs ${staff ? "text-white/70" : "text-slate-400"}`}>{m.from} · {localDateTime(m.at)}</p>
                      {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {m.attachments.map((u) => (
                            <a key={u} href={assetUrl(u)} target="_blank" rel="noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg bg-white/20">
                              <img src={assetUrl(u)} alt={fr ? "Pièce jointe" : "Attachment"} className="h-full w-full object-cover" loading="lazy" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottom} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-5">
              <textarea
                className="input-premium w-full px-4 py-2 text-sm"
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={fr ? "Votre réponse…" : "Your reply…"}
                disabled={t0.status === "closed"}
              />
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {files.map((u) => (
                    <span key={u} className="relative block h-16 w-16 overflow-hidden rounded-lg border border-slate-200">
                      <img src={assetUrl(u)} alt="" className="h-full w-full object-cover" />
                      <button type="button" onClick={() => setFiles((cur) => cur.filter((x) => x !== u))} className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white" aria-label={fr ? "Retirer la photo" : "Remove photo"}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <ErrorNote message={error} />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={send} disabled={sending || uploading || (!text.trim() && files.length === 0) || t0.status === "closed"}>
                  {sending ? "…" : fr ? "Envoyer la réponse" : "Send reply"}
                </Button>
                <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => void attach(e.target.files)} />
                <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading || files.length >= 4 || t0.status === "closed"}>
                  <Paperclip className="h-3.5 w-3.5" />
                  {uploading ? "…" : fr ? "Joindre une photo" : "Attach a photo"}
                </Button>
              </div>
              {t0.status === "closed" && <p className="text-xs text-slate-400">{fr ? "Ticket fermé : rouvrez-le pour répondre." : "Ticket closed: reopen it to reply."}</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5 text-sm">
              <p className="font-semibold text-slate-900">{fr ? "Détails du ticket" : "Ticket details"}</p>
              <div className="flex justify-between gap-2"><span className="text-slate-500">{fr ? "Demandeur" : "Raised by"}</span>
                {creatorRole === "customer" ? <Link href={`/admin/customers/${t0.userId}`} className="font-medium text-[var(--primary)] hover:underline">{t0.userName}</Link> : <span className="font-medium">{t0.userName}</span>}
              </div>
              <div className="flex justify-between"><span className="text-slate-500">{fr ? "Catégorie" : "Category"}</span><span>{supportCategoryLabel(t0.category, fr)}</span></div>
              {t0.orderId && (
                <div className="flex justify-between"><span className="text-slate-500">{fr ? "Commande liée" : "Linked order"}</span><Link href={`/admin/orders/${t0.orderId}`} className="text-[var(--primary)] hover:underline">{fr ? "Voir la commande" : "View order"}</Link></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">{fr ? "Créé le" : "Created"}</span><span>{localDay(t0.createdAt)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">{fr ? "Agent" : "Agent"}</span><span>{t0.assigneeName ?? (fr ? "Non assigné" : "Unassigned")}</span></div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-900">{fr ? "Assigner" : "Assign"}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={assignBusy || !rt.user || t0.assigneeId === rt.user.id} onClick={() => rt.user && void assign(rt.user.id)}>
                  {fr ? "Me l'assigner" : "Assign to me"}
                </Button>
                {t0.assigneeId && (
                  <Button size="sm" variant="ghost" disabled={assignBusy} onClick={() => void assign(null)}>{fr ? "Remettre dans la file" : "Back to the queue"}</Button>
                )}
              </div>
              {adminAccounts.length > 0 && (
                <select
                  className="input-premium w-full px-3 py-2 text-sm"
                  value={t0.assigneeId ?? ""}
                  disabled={assignBusy}
                  onChange={(e) => void assign(e.target.value || null)}
                  aria-label={fr ? "Assigner à" : "Assign to"}
                >
                  <option value="">{fr ? "Choisir un agent…" : "Choose an agent…"}</option>
                  {adminAccounts.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} · {u.role.replace("admin_", "")}</option>
                  ))}
                </select>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 p-5">
              <p className="text-sm font-semibold text-slate-900">{fr ? "Mettre à jour le statut" : "Update status"}</p>
              <div className="flex flex-wrap gap-2">
                {(["open", "pending", "resolved", "closed"] as const).map((s) => (
                  <button
                    key={s}
                    disabled={statusBusy || t0.status === s}
                    onClick={() => setStatus(s)}
                    className={
                      t0.status === s
                        ? "rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white"
                        : "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    }
                  >
                    {SUPPORT_STATUS_LABEL[s][fr ? "fr" : "en"]}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
