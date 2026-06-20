"use client";

import { useState, useRef } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useToast } from "@/context/toast-context";
import { useLocale } from "@/context/locale-context";
import { useCategories, type Category, type CategoryInput } from "@/context/categories-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { Pencil, Upload, X, ImageIcon } from "lucide-react";

const EMPTY: CategoryInput = { name: "", nameFr: "", icon: "🏷️", image: "" };

export default function AdminCategoriesPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { categories, addCategory, updateCategory } = useCategories();

  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CategoryInput>(EMPTY);
  const fileRef = useRef<HTMLInputElement>(null);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }

  function openEdit(c: Category) {
    setEditing(c);
    setForm({ name: c.name, nameFr: c.nameFr, icon: c.icon, image: c.image });
    setOpen(true);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, image: String(reader.result) }));
    reader.readAsDataURL(file);
  }

  function save() {
    if (!form.name.trim() || !form.image.trim()) {
      toast(fr ? "Le nom et l'image sont requis" : "Name and image are required", "info");
      return;
    }
    const payload: CategoryInput = { ...form, nameFr: form.nameFr.trim() || form.name.trim() };
    if (editing) {
      updateCategory(editing.id, payload);
      toast(fr ? "Catégorie mise à jour" : "Category updated");
    } else {
      addCategory(payload);
      toast(fr ? "Catégorie ajoutée" : "Category added");
    }
    setOpen(false);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Gestion des catégories" : "Category Management"}
        subtitle={fr ? "Nom et image affichés dans la boutique" : "Name and image shown across the storefront"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Catégories" : "Categories" }]}
        actions={<Button onClick={openAdd}>{fr ? "+ Ajouter une catégorie" : "+ Add category"}</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {categories.map((c) => (
          <div key={c.id} className="card-premium group overflow-hidden">
            <div className="relative h-32 w-full overflow-hidden bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt={c.name} className="h-full w-full object-cover" />
              <button
                onClick={() => openEdit(c)}
                className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-white/90 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-white"
              >
                <Pencil className="h-3.5 w-3.5" /> {fr ? "Modifier" : "Edit"}
              </button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editing ? (fr ? "Modifier la catégorie" : "Edit category") : (fr ? "Nouvelle catégorie" : "New category")}
              </h2>
              <button onClick={() => setOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Nom (EN)" : "Name (EN)"}</label>
                <input
                  className="input-premium w-full px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={fr ? "ex. Électronique" : "e.g. Electronics"}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Nom (FR)" : "Name (FR)"}</label>
                <input
                  className="input-premium w-full px-3 py-2 text-sm"
                  value={form.nameFr}
                  onChange={(e) => setForm((f) => ({ ...f, nameFr: e.target.value }))}
                  placeholder={fr ? "ex. Électronique" : "e.g. Électronique"}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Icône (emoji)" : "Icon (emoji)"}</label>
                <input
                  className="input-premium w-24 px-3 py-2 text-center text-lg"
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  maxLength={2}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">{fr ? "Image de la catégorie" : "Category image"}</label>
                <div className="flex items-start gap-4">
                  <div className="relative flex h-24 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50">
                    {form.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.image} alt="preview" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-slate-300" />
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Upload className="h-4 w-4" /> {fr ? "Téléverser une image" : "Upload image"}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickFile} />
                    <input
                      className="input-premium w-full px-3 py-2 text-xs"
                      value={form.image.startsWith("data:") ? "" : form.image}
                      onChange={(e) => setForm((f) => ({ ...f, image: e.target.value }))}
                      placeholder={fr ? "…ou collez une URL d'image" : "…or paste an image URL"}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                {fr ? "Annuler" : "Cancel"}
              </button>
              <Button onClick={save}>{editing ? (fr ? "Enregistrer" : "Save") : (fr ? "Ajouter" : "Add")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
