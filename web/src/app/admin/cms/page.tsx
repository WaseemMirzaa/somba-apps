"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImageIcon, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { errMsg, useServerList, type CmsServerRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { autoTranslateHint, frInForm, localized } from "@/lib/i18n-fields";
import { useRealtime } from "@/context/realtime-context";
import { uploadShopPhoto } from "@/lib/shop-upload";
import { COLOR_KEYS, COLOR_LABEL, LINK_LABEL, LINK_TARGET_HINT, LINK_TYPES, cardError, cardFields, cardPayload, cardState, gradientFor, movedKeys, type CardDraft } from "@/lib/cms-cards";

const TYPES = ["banner", "page", "faq", "popup", "notice"] as const;
const TYPE_FR: Record<string, string> = { banner: "Bannière", page: "Page", faq: "FAQ", popup: "Popup", notice: "Avis" };

type Draft = CardDraft & {
  isNew: boolean;
  /** The texts as loaded: on an edit only a text that changed is sent, so an automatic translation stays automatic. */
  was?: { title: string; titleFr: string; body: string; bodyFr: string };
};
const EMPTY: Draft = { key: "", title: "", titleFr: "", body: "", bodyFr: "", type: "banner", active: true, isNew: true, ...cardFields({ key: "", title: "", body: "", type: "banner", active: true }) };

const STATE_LABEL = {
  live: { en: "Live", fr: "En ligne", variant: "success" },
  hidden: { en: "Hidden", fr: "Masqué", variant: "default" },
  scheduled: { en: "Scheduled", fr: "Programmé", variant: "warning" },
  ended: { en: "Ended", fr: "Terminé", variant: "default" },
} as const;

export default function AdminCmsPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  // No pushEvents: a change can be a delete or a new order, so the whole list is read again (below).
  const { items: blocks, reload, error: loadError, loading } = useServerList<CmsServerRow>("cms:list");
  const rt = useRealtime();
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });
  useEffect(() => {
    if (rt.status !== "connected") return;
    const sock = socketClient.current;
    if (!sock) return;
    const onChange = () => void reloadRef.current();
    sock.on("cms:updated", onChange);
    return () => {
      sock.off("cms:updated", onChange);
    };
  }, [rt.status]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<CmsServerRow | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  async function pickImage(files: FileList | null) {
    const file = files?.[0];
    if (fileInput.current) fileInput.current.value = "";
    if (!file || !draft) return;
    setUploading(true);
    try {
      const url = await uploadShopPhoto(file, fr);
      setDraft((cur) => (cur ? { ...cur, imageUrl: url } : cur));
      toast(fr ? "Image téléversée" : "Image uploaded", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setUploading(false);
    }
  }

  async function move(index: number, by: -1 | 1) {
    const keys = blocks.map((b) => b.key);
    const next = movedKeys(keys, index, by);
    if (next === keys) return;
    setBusyKey(keys[index]);
    try {
      await socketClient.request("cms:reorder", { keys: next });
      await reload();
      toast(fr ? "Ordre enregistré" : "Order saved", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusyKey(null);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const b = toDelete;
    setBusyKey(b.key);
    try {
      await socketClient.request("cms:delete", { key: b.key });
      setToDelete(null);
      await reload();
      toast(fr ? "Bloc supprimé" : "Block deleted", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusyKey(null);
    }
  }

  async function save(d: Draft) {
    const problem = cardError(d, fr);
    if (problem) {
      setError(problem);
      toast(problem, "error");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // A language left empty is not sent (the platform translates it); on an edit only a text that changed is sent.
      const text = (key: "title" | "titleFr" | "body" | "bodyFr") => {
        const value = d[key].trim();
        if (d.isNew) return value ? { [key]: value } : {};
        return value !== (d.was?.[key] ?? "").trim() ? { [key]: value } : {};
      };
      await socketClient.request("cms:upsert", {
        key: d.key.trim(),
        ...text("title"),
        ...text("titleFr"),
        ...text("body"),
        ...text("bodyFr"),
        type: d.type,
        active: d.active,
        ...cardPayload(d),
      });
      await reload();
      setDraft(null);
      toast(fr ? "Bloc enregistré" : "Block saved", "success");
    } catch (e) {
      setError(errMsg(e));
      toast(errMsg(e), "error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(block: CmsServerRow) {
    const titleFr = frInForm(block.title, block.titleFr);
    const bodyFr = frInForm(block.body, block.bodyFr);
    setDraft({ key: block.key, title: block.title, titleFr, body: block.body, bodyFr, type: block.type, active: block.active, ...cardFields(block), isNew: false, was: { title: block.title, titleFr, body: block.body, bodyFr } });
    setError(null);
  }

  async function toggle(b: CmsServerRow) {
    try {
      await socketClient.request("cms:upsert", { key: b.key, active: !b.active });
      await reload();
      toast(b.active ? (fr ? "Bloc masqué" : "Block hidden") : fr ? "Bloc publié" : "Block published", "success");
    } catch (e) {
      toast(errMsg(e), "error");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "CMS — Blocs de contenu" : "CMS — Content blocks"}
        subtitle={fr ? "Blocs enregistrés sur le serveur ; seuls les blocs actifs sont visibles par les clients" : "Blocks stored on the server; only active blocks are visible to shoppers"}
        breadcrumbs={[adminBreadcrumb(locale), { label: "CMS" }]}
        actions={<Button size="sm" onClick={() => { setDraft({ ...EMPTY }); setError(null); }}>{fr ? "Nouveau bloc" : "New block"}</Button>}
      />

      {loadError && <SectionError message={loadError} onRetry={reload} />}
      {loading && !loadError && <SectionLoading />}

      {draft && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <h3 className="font-semibold">{draft.isNew ? (fr ? "Nouveau bloc" : "New block") : `${fr ? "Modifier" : "Edit"} — ${draft.key}`}</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <input className="input-premium px-4 py-2 text-sm" placeholder={fr ? "Clé unique (ex. home-hero)" : "Unique key (e.g. home-hero)"} value={draft.key} disabled={!draft.isNew} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />
              <input className="input-premium px-4 py-2 text-sm sm:col-span-2" placeholder={fr ? "Titre (EN)" : "Title (EN)"} aria-label={fr ? "Titre (EN)" : "Title (EN)"} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              <input className="input-premium px-4 py-2 text-sm sm:col-span-3" placeholder={fr ? "Titre (FR)" : "Title (FR)"} aria-label={fr ? "Titre (FR)" : "Title (FR)"} value={draft.titleFr} onChange={(e) => setDraft({ ...draft, titleFr: e.target.value })} />
              <select className="input-premium px-4 py-2 text-sm" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
                {TYPES.map((tp) => (
                  <option key={tp} value={tp}>{fr ? TYPE_FR[tp] : tp}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                {fr ? "Visible par les clients" : "Visible to shoppers"}
              </label>
            </div>
            {draft.type === "banner" && (
              <>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-xs text-slate-500">
                {fr ? "Ouvre au toucher" : "Opens on tap"}
                <select className="input-premium w-full px-4 py-2 text-sm" value={draft.linkType} onChange={(e) => setDraft({ ...draft, linkType: e.target.value as Draft["linkType"] })}>
                  {LINK_TYPES.map((lt) => (
                    <option key={lt} value={lt}>{LINK_LABEL[lt][fr ? "fr" : "en"]}</option>
                  ))}
                </select>
              </label>
              {draft.linkType && draft.linkType !== "deals" && (
                <label className="space-y-1 text-xs text-slate-500 sm:col-span-2">
                  {fr ? "Cible" : "Target"}
                  <input className="input-premium w-full px-4 py-2 text-sm" placeholder={LINK_TARGET_HINT[draft.linkType]?.[fr ? "fr" : "en"]} value={draft.linkTarget} onChange={(e) => setDraft({ ...draft, linkTarget: e.target.value })} />
                </label>
              )}
              <label className="space-y-1 text-xs text-slate-500">
                {fr ? "Bouton (EN)" : "Button (EN)"}
                <input className="input-premium w-full px-4 py-2 text-sm" maxLength={40} placeholder={fr ? "ex. Voir" : "e.g. Shop now"} value={draft.ctaText} onChange={(e) => setDraft({ ...draft, ctaText: e.target.value })} />
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                {fr ? "Bouton (FR)" : "Button (FR)"}
                <input className="input-premium w-full px-4 py-2 text-sm" maxLength={40} placeholder={fr ? "ex. J’en profite" : "e.g. J’en profite"} value={draft.ctaTextFr} onChange={(e) => setDraft({ ...draft, ctaTextFr: e.target.value })} />
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                {fr ? "Couleur (sans image)" : "Colour (no picture)"}
                <select className="input-premium w-full px-4 py-2 text-sm" value={draft.colorKey} onChange={(e) => setDraft({ ...draft, colorKey: e.target.value as Draft["colorKey"] })}>
                  <option value="">{fr ? "Par défaut" : "Default"}</option>
                  {COLOR_KEYS.map((ck) => (
                    <option key={ck} value={ck}>{COLOR_LABEL[ck][fr ? "fr" : "en"]}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                {fr ? "Visible à partir du" : "Visible from"}
                <input type="datetime-local" className="input-premium w-full px-4 py-2 text-sm" value={draft.startsAt} onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })} />
              </label>
              <label className="space-y-1 text-xs text-slate-500">
                {fr ? "Visible jusqu’au" : "Visible until"}
                <input type="datetime-local" className="input-premium w-full px-4 py-2 text-sm" value={draft.endsAt} onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="flex h-20 w-40 items-center justify-center overflow-hidden rounded-xl text-white"
                style={draft.imageUrl ? undefined : { background: gradientFor(draft.colorKey) }}
                data-testid="cms-card-preview"
              >
                {draft.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draft.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-6 w-6 opacity-60" aria-hidden />
                )}
              </div>
              <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" data-testid="cms-image-input" onChange={(e) => void pickImage(e.target.files)} />
              <Button size="sm" variant="secondary" type="button" disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? "…" : draft.imageUrl ? (fr ? "Changer l’image" : "Change picture") : fr ? "Téléverser une image" : "Upload picture"}
              </Button>
              {draft.imageUrl && (
                <Button size="sm" variant="ghost" type="button" onClick={() => setDraft({ ...draft, imageUrl: "" })}>{fr ? "Retirer l’image" : "Remove picture"}</Button>
              )}
              <p className="text-xs text-slate-500">{fr ? "Sans image, l’app affiche un dégradé de la couleur choisie." : "Without a picture the app draws a gradient in the chosen colour."}</p>
            </div>
              </>
            )}
            <textarea className="input-premium w-full px-4 py-2 text-sm" rows={5} placeholder={fr ? "Contenu (EN)" : "Body (EN)"} aria-label={fr ? "Contenu (EN)" : "Body (EN)"} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            <textarea className="input-premium w-full px-4 py-2 text-sm" rows={5} placeholder={fr ? "Contenu (FR)" : "Body (FR)"} aria-label={fr ? "Contenu (FR)" : "Body (FR)"} value={draft.bodyFr} onChange={(e) => setDraft({ ...draft, bodyFr: e.target.value })} />
            <p className="text-xs text-slate-500">{autoTranslateHint(fr)}</p>
            <ErrorNote message={error} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => save(draft)} disabled={saving}>{saving ? "…" : fr ? "Enregistrer" : "Save"}</Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={saving}>{fr ? "Annuler" : "Cancel"}</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {blocks.length === 0 && <p className="text-sm text-slate-400">{fr ? "Aucun bloc." : "No blocks yet."}</p>}
        {blocks.map((block, i) => (
          <Card key={block.id} className={!block.active ? "opacity-60" : ""}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="flex items-center gap-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-[var(--primary)]">{i + 1}</span>
                {block.type === "banner" && (
                  <div className="h-12 w-20 shrink-0 overflow-hidden rounded-lg" style={block.imageUrl ? undefined : { background: gradientFor(block.colorKey) }}>
                    {block.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={block.imageUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                )}
                <div>
                  <h3 className="font-semibold">{localized(block, "title", fr)}</h3>
                  <p className="text-xs text-slate-500">{block.key} · {fr ? (TYPE_FR[block.type] ?? block.type) : block.type}</p>
                  {localized(block, "body", fr) && <p className="mt-1 line-clamp-1 max-w-xl text-xs text-slate-400">{localized(block, "body", fr)}</p>}
                  {(block.linkType || block.startsAt || block.endsAt) && (
                    <p className="mt-1 text-xs text-slate-400">
                      {block.linkType && `${LINK_LABEL[block.linkType as keyof typeof LINK_LABEL]?.[fr ? "fr" : "en"] ?? block.linkType}${block.linkTarget ? `: ${block.linkTarget}` : ""}`}
                      {block.startsAt && ` · ${fr ? "dès le" : "from"} ${new Date(block.startsAt).toLocaleString(fr ? "fr-FR" : "en-GB")}`}
                      {block.endsAt && ` · ${fr ? "jusqu’au" : "until"} ${new Date(block.endsAt).toLocaleString(fr ? "fr-FR" : "en-GB")}`}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const st = STATE_LABEL[cardState(block)];
                  return <Badge variant={st.variant}>{fr ? st.fr : st.en}</Badge>;
                })()}
                <Button variant="ghost" size="sm" aria-label={fr ? "Monter" : "Move up"} disabled={i === 0 || busyKey !== null} onClick={() => void move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" aria-label={fr ? "Descendre" : "Move down"} disabled={i === blocks.length - 1 || busyKey !== null} onClick={() => void move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                <Button variant="secondary" size="sm" onClick={() => toggle(block)}>{block.active ? (fr ? "Masquer" : "Hide") : fr ? "Publier" : "Publish"}</Button>
                <Button variant="secondary" size="sm" onClick={() => startEdit(block)}>
                  {fr ? "Modifier" : "Edit"}
                </Button>
                <Button variant="ghost" size="sm" aria-label={fr ? "Supprimer" : "Delete"} disabled={busyKey !== null} onClick={() => setToDelete(block)}><Trash2 className="h-4 w-4 text-red-600" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Modal
        open={!!toDelete}
        title={fr ? "Supprimer ce bloc ?" : "Delete this block?"}
        onClose={() => setToDelete(null)}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setToDelete(null)}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button size="sm" variant="danger" onClick={() => void confirmDelete()} disabled={busyKey !== null}>{fr ? "Supprimer" : "Delete"}</Button>
          </>
        }
      >
        <p>
          {fr
            ? `« ${toDelete ? localized(toDelete, "title", true) : ""} » disparaît de l’accueil de l’app. Cette action est définitive.`
            : `“${toDelete ? localized(toDelete, "title", false) : ""}” disappears from the app home. This cannot be undone.`}
        </p>
      </Modal>
    </div>
  );
}
