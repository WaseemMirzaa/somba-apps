"use client";

import { useMemo } from "react";
import Link from "next/link";
import { products } from "@/lib/mock-data";
import { categoryLabel } from "@/lib/admin-i18n";
import { useLocale } from "@/context/locale-context";

export function SearchAutocomplete({ query, onSelect }: { query: string; onSelect?: () => void }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const suggestions = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .slice(0, 5);
  }, [query]);

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
          {fr ? p.nameFr : p.name} <span className="text-slate-400">· {fr ? (p.categoryFr ?? categoryLabel(p.category, fr)) : p.category}</span>
        </Link>
      ))}
      <Link href={`/shop/search?q=${encodeURIComponent(query)}`} onClick={onSelect} className="block border-t px-4 py-2 text-sm font-medium text-[var(--primary)]">
        {fr ? "Voir tous les résultats →" : "See all results →"}
      </Link>
    </div>
  );
}
