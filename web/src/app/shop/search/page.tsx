"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useRealtime } from "@/context/realtime-context";
import { socketClient } from "@/lib/realtime/socket-client";
import { PageHeader } from "@/components/ui/page-header";
import { ProductCard } from "@/components/landing/product-card";
import { PageLoader } from "@/components/ui/loader";
import { useLocale } from "@/context/locale-context";
import { useCatalog } from "@/lib/catalog";
import { matchesSearch } from "@/lib/i18n-fields";

function SearchResults() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") || "").toLowerCase();
  const { t, locale } = useLocale();
  const fr = locale === "fr";
  const products = useCatalog();
  const rt = useRealtime();
  // Ranked ids from the server (accent- and typo-tolerant); null while unavailable → local filter below.
  const [server, setServer] = useState<{ q: string; ids: string[] } | null>(null);

  useEffect(() => {
    if (rt.status !== "connected" || query.trim().length < 2) return;
    let alive = true;
    socketClient
      .request<{ ids: string[] }>("products:search", { q: query, limit: 200 })
      .then((r) => alive && setServer({ q: query, ids: r.ids }))
      .catch(() => alive && setServer(null));
    return () => {
      alive = false;
    };
  }, [query, rt.status]);

  const visible = products;
  const byId = new Map(visible.map((p) => [p.id, p]));
  const results = server && server.q === query
    ? server.ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []))
    : query
    ? // Same rules as the server: accents and case ignored; both languages of the name, category and description.
      visible.filter((p) =>
        matchesSearch(query, [p.name, p.nameFr, p.category, p.categoryFr, p.description, p.descriptionFr, p.seller]),
      )
    : visible;

  return (
    <div className="space-y-8">
      <PageHeader
        title={t("searchResults")}
        subtitle={query ? (fr ? `"${query}" — ${results.length} résultats` : `"${query}" — ${results.length} results`) : (fr ? `${results.length} produits` : `${results.length} products`)}
        breadcrumbs={[
          { label: locale === "fr" ? "Boutique" : "Shop", href: "/" },
          { label: t("searchResults") },
        ]}
      />

      {results.length === 0 ? (
        <div className="card-premium py-16 text-center">
          <p className="text-slate-500">{fr ? <>Aucun produit trouvé pour &quot;{query}&quot;</> : <>No products found for &quot;{query}&quot;</>}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {results.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ShopSearchPage() {
  return (
    <Suspense fallback={<PageLoader className="py-12" />}>
      <SearchResults />
    </Suspense>
  );
}
