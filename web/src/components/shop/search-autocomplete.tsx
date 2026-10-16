"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useCatalog } from "@/lib/catalog";
import { useLocale } from "@/context/locale-context";

/** Live catalogue suggestions: every link opens a real product. */
export function SearchAutocomplete({ query, onSelect }: { query: string; onSelect?: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const catalog = useCatalog();
  const suggestions = useMemo(() => {
    if (!query || query.trim().length < 2) return [];
    const q = query.trim().toLowerCase();
    return catalog
      .filter((p) => p.name.toLowerCase().includes(q) || p.nameFr.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .slice(0, 5);
  }, [query, catalog]);

  if (suggestions.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-xl border border-[var(--border)] bg-white shadow-lg">
      {suggestions.map((p) => (
        <Link
          key={p.id}
          href={`/shop/products/${p.id}`}
          onClick={onSelect}
          className="block px-4 py-2 text-sm hover:bg-blue-50"
        >
          {fr ? p.nameFr : p.name} <span className="text-slate-400">· {fr ? p.categoryFr : p.category}</span>
        </Link>
      ))}
      <Link href={`/shop/search?q=${encodeURIComponent(query)}`} onClick={onSelect} className="block border-t px-4 py-2 text-sm font-medium text-[var(--primary)]">
        {fr ? "Voir tous les résultats →" : "See all results →"}
      </Link>
    </div>
  );
}
