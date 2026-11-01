"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { OpsError, OpsLoading } from "@/components/warehouse/ops-state";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { TICKET_STATUS, ticketThread, useOpsTickets, type OpsTicket } from "@/lib/ops-support";
import { uploadPhoto } from "@/lib/warehouse-upload";
import { assetUrl } from "@/lib/warehouse-returns";
import { errorMessage } from "@/lib/warehouse-live";
import { pickL } from "@/lib/logistics";

type Audience = "rider" | "warehouse";

const CATEGORIES: Record<Audience, { id: string; en: string; fr: string }[]> = {
  rider: [
    { id: "delivery", en: "A delivery", fr: "Une livraison" },
    { id: "payment", en: "Earnings / cash", fr: "Gains / espèces" },
    { id: "account", en: "My account", fr: "Mon compte" },
    { id: "general", en: "Something else", fr: "Autre chose" },
  ],
  warehouse: [
    { id: "delivery", en: "A parcel or delivery", fr: "Un colis ou une livraison" },
    { id: "returns", en: "A return", fr: "Un retour" },
    { id: "account", en: "My account", fr: "Mon compte" },
    { id: "general", en: "Something else", fr: "Autre chose" },
  ],
};

/** Up to 4 photos: pick, upload, show thumbnails; the URLs go with the message. */
function PhotoPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, 4 - value.length)) urls.push(await uploadPhoto(f));
      onChange([...value, ...urls]);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((u) => (
        <span key={u} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(u)} alt={fr ? "Photo jointe" : "Attached photo"} className="h-14 w-14 rounded-lg border border-[var(--border)] object-cover" />
          <button type="button" onClick={() => onChange(value.filter((x) => x !== u))} aria-label={fr ? "Retirer la photo" : "Remove photo"} className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-0.5 text-slate-500 shadow ring-1 ring-slate-200 hover:text-red-600">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {value.length < 4 && (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60">
          <ImagePlus className="h-4 w-4" />
          {busy ? "…" : fr ? "Ajouter une photo" : "Add a photo"}
        </button>
      )}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void pick(e.target.files)} />
    </div>
  );
}

/** Tickets list + "new ticket" form for a rider or a warehouse member (answered by admin support). */
export function SupportList({ audience, basePath }: { audience: Audience; basePath: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { tickets, loaded, error, put } = useOpsTickets();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CATEGORIES[audience][0].id);
  const [message, setMessage] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const t = await socketClient.request<OpsTicket>("support:open", {
        subject: subject.trim(),
        message: message.trim(),
        category,
        ...(photos.length ? { attachments: photos } : {}),
      });
      put(t);
      setSubject("");
      setMessage("");
      setPhotos([]);
      toast(fr ? `Ticket ${t.reference} envoyé` : `Ticket ${t.reference} sent`);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Assistance" : "Support"}
        subtitle={fr ? "Écrivez à l'équipe support Somba ; vous êtes prévenu dès qu'elle répond." : "Write to the Somba support team; you are notified when they answer."}
      />
      <form onSubmit={submit} className="card-premium space-y-3 p-4">
        <h2 className="font-semibold text-slate-900">{fr ? "Nouveau ticket" : "New ticket"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="input-premium px-4 py-2.5 text-sm" placeholder={fr ? "Sujet" : "Subject"} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} aria-label={fr ? "Sujet" : "Subject"} />
          <select className="input-premium px-4 py-2.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label={fr ? "Catégorie" : "Category"}>
            {CATEGORIES[audience].map((c) => (
              <option key={c.id} value={c.id}>{fr ? c.fr : c.en}</option>
            ))}
          </select>
        </div>
        <textarea className="input-premium w-full px-4 py-2.5 text-sm" rows={3} placeholder={fr ? "Décrivez votre problème…" : "Describe your problem…"} value={message} onChange={(e) => setMessage(e.target.value)} aria-label="Message" />
        <PhotoPicker value={photos} onChange={setPhotos} />
        {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}
        <button type="submit" disabled={busy || !subject.trim() || !message.trim()} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
          {busy ? "…" : fr ? "Envoyer" : "Send"}
        </button>
      </form>

      {error && <OpsError message={error} />}
      <div className="space-y-3">
        <h2 className="font-semibold text-slate-900">{fr ? "Mes tickets" : "My tickets"}</h2>
        {!loaded ? (
          <OpsLoading />
        ) : tickets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{fr ? "Aucun ticket." : "No tickets yet."}</p>
        ) : (
          tickets.map((t) => (
            <Link key={t.id} href={`${basePath}/${t.id}`} className="card-premium flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{t.subject}</p>
                <p className="text-xs text-slate-500">{t.reference} · {new Date(t.updatedAt).toLocaleString(fr ? "fr-FR" : "en-GB")}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {t.userUnread > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-bold text-white">{t.userUnread}</span>}
                <Badge variant={t.status === "resolved" || t.status === "closed" ? "success" : t.status === "pending" ? "info" : "warning"}>{pickL(TICKET_STATUS[t.status], fr, t.status)}</Badge>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/** One ticket: the messages (with photos), a reply box with photos; opening it marks the staff replies as read. */
export function SupportThread({ id, backPath }: { id: string; backPath: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { tickets, loaded, put } = useOpsTickets();
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ticket = tickets.find((t) => t.id === id || t.reference === id);
  const unread = ticket?.userUnread ?? 0;
  const ticketId = ticket?.id;

  useEffect(() => {
    if (!ticketId || !unread) return;
    socketClient.request<OpsTicket>("support:markRead", { id: ticketId }).then(put).catch(() => undefined);
  }, [ticketId, unread, put]);

  if (!ticket) {
    return (
      <div className="space-y-3 py-12 text-center text-slate-500">
        <p>{loaded ? (fr ? "Ticket introuvable" : "Ticket not found") : fr ? "Chargement…" : "Loading…"}</p>
        <Link href={backPath} className="text-[var(--primary)] hover:underline">{fr ? "Mes tickets" : "My tickets"}</Link>
      </div>
    );
  }

  const thread = ticketThread(ticket);
  const closed = ticket.status === "closed";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!ticket || busy || (!text.trim() && photos.length === 0)) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await socketClient.request<OpsTicket>("support:reply", { id: ticket.id, ...(text.trim() ? { text: text.trim() } : {}), ...(photos.length ? { attachments: photos } : {}) });
      put(saved);
      setText("");
      setPhotos([]);
      toast(fr ? "Message envoyé" : "Message sent");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title={ticket.subject}
        subtitle={ticket.reference}
        backHref={backPath}
        actions={<Badge variant={ticket.status === "resolved" || ticket.status === "closed" ? "success" : ticket.status === "pending" ? "info" : "warning"}>{pickL(TICKET_STATUS[ticket.status], fr, ticket.status)}</Badge>}
      />
      <div className="space-y-3">
        {thread.map((m, i) => {
          const staff = m.role !== "rider" && m.role !== "warehouse_staff";
          return (
            <div key={m.id ?? i} className={`rounded-xl p-4 text-sm ${staff ? "mr-8 bg-slate-50" : "ml-8 bg-emerald-50"}`}>
              <p className="text-xs font-medium text-slate-400">
                {staff ? `${m.from} · ${fr ? "Support" : "Support"}` : fr ? "Vous" : "You"} · {new Date(m.at).toLocaleString(fr ? "fr-FR" : "en-GB")}
              </p>
              {m.text && <p className="mt-1 whitespace-pre-wrap text-slate-800">{m.text}</p>}
              {(m.attachments?.length ?? 0) > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.attachments!.map((u) => (
                    <a key={u} href={assetUrl(u)} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={assetUrl(u)} alt={fr ? "Photo jointe" : "Attached photo"} className="h-24 w-24 rounded-lg border border-[var(--border)] object-cover" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {closed ? (
        <p className="text-center text-sm text-slate-500">{fr ? "Ce ticket est fermé." : "This ticket is closed."}</p>
      ) : (
        <form onSubmit={send} className="card-premium space-y-3 p-4">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="input-premium w-full px-4 py-2.5 text-sm" placeholder={fr ? "Votre réponse…" : "Your reply…"} aria-label={fr ? "Votre réponse" : "Your reply"} />
          <PhotoPicker value={photos} onChange={setPhotos} />
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={busy || (!text.trim() && photos.length === 0)} className="btn-primary rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60">
            {busy ? "…" : fr ? "Envoyer" : "Send"}
          </button>
        </form>
      )}
    </div>
  );
}
