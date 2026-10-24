"use client";

import { Badge } from "@/components/ui/badge";
import type { FieldOrigin } from "@/lib/i18n-fields";

const LABEL: Record<Exclude<FieldOrigin, "empty">, { en: string; fr: string; variant: "success" | "info" | "warning" | "danger" }> = {
  author: { en: "Written by you", fr: "Écrit par vous", variant: "success" },
  machine: { en: "Translated automatically", fr: "Traduit automatiquement", variant: "info" },
  pending: { en: "Translating…", fr: "Traduction en cours…", variant: "warning" },
  failed: { en: "Translation failed", fr: "Échec de la traduction", variant: "danger" },
};

/** Where one language of a listing's text comes from (written by the seller, translated automatically, waiting, failed). */
export function TranslationBadge({
  origin,
  fr,
  className,
  by = "you",
}: {
  origin: FieldOrigin;
  fr: boolean;
  className?: string;
  /** Whose words "written by" refers to: the seller reading their own listing ("you") or staff reviewing it ("seller"). */
  by?: "you" | "seller";
}) {
  if (origin === "empty") return null;
  const l = LABEL[origin];
  const text = origin === "author" && by === "seller" ? (fr ? "Écrit par le vendeur" : "Written by the seller") : fr ? l.fr : l.en;
  return (
    <Badge variant={l.variant} className={className}>
      {text}
    </Badge>
  );
}
