"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Star, Eye, EyeOff, MessageSquare, ShieldCheck, Reply } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg } from "@/lib/admin-live";
import type { ReviewRow } from "@/lib/admin-stats";
import { socketClient } from "@/lib/realtime/socket-client";

const PAGE = 100;

export default function AdminReviewsPage() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const rt = useRealtime();
  const fr = locale === "fr";
  const [tab, setTab] = useState<"all" | "visible" | "hidden">("all");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const connected = rt.status === "connected";

  const body = useCallback(
    (offset: number) => ({ ...(tab === "all" ? {} : { status: tab }), limit: PAGE, offset }),
    [tab],
  );

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    try {
      const res = await socketClient.request<ReviewRow[]>("reviews:admin", body(0));
      setRows(Array.isArray(res) ? res : []);
      setHasMore(Array.isArray(res) && res.length === PAGE);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [connected, body]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    setMoreLoading(true);
    try {
      const res = await socketClient.request<ReviewRow[]>("reviews:admin", body(rows.length));
      setRows((cur) => [...cur, ...res.filter((r) => !cur.some((c) => c.id === r.id))]);
      setHasMore(res.length === PAGE);
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setMoreLoading(false);
    }
  }

  // Live updates: a new review, a hide/restore by another moderator, a seller reply.
  useEffect(() => {
    if (!connected) return;
    const sock = socketClient.current;
    if (!sock) return;
    const onUpdate = (r: Partial<ReviewRow> & { id: string }) => {
      setRows((cur) => {
        const idx = cur.findIndex((x) => x.id === r.id);
        if (idx === -1) return r.author && (tab === "all" || tab === r.status) ? [r as ReviewRow, ...cur] : cur;
        const next = [...cur];
        next[idx] = { ...next[idx], ...r };
        return tab !== "all" && r.status && r.status !== tab ? next.filter((x) => x.id !== r.id) : next;
      });
    };
    sock.on("review:updated", onUpdate);
    sock.on("review:created", onUpdate);
    return () => {
      sock.off("review:updated", onUpdate);
      sock.off("review:created", onUpdate);
    };
  }, [connected, tab]);

  async function setStatus(r: ReviewRow, status: "visible" | "hidden") {
    setBusyId(r.id);
    try {
      const updated = await socketClient.request<ReviewRow>("reviews:setStatus", { reviewId: r.id, status });
      setRows((cur) => {
        const merged = cur.map((x) => (x.id === r.id ? { ...x, ...updated, productName: x.productName } : x));
        return tab !== "all" && updated.status !== tab ? merged.filter((x) => x.id !== r.id) : merged;
      });
      toast(
        status === "hidden"
          ? fr ? "Avis masqué : il n'apparaît plus et sort de la note du produit" : "Review hidden: it leaves the product page and its rating"
          : fr ? "Avis rétabli" : "Review restored",
        "success",
      );
    } catch (e) {
      toast(errMsg(e), "error");
    } finally {
      setBusyId(null);
    }
  }

  const productName = useCallback(
    (r: ReviewRow) => r.productName || rt.products.find((p) => p.id === r.productId)?.name || r.productId.slice(0, 8),
    [rt.products],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${productName(r)} ${r.author} ${r.text} ${r.sellerReply ?? ""}`.toLowerCase().includes(q));
  }, [rows, query, productName]);

  const hidden = rows.filter((r) => r.status === "hidden").length;
  const replied = rows.filter((r) => r.sellerReply).length;
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Avis et modération" : "Reviews & Moderation"}
        subtitle={fr ? "Masquez ou rétablissez les avis clients ; les réponses des vendeurs sont affichées" : "Hide or restore customer reviews; seller replies are shown"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Avis" : "Reviews" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title={fr ? "Avis chargés" : "Reviews loaded"} value={rows.length} icon={MessageSquare} />
        <StatCard title={fr ? "Masqués" : "Hidden"} value={hidden} icon={EyeOff} />
        <StatCard title={fr ? "Avec réponse du vendeur" : "With seller reply"} value={replied} icon={Reply} />
        <StatCard title={fr ? "Note moyenne" : "Average rating"} value={avg === null ? "—" : avg.toFixed(1)} icon={ShieldCheck} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          active={tab}
          onChange={(id) => setTab(id as "all" | "visible" | "hidden")}
          tabs={[
            { id: "all", label: fr ? "Tous" : "All" },
            { id: "visible", label: fr ? "Visibles" : "Visible" },
            { id: "hidden", label: fr ? "Masqués" : "Hidden" },
          ]}
        />
        <input
          className="input-premium min-w-0 flex-1 px-4 py-2 text-sm sm:max-w-xs"
          placeholder={fr ? "Rechercher produit, auteur, texte…" : "Search product, author, text…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={fr ? "Rechercher" : "Search"}
        />
      </div>

      {error && <SectionError message={error} onRetry={load} />}
      {loading && !error ? (
        <SectionLoading />
      ) : (
        !error && (
          <div className="card-premium overflow-hidden">
            {shown.length === 0 ? (
              <EmptyState>
                {rows.length > 0
                  ? fr ? "Aucun avis ne correspond à la recherche." : "No review matches the search."
                  : fr ? "Aucun avis pour le moment." : "No reviews yet."}
              </EmptyState>
            ) : (
              <DataTable
                data={shown as unknown as Record<string, unknown>[]}
                columns={[
                  {
                    key: "productName",
                    label: fr ? "Produit" : "Product",
                    render: (row) => {
                      const r = row as unknown as ReviewRow;
                      return (
                        <div>
                          <p className="font-semibold text-slate-900">{productName(r)}</p>
                          <p className="text-xs text-slate-400">{r.author} · {String(r.createdAt).slice(0, 10)}</p>
                        </div>
                      );
                    },
                  },
                  {
                    key: "rating",
                    label: fr ? "Note" : "Rating",
                    render: (row) => (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {Number(row.rating)}
                      </span>
                    ),
                  },
                  {
                    key: "text",
                    label: fr ? "Avis" : "Review",
                    render: (row) => {
                      const r = row as unknown as ReviewRow;
                      return (
                        <div className="max-w-md space-y-2">
                          <p className="whitespace-pre-line break-words text-slate-700">{r.text}</p>
                          {r.sellerReply && (
                            <div className="rounded-lg border-l-2 border-[var(--primary)] bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              <p className="font-semibold text-slate-700">
                                {fr ? "Réponse du vendeur" : "Seller reply"}
                                {r.sellerReplyAt ? ` · ${String(r.sellerReplyAt).slice(0, 10)}` : ""}
                              </p>
                              <p className="mt-0.5 whitespace-pre-line break-words">{r.sellerReply}</p>
                            </div>
                          )}
                        </div>
                      );
                    },
                  },
                  {
                    key: "status",
                    label: fr ? "Statut" : "Status",
                    render: (row) => (
                      <Badge variant={row.status === "hidden" ? "danger" : "success"}>
                        {row.status === "hidden" ? (fr ? "Masqué" : "Hidden") : fr ? "Visible" : "Visible"}
                      </Badge>
                    ),
                  },
                  {
                    key: "actions",
                    label: "",
                    render: (row) => {
                      const r = row as unknown as ReviewRow;
                      return r.status === "hidden" ? (
                        <Button size="sm" variant="approve" disabled={busyId === r.id} onClick={() => setStatus(r, "visible")}>
                          <Eye className="h-3.5 w-3.5" />
                          {fr ? "Rétablir" : "Restore"}
                        </Button>
                      ) : (
                        <Button size="sm" variant="reject" disabled={busyId === r.id} onClick={() => setStatus(r, "hidden")}>
                          <EyeOff className="h-3.5 w-3.5" />
                          {fr ? "Masquer" : "Hide"}
                        </Button>
                      );
                    },
                  },
                ]}
              />
            )}
            {hasMore && (
              <div className="border-t border-[var(--border)] p-4 text-center">
                <Button size="sm" variant="secondary" onClick={loadMore} disabled={moreLoading}>
                  {moreLoading ? "…" : fr ? "Charger plus" : "Load more"}
                </Button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
