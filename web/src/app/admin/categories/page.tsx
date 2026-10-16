"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Modal, ErrorNote } from "@/components/admin/modal";
import { NoticeBar } from "@/components/admin/demo-badge";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg, useServerList } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import type { Category } from "@/lib/realtime/types";
import { Pencil, Trash2, ImageIcon, X } from "lucide-react";

type Form = { name: string; nameFr: string; icon: string; image: string; sortOrder: string };
const EMPTY: Form = { name: "", nameFr: "", icon: "🏷️", image: "", sortOrder: "0" };

export default function AdminCategoriesPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  // No push event exists for categories: the list is re-read after every write.
  const { items: categories, reload, error: loadError } = useServerList<Category>("categories:list");

  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [delError, setDelError] = useState<string | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  function openAdd() {
    setEditing(null);
    setForm({ ...EMPTY, sortOrder: String(categories.length) });
    setError(null);
    setOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setForm({ name: c.name, nameFr: c.nameFr ?? "", icon: c.icon ?? "", image: c.image ?? "", sortOrder: String(c.sortOrder ?? 0) });
    setError(null);
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) {
      setError(fr ? "Le nom est requis." : "Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      nameFr: form.nameFr.trim() || form.name.trim(),
      icon: form.icon.trim() || undefined,
      image: form.image.trim() || undefined,
      sortOrder: Number(form.sortOrder) || 0,
    };
    try {
      if (editing) await socketClient.request("categories:update", { id: editing.id, patch: payload });
      else await socketClient.request("categories:create", payload);
      await reload();
      toast(editing ? (fr ? "Catégorie mise à jour" : "Category updated") : fr ? "Catégorie ajoutée" : "Category added", "success");
      setOpen(false);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!deleting) return;
    setDelBusy(true);
    setDelError(null);
    try {
      await socketClient.request("categories:remove", { id: deleting.id });
      await reload();
      toast(fr ? "Catégorie supprimée" : "Category deleted", "success");
      setDeleting(null);
    } catch (e) {
      setDelError(errMsg(e));
    } finally {
      setDelBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Gestion des catégories" : "Category Management"}
        subtitle={fr ? "Catégories enregistrées sur le serveur — nom, icône et image" : "Categories stored on the server — name, icon and image"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Catégories" : "Categories" }]}
        actions={<Button onClick={openAdd}>{fr ? "+ Ajouter une catégorie" : "+ Add category"}</Button>}
      />

      {loadError && <NoticeBar tone="warn">{loadError}</NoticeBar>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {categories.length === 0 && !loadError && <p className="text-sm text-slate-400">{fr ? "Aucune catégorie." : "No categories yet."}</p>}
        {categories.map((c) => (
          <div key={c.id} className="card-premium group overflow-hidden">
            <div className="relative flex h-32 w-full items-center justify-center overflow-hidden bg-slate-100">
              {c.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.image} alt={c.name} className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="h-8 w-8 text-slate-300" />
              )}
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button onClick={() => openEdit(c)} className="flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-white">
                  <Pencil className="h-3.5 w-3.5" /> {fr ? "Modifier" : "Edit"}
                </button>
                <button onClick={() => { setDeleting(c); setDelError(null); }} className="flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-medium text-red-600 shadow-sm hover:bg-white">
                  <Trash2 className="h-3.5 w-3.5" /> {fr ? "Supprimer" : "Delete"}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2 p-4">
              <span className="text-xl">{c.icon}</span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{c.name}</p>
                <p className="truncate text-xs text-slate-500">{c.nameFr}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editing ? (fr ? "Modifier la catégorie" : "Edit category") : fr ? "Nouvelle catégorie" : "New category"}
              </h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Nom (EN)" : "Name (EN)"}</label>
                <input className="input-premium w-full px-3 py-2 text-sm" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Electronics" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Nom (FR)" : "Name (FR)"}</label>
                <input className="input-premium w-full px-3 py-2 text-sm" value={form.nameFr} onChange={(e) => setForm((f) => ({ ...f, nameFr: e.target.value }))} placeholder="Électronique" />
              </div>
              <div className="flex gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Icône (emoji)" : "Icon (emoji)"}</label>
                  <input className="input-premium w-24 px-3 py-2 text-center text-lg" value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} maxLength={4} />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Ordre" : "Sort order"}</label>
                  <input className="input-premium w-24 px-3 py-2 text-sm" inputMode="numeric" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "URL de l'image" : "Image URL"}</label>
                <div className="flex items-start gap-4">
                  <div className="relative flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                    {form.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.image} alt="preview" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-slate-300" />
                    )}
                  </div>
                  <input className="input-premium w-full px-3 py-2 text-xs" value={form.image} onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))} placeholder="https://…" />
                </div>
              </div>
              <ErrorNote message={error} />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={saving}>{fr ? "Annuler" : "Cancel"}</Button>
              <Button size="sm" onClick={save} disabled={saving}>{saving ? "…" : editing ? (fr ? "Enregistrer" : "Save") : fr ? "Ajouter" : "Add"}</Button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={!!deleting}
        onClose={() => !delBusy && setDeleting(null)}
        title={fr ? "Supprimer la catégorie" : "Delete category"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setDeleting(null)} disabled={delBusy}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={remove} disabled={delBusy}>{delBusy ? "…" : fr ? "Supprimer" : "Delete"}</Button>
          </>
        }
      >
        <p>{fr ? `Supprimer « ${deleting?.name} » ? Cette action est définitive.` : `Delete “${deleting?.name}”? This cannot be undone.`}</p>
        <ErrorNote message={delError} />
      </Modal>
    </div>
  );
}
