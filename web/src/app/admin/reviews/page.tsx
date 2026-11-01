"use client";

import { localDay } from "@/lib/dates";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Star, Eye, EyeOff, MessageSquare, ShieldCheck, Reply, Flag } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { ErrorNote, Modal } from "@/components/admin/modal";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { useToast } from "@/context/toast-context";
import { adminBreadcrumb } from "@/lib/admin-i18n";
import { errMsg } from "@/lib/admin-live";
import type { ReviewReport, ReviewRow } from "@/lib/admin-stats";
import { socketClient } from "@/lib/realtime/socket-client";
import { matchesSearch, pickText } from "@/lib/i18n-fields";
import { TranslatableText } from "@/components/shop/translatable-text";

const PAGE = 100;

function ReviewsInner() {
  const { locale } = useLocale();
  const { toast } = useToast();
  const rt = useRealtime();
  const fr = locale === "fr";
  const [tab, setTab] = useState<"all" | "visible" | "hidden" | "reported">("all");
  const focus = useSearchParams().get("focus");
  const [hiding, setHiding] = useState<ReviewRow | null>(null);
  const [hideReason, setHideReason] = useState("");
  const [hideError, setHideError] = useState<string | null>(null);
  const [reports, setReports] = useState<{ review: ReviewRow; items: ReviewReport[] | null; error: string | null } | null>(null);
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const connected = rt.status === "connected";

  const body = useCallback(
    (offset: number) => ({ ...(tab === "all" ? {} : tab === "reported" ? { reported: true } : { status: tab }), limit: PAGE, offset }),
    [tab],
  );

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!connected) return;
    let alive = true;
    (async () => {
      try {
        const res = await socketClient.request<ReviewRow[]>("reviews:admin", body(0));
        if (!alive) return;
        setRows(Array.isArray(res) ? res : []);
        setHasMore(Array.isArray(res) && res.length === PAGE);
        setError(null);
      } catch (e) {
        if (alive) setError(errMsg(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [connected, body, attempt]);

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
        if (idx === -1) return r.author && (tab === "all" || tab === r.status || (tab === "reported" && (r.reportCount ?? 0) > 0)) ? [r as ReviewRow, ...cur] : cur;
        const next = [...cur];
        next[idx] = { ...next[idx], ...r };
        return tab !== "all" && r.status && r.status !== tab ? next.filter((x) => x.id !== r.id) : next;
      });
    };
    // A seller reported a review: show the new report count (and add it to the reported tab).
    const onReported = (p: { review: ReviewRow }) => {
      if (p?.review) onUpdate(p.review);
    };
    sock.on("review:updated", onUpdate);
    sock.on("review:created", onUpdate);
    sock.on("review:reported", onReported);
    return () => {
      sock.off("review:updated", onUpdate);
      sock.off("review:created", onUpdate);
      sock.off("review:reported", onReported);
    };
  }, [connected, tab]);

  async function setStatus(r: ReviewRow, status: "visible" | "hidden", reason?: string): Promise<boolean> {
    setBusyId(r.id);
    try {
      const updated = await socketClient.request<ReviewRow>("reviews:setStatus", { reviewId: r.id, status, ...(reason ? { reason } : {}) });
      setRows((cur) => {
        const merged = cur.map((x) => (x.id === r.id ? { ...x, ...updated, productName: x.productName, productNameFr: x.productNameFr } : x));
        return tab !== "all" && tab !== "reported" && updated.status !== tab ? merged.filter((x) => x.id !== r.id) : merged;
      });
      toast(
        status === "hidden"
          ? fr ? "Avis masqué : il n'apparaît plus et sort de la note du produit" : "Review hidden: it leaves the product page and its rating"
          : fr ? "Avis rétabli" : "Review restored",
        "success",
      );
      return true;
    } catch (e) {
      toast(errMsg(e), "error");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function confirmHide() {
    if (!hiding) return;
    const reason = hideReason.trim();
    if (reason.length < 5) {
      setHideError(fr ? "Donnez un motif (5 caractères minimum) : l'auteur et le vendeur le verront." : "Give a reason (at least 5 characters): the author and the seller will see it.");
      return;
    }
    if (await setStatus(hiding, "hidden", reason)) {
      setHiding(null);
      setHideReason("");
    }
  }

  async function openReports(r: ReviewRow) {
    setReports({ review: r, items: null, error: null });
    try {
      const items = await socketClient.request<ReviewReport[]>("reviews:reports", { id: r.id });
      setReports({ review: r, items, error: null });
    } catch (e) {
      setReports({ review: r, items: null, error: errMsg(e) });
    }
  }

  const productName = useCallback(
    (r: ReviewRow) => {
      const p = rt.products.find((x) => x.id === r.productId);
      return pickText(fr, r.productName, r.productNameFr) || (p ? pickText(fr, p.name, p.nameFr) : "") || r.productId.slice(0, 8);
    },
    [rt.products, fr],
  );

  const shown = useMemo(() => {
    const base = query.trim() ? rows.filter((r) => matchesSearch(query, [productName(r), r.author, r.text, r.sellerReply])) : rows;
    // A notice opened this page for one review: show it first.
    return focus ? [...base].sort((a, b) => Number(b.id === focus) - Number(a.id === focus)) : base;
  }, [rows, query, productName, focus]);

  const hidden = rows.filter((r) => r.status === "hidden").length;
  const reportedCount = rows.filter((r) => (r.reportCount ?? 0) > 0).length;
  const replied = rows.filter((r) => r.sellerReply).length;
  const avg = rows.length ? rows.reduce((s, r) => s + r.rating, 0) / rows.length : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Avis et modération" : "Reviews & Moderation"}
        subtitle={fr ? "Masquez ou rétablissez les avis clients ; les réponses des vendeurs sont affichées" : "Hide or restore customer reviews; seller replies are shown"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Avis" : "Reviews" }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title={fr ? "Avis chargés" : "Reviews loaded"} value={rows.length} icon={MessageSquare} />
        <StatCard title={fr ? "Masqués" : "Hidden"} value={hidden} icon={EyeOff} />
        <StatCard title={fr ? "Signalés" : "Reported"} value={reportedCount} icon={Flag} />
        <StatCard title={fr ? "Avec réponse du vendeur" : "With seller reply"} value={replied} icon={Reply} />
        <StatCard title={fr ? "Note moyenne" : "Average rating"} value={avg === null ? "—" : avg.toFixed(1)} icon={ShieldCheck} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          active={tab}
          onChange={(id) => { setLoading(true); setTab(id as "all" | "visible" | "hidden" | "reported"); }}
          tabs={[
            { id: "all", label: fr ? "Tous" : "All" },
            { id: "visible", label: fr ? "Visibles" : "Visible" },
            { id: "hidden", label: fr ? "Masqués" : "Hidden" },
            { id: "reported", label: fr ? "Signalés" : "Reported" },
          ]}
        />
        <input
          className="input-premium w-full min-w-0 px-4 py-2 text-sm sm:max-w-xs sm:flex-1"
          placeholder={fr ? "Rechercher produit, auteur, texte…" : "Search product, author, text…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={fr ? "Rechercher" : "Search"}
        />
      </div>

      {error && <SectionError message={error} onRetry={() => { setLoading(true); setError(null); setAttempt((a) => a + 1); }} />}
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
                          <p className="text-xs text-slate-400">{r.author} · {localDay(String(r.createdAt))}</p>
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
                          <TranslatableText kind="review" id={r.id} text={r.text} className="whitespace-pre-line break-words text-slate-700" />
                          {r.sellerReply && (
                            <div className="rounded-lg border-l-2 border-[var(--primary)] bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              <p className="font-semibold text-slate-700">
                                {fr ? "Réponse du vendeur" : "Seller reply"}
                                {r.sellerReplyAt ? ` · ${localDay(String(r.sellerReplyAt))}` : ""}
                              </p>
                              <TranslatableText kind="review_reply" id={r.id} text={r.sellerReply} className="mt-0.5 whitespace-pre-line break-words" />
                            </div>
                          )}
                        </div>
                      );
                    },
                  },
                  {
                    key: "status",
                    label: fr ? "Statut" : "Status",
                    render: (row) => {
                      const r = row as unknown as ReviewRow;
                      return (
                        <div className="space-y-1">
                          <Badge variant={r.status === "hidden" ? "danger" : "success"}>
                            {r.status === "hidden" ? (fr ? "Masqué" : "Hidden") : fr ? "Visible" : "Visible"}
                          </Badge>
                          {(r.reportCount ?? 0) > 0 && (
                            <button type="button" onClick={() => void openReports(r)} className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:underline">
                              <Flag className="h-3 w-3" />
                              {fr ? `${r.reportCount} signalement(s)` : `${r.reportCount} report(s)`}
                            </button>
                          )}
                          {r.moderationReason && <p className="max-w-[12rem] text-xs text-slate-500">{fr ? "Motif : " : "Reason: "}{r.moderationReason}</p>}
                          {focus === r.id && <Badge variant="info">{fr ? "Demandé" : "Opened from a notice"}</Badge>}
                        </div>
                      );
                    },
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
                        <Button size="sm" variant="reject" disabled={busyId === r.id} onClick={() => { setHiding(r); setHideReason(""); setHideError(null); }}>
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

      <Modal
        open={!!hiding}
        onClose={() => busyId === null && setHiding(null)}
        title={fr ? "Masquer cet avis" : "Hide this review"}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setHiding(null)} disabled={busyId !== null}>{fr ? "Annuler" : "Cancel"}</Button>
            <Button variant="danger" size="sm" onClick={() => void confirmHide()} disabled={busyId !== null}>{busyId !== null ? "…" : fr ? "Masquer" : "Hide"}</Button>
          </>
        }
      >
        {hiding && <p className="text-slate-600">{hiding.author} · {"★".repeat(hiding.rating)} · {hiding.text.slice(0, 120)}</p>}
        <label className="block text-xs font-medium text-slate-500">
          {fr ? "Motif (obligatoire, envoyé à l'auteur et au vendeur)" : "Reason (required, sent to the author and the seller)"}
          <textarea className="input-premium mt-1 w-full px-4 py-2 text-sm" rows={3} value={hideReason} onChange={(e) => setHideReason(e.target.value)} />
        </label>
        <ErrorNote message={hideError} />
      </Modal>

      <Modal open={!!reports} onClose={() => setReports(null)} title={fr ? "Signalements de cet avis" : "Reports on this review"}>
        {reports?.error && <ErrorNote message={reports.error} />}
        {reports && !reports.items && !reports.error && <SectionLoading />}
        {reports?.items && reports.items.length === 0 && <p className="text-slate-500">{fr ? "Aucun signalement." : "No reports."}</p>}
        {reports?.items?.map((rp) => (
          <div key={rp.id} className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-600">{rp.reporterName} · {localDay(rp.createdAt)} · {rp.status}</p>
            <p className="mt-1 whitespace-pre-wrap text-slate-800">{rp.reason}</p>
          </div>
        ))}
      </Modal>
    </div>
  );
}

export default function AdminReviewsPage() {
  return (
    <Suspense fallback={<SectionLoading className="min-h-[40vh]" />}>
      <ReviewsInner />
    </Suspense>
  );
}
