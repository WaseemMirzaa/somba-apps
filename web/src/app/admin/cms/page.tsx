"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/admin/modal";
import { SectionError, SectionLoading } from "@/components/admin/query-state";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { errMsg, useServerList, type CmsServerRow } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { autoTranslateHint, frInForm, localized } from "@/lib/i18n-fields";

const TYPES = ["banner", "page", "faq", "popup", "notice"] as const;
const TYPE_FR: Record<string, string> = { banner: "Bannière", page: "Page", faq: "FAQ", popup: "Popup", notice: "Avis" };

type Draft = {
  key: string;
  title: string;
  titleFr: string;
  body: string;
  bodyFr: string;
  type: string;
  active: boolean;
  isNew: boolean;
  /** The texts as loaded: on an edit only a text that changed is sent, so an automatic translation stays automatic. */
  was?: { title: string; titleFr: string; body: string; bodyFr: string };
};
const EMPTY: Draft = { key: "", title: "", titleFr: "", body: "", bodyFr: "", type: "banner", active: true, isNew: true };

export default function AdminCmsPage() {
  const { toast } = useToast();
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { items: blocks, reload, error: loadError, loading } = useServerList<CmsServerRow>("cms:list", { pushEvents: ["cms:updated"] });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(d: Draft) {
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
      });
      await reload();
      setDraft(null);
      toast(fr ? "Bloc enregistré" : "Block saved", "success");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(block: CmsServerRow) {
    const titleFr = frInForm(block.title, block.titleFr);
    const bodyFr = frInForm(block.body, block.bodyFr);
    setDraft({ key: block.key, title: block.title, titleFr, body: block.body, bodyFr, type: block.type, active: block.active, isNew: false, was: { title: block.title, titleFr, body: block.body, bodyFr } });
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
                <div>
                  <h3 className="font-semibold">{localized(block, "title", fr)}</h3>
                  <p className="text-xs text-slate-500">{block.key} · {fr ? (TYPE_FR[block.type] ?? block.type) : block.type}</p>
                  {localized(block, "body", fr) && <p className="mt-1 line-clamp-1 max-w-xl text-xs text-slate-400">{localized(block, "body", fr)}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={block.active ? "success" : "default"}>{block.active ? (fr ? "Actif" : "Active") : fr ? "Masqué" : "Hidden"}</Badge>
                <Button variant="secondary" size="sm" onClick={() => toggle(block)}>{block.active ? (fr ? "Masquer" : "Hide") : fr ? "Publier" : "Publish"}</Button>
                <Button variant="secondary" size="sm" onClick={() => startEdit(block)}>
                  {fr ? "Modifier" : "Edit"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
