"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { TranslationBadge } from "@/components/seller/translation-badge";
import { useLocale } from "@/context/locale-context";
import { useToast } from "@/context/toast-context";
import { useSellerData, type ProductInput, type SellerProductRow } from "@/lib/seller";
import { errMessage } from "@/lib/seller-labels";
import { autoTranslateHint, fieldOrigin, ownText, titleRequiredMessage, type FieldOrigin, type Lang } from "@/lib/i18n-fields";
import { readVariantLabels, readVariants } from "@/lib/variants";

type Field = "name" | "description";

const FIELD_LABEL: Record<Field, { en: string; fr: string }> = {
  name: { en: "Title", fr: "Titre" },
  description: { en: "Description", fr: "Description" },
};

/** The key the API takes for one language of one field: `nameFr` / `name`, `descriptionFr` / `description`. */
const patchKey = (field: Field, lang: Lang) => (lang === "fr" ? `${field}Fr` : field);

/**
 * Both languages of a listing's title and description, with where each comes from (written by the seller,
 * translated automatically, waiting for the translator, failed) and an inline editor. Saving writes the seller's own
 * text, which the machine never overwrites afterwards.
 */
export function TranslationsPanel({ product }: { product: SellerProductRow }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const { toast } = useToast();
  const { updateProduct, retranslateProduct } = useSellerData();
  const [editing, setEditing] = useState<{ field: Field; lang: Lang } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const source: Lang = product.sourceLang === "fr" ? "fr" : "en";

  function startEdit(field: Field, lang: Lang) {
    setEditing({ field, lang });
    setDraft(ownText(product, field, lang));
    setError(null);
  }

  async function save() {
    if (!editing || busy) return;
    const { field, lang } = editing;
    const value = draft.trim();
    // C-I1: the title the listing was written in cannot be emptied (the other language is only a translation of it).
    if (field === "name" && lang === source && !value) {
      const msg = titleRequiredMessage(fr);
      setError(msg);
      toast(msg, "error");
      return;
    }
    if (value === ownText(product, field, lang)) {
      setEditing(null);
      return;
    }
    setBusy("save");
    setError(null);
    try {
      const saved = await updateProduct(product.id, { [patchKey(field, lang)]: value } as Partial<ProductInput>);
      const backToReview = product.status === "live" && saved.status === "pending";
      toast(
        backToReview
          ? fr ? "Texte enregistré. L'annonce repasse en validation." : "Text saved. The listing goes back to review."
          : fr ? "Texte enregistré" : "Text saved",
        backToReview ? "info" : "success",
      );
      setEditing(null);
    } catch (e) {
      const msg = errMessage(e);
      setError(msg);
      toast(msg, "error");
    } finally {
      setBusy(null);
    }
  }

  async function retry() {
    if (busy) return;
    setBusy("retry");
    try {
      await retranslateProduct(product.id);
      toast(fr ? "Nouvelle tentative de traduction lancée" : "Translation retry started", "info");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  // Option names and values ("Size: S, M · Colour: Black"): read-only here, translated automatically like the texts.
  const optionGroups = readVariants(product.variants);
  const optionLabels = readVariantLabels(product.variantLabels);
  const optionStatus = product.translationStatus ?? "done";
  const optionRow = (lang: Lang): { text: string; origin: FieldOrigin } => {
    const set = optionLabels?.[lang] ?? [];
    const fits = set.length === optionGroups.length && set.every((g, i) => g.name && g.options.length === optionGroups[i].options.length);
    if (fits) {
      const text = set.map((g) => `${g.name}: ${g.options.join(", ")}`).join(" · ");
      const machine = product.machineTranslated?.includes(`variantLabels.${lang}`);
      return { text, origin: machine ? (optionStatus === "pending" ? "pending" : "machine") : "author" };
    }
    return { text: "", origin: optionStatus === "pending" ? "pending" : optionStatus === "failed" ? "failed" : "empty" };
  };

  const rows: { field: Field; lang: Lang }[] = [
    { field: "name", lang: "en" },
    { field: "name", lang: "fr" },
    { field: "description", lang: "en" },
    { field: "description", lang: "fr" },
  ];

  return (
    <div className="space-y-4" data-testid="translations-panel">
      <p className="text-xs text-slate-500">
        {fr
          ? `Écrit en ${source === "fr" ? "français" : "anglais"}. L'autre langue est traduite automatiquement ; corrigez-la ici si besoin, votre texte ne sera plus jamais remplacé.`
          : `Written in ${source === "fr" ? "French" : "English"}. The other language is translated automatically; correct it here if needed and your text is never replaced.`}
        {" "}
        {autoTranslateHint(fr)}
      </p>
      {rows.map(({ field, lang }) => {
        const text = ownText(product, field, lang);
        const sourceText = ownText(product, field, source);
        const origin = fieldOrigin(product, field, lang, text, sourceText);
        const isEditing = editing?.field === field && editing.lang === lang;
        const id = `tr-${field}-${lang}`;
        return (
          <div key={id} className="rounded-xl border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900">
                {fr ? FIELD_LABEL[field].fr : FIELD_LABEL[field].en} ({lang.toUpperCase()})
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <TranslationBadge origin={origin} fr={fr} />
                {origin === "failed" && (
                  <Button size="sm" variant="secondary" onClick={() => void retry()} disabled={busy !== null}>
                    {busy === "retry" ? "…" : fr ? "Réessayer" : "Retry"}
                  </Button>
                )}
                {!isEditing && (
                  <Button size="sm" variant="secondary" onClick={() => startEdit(field, lang)} disabled={busy !== null}>
                    {text ? (fr ? "Modifier" : "Edit") : fr ? "Écrire" : "Write"}
                  </Button>
                )}
              </div>
            </div>
            {isEditing ? (
              <div className="mt-2 space-y-2">
                <label className="sr-only" htmlFor={id}>{`${fr ? FIELD_LABEL[field].fr : FIELD_LABEL[field].en} (${lang.toUpperCase()})`}</label>
                {field === "name" ? (
                  <input id={id} className="input-premium w-full px-3 py-2 text-sm" maxLength={200} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                ) : (
                  <textarea id={id} className="input-premium w-full px-3 py-2 text-sm" rows={4} maxLength={5000} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                )}
                {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
                {!(field === "name" && lang === source) && (
                  <p className="text-xs text-slate-500">
                    {fr ? "Laissez vide pour que la plateforme la traduise de nouveau." : "Leave empty to have the platform translate it again."}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void save()} disabled={busy !== null}>{busy === "save" ? "…" : fr ? "Enregistrer" : "Save"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy !== null}>{fr ? "Annuler" : "Cancel"}</Button>
                </div>
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{text || "—"}</p>
            )}
          </div>
        );
      })}
      {optionGroups.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] p-3" data-testid="translations-options">
          <p className="text-sm font-semibold text-slate-900">{fr ? "Options (taille, couleur…)" : "Options (size, colour…)"}</p>
          <div className="mt-2 space-y-2">
            {(["en", "fr"] as const).map((lang) => {
              const { text, origin } = optionRow(lang);
              return (
                <div key={lang} className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 text-sm text-slate-700">
                    <span className="mr-2 text-xs font-semibold text-slate-500">{lang.toUpperCase()}</span>
                    {text || "—"}
                  </p>
                  <TranslationBadge origin={origin} fr={fr} />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
