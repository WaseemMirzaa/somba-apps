"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Zap } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { FlashCountdown } from "@/components/shop/flash-countdown";
import { useCatalog } from "@/lib/catalog";
import { useFlashSales, type FlashSale } from "@/lib/shop-engage";
import { useLocale } from "@/context/locale-context";
import { formatCurrency } from "@/lib/utils";
import { pickText } from "@/lib/i18n-fields";

function SaleCard({ sale, fetchedAt, image, fr, locale }: { sale: FlashSale; fetchedAt: number; image: string; fr: boolean; locale: string }) {
  const name = pickText(fr, sale.productName, sale.productNameFr);
  const title = sale.title ? pickText(fr, sale.title, sale.titleFr) : null;
  const running = sale.phase === "running";
  // The stored `discount` is whatever the admin typed (often 0): the real percent is the gap between the two prices.
  const pct = sale.basePrice > sale.flashPrice ? Math.round((1 - sale.flashPrice / sale.basePrice) * 100) : 0;
  return (
    <article className="card-premium group relative overflow-hidden" data-testid="flash-sale-card">
      <Link href={`/shop/products/${sale.productId}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50/50">
          <Image src={image || "/brand/logo-stack.png"} alt={name} fill className="object-cover transition-transform duration-500 group-hover:scale-105" sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" />
          {pct > 0 && <span className="absolute left-3 top-3 rounded-lg bg-[var(--primary)] px-2.5 py-1 text-xs font-bold text-white shadow-lg">-{pct}%</span>}
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            <Zap className="h-3 w-3" aria-hidden="true" />
            {running ? (fr ? "Vente flash" : "Flash sale") : fr ? "Bientôt" : "Coming soon"}
          </span>
        </div>
        <div className="space-y-2 p-4">
          {title && <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{title}</p>}
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-slate-800">{name}</h3>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-[family-name:var(--font-display)] text-lg font-bold text-slate-900">{formatCurrency(sale.flashPrice, locale)}</span>
            <s className="text-xs text-slate-500">
              <span className="sr-only">{fr ? "Ancien prix " : "Was "}</span>
              {formatCurrency(sale.basePrice, locale)}
            </s>
          </div>
          <FlashCountdown sale={sale} fetchedAt={fetchedAt} fr={fr} className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 tabular-nums" />
        </div>
      </Link>
    </article>
  );
}

export default function ShopDealsPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const catalog = useCatalog();
  const { sales, loaded, error, fetchedAt, reload } = useFlashSales({ upcoming: true });
  const imageOf = useMemo(() => new Map(catalog.map((p) => [p.id, p.image])), [catalog]);
  const running = sales.filter((s) => s.phase === "running");
  const upcoming = sales.filter((s) => s.phase === "scheduled");

  return (
    <div className="space-y-8">
      <PageHeader title={fr ? "Ventes flash" : "Flash Deals"} subtitle={fr ? "Offres limitées dans le temps" : "Limited-time offers"} />

      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}{" "}
          <button type="button" onClick={() => void reload()} className="font-medium underline">{fr ? "Réessayer" : "Retry"}</button>
        </p>
      ) : !loaded ? (
        <p className="text-sm text-slate-500">{fr ? "Chargement…" : "Loading…"}</p>
      ) : (
        <>
          <section aria-labelledby="running-title" className="space-y-4">
            <h2 id="running-title" className="text-lg font-bold text-slate-900">{fr ? "En cours" : "Live now"}</h2>
            {running.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                {fr ? "Aucune vente flash en cours pour le moment." : "No flash sale is running right now."}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {running.map((s) => <SaleCard key={s.id} sale={s} fetchedAt={fetchedAt} image={imageOf.get(s.productId) ?? ""} fr={fr} locale={locale} />)}
              </div>
            )}
          </section>
          {upcoming.length > 0 && (
            <section aria-labelledby="upcoming-title" className="space-y-4">
              <h2 id="upcoming-title" className="text-lg font-bold text-slate-900">{fr ? "À venir" : "Coming up"}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {upcoming.map((s) => <SaleCard key={s.id} sale={s} fetchedAt={fetchedAt} image={imageOf.get(s.productId) ?? ""} fr={fr} locale={locale} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
