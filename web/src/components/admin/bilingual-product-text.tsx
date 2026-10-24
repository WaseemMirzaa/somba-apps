"use client";

import { Badge } from "@/components/ui/badge";
import { TranslationBadge } from "@/components/seller/translation-badge";
import { useLocale } from "@/context/locale-context";
import { fieldOrigin, ownText, type Lang } from "@/lib/i18n-fields";
import type { Product } from "@/lib/realtime/types";
import { readVariantLabels, readVariants } from "@/lib/variants";

/**
 * A listing's title and description in both languages side by side, with where each text comes from (written by the
 * seller, translated automatically, waiting, failed). A moderator approves what shoppers will actually read in
 * either language, not just the language the seller wrote.
 */
export function BilingualProductText({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const source: Lang = product.sourceLang === "fr" ? "fr" : "en";
  const sourceName = ownText(product, "name", source);
  const sourceDesc = ownText(product, "description", source);
  const optionGroups = readVariants(product.variants);
  const optionLabels = readVariantLabels(product.variantLabels);
  const optionText = (lang: Lang): string => {
    const set = optionLabels?.[lang] ?? [];
    return set.length === optionGroups.length && set.every((g) => g.name) ? set.map((g) => `${g.name}: ${g.options.join(", ")}`).join(" · ") : "";
  };

  return (
    <div className="grid gap-3 md:grid-cols-2" data-testid="bilingual-text">
      {(["en", "fr"] as const).map((lang) => {
        const name = ownText(product, "name", lang);
        const desc = ownText(product, "description", lang);
        return (
          <div key={lang} className="min-w-0 rounded-xl border border-[var(--border)] p-3">
            <p className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {lang === "en" ? (fr ? "Anglais" : "English") : fr ? "Français" : "French"}
              {lang === source && <Badge variant="default">{fr ? "Langue d'origine" : "Original language"}</Badge>}
            </p>
            <div className="mt-2 space-y-1">
              <p className="break-words text-sm font-semibold text-slate-900">{name || "—"}</p>
              <TranslationBadge by="seller" fr={fr} origin={fieldOrigin(product, "name", lang, name, sourceName)} />
            </div>
            <div className="mt-3 space-y-1">
              <p className={`whitespace-pre-line break-words text-sm text-slate-600 ${compact ? "line-clamp-3" : ""}`}>{desc || "—"}</p>
              <TranslationBadge by="seller" fr={fr} origin={fieldOrigin(product, "description", lang, desc, sourceDesc)} />
            </div>
            {optionGroups.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="break-words text-xs text-slate-500">
                  {fr ? "Options" : "Options"}: {optionText(lang) || "—"}
                </p>
                {optionText(lang) && (
                  <TranslationBadge
                    by="seller"
                    fr={fr}
                    origin={product.machineTranslated?.includes(`variantLabels.${lang}`) ? ((product.translationStatus ?? "done") === "pending" ? "pending" : "machine") : "author"}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
