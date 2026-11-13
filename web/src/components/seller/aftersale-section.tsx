"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { DetailGrid, DetailGridSection } from "@/components/ui/detail-grid";
import { InfoGrid } from "@/components/ui/info-grid";
import { PageHeader } from "@/components/ui/page-header";
import { LoadError, SectionLoader } from "@/components/seller/data-state";
import { CaseThreadPanel } from "@/components/shared/case-thread-panel";
import { TranslatableText } from "@/components/shop/translatable-text";
import { useLocale } from "@/context/locale-context";
import { assetUrl } from "@/lib/seller-api";
import { localDateTime, localDay } from "@/lib/dates";
import { formatCurrency } from "@/lib/utils";
import {
  BANNER,
  PAGE_SIZE,
  SECTIONS,
  caseStatusText,
  caseStatusVariant,
  itemLabel,
  legText,
  statusOptions,
  stepText,
  useAfterSaleAccess,
  useCaseDetail,
  useCasePage,
  useCustomerConversation,
  type CaseKind,
  type SellerCase,
} from "@/lib/seller-aftersale";

const KIND_TRANSLATE = { return: "dispute_reason", exchange: "exchange_reason", replacement: "replacement_reason" } as const;
const NOTE_TRANSLATE = { return: "dispute_resolution", exchange: "exchange_reply", replacement: "replacement_reply" } as const;

/**
 * Wraps a section page: while the store's switch for it is off (or turned off live), the page goes back to the dashboard
 * (the old URL redirect, now decided by the store's access instead of the build). Nothing renders until the access is known.
 */
export function SectionGate({ kind, children }: { kind: CaseKind; children: React.ReactNode }) {
  const router = useRouter();
  const { locale } = useLocale();
  const { loaded, access } = useAfterSaleAccess();
  const on = access[SECTIONS[kind].key];
  useEffect(() => {
    if (!loaded || on) return;
    router.replace("/seller");
    // A client navigation can stall while this page's live reads are still settling: if the page is still here a moment
    // later, load the dashboard the plain way.
    const t = setTimeout(() => {
      if (window.location.pathname.startsWith(SECTIONS[kind].href)) window.location.replace("/seller");
    }, 1500);
    return () => clearTimeout(t);
  }, [loaded, on, router, kind]);
  if (!loaded) return null;
  if (!on) {
    // The redirect above runs at once; this is what shows for the instant before it lands (and if it is slow).
    return (
      <div role="status" className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        {locale === "fr" ? "Cette section est désactivée pour votre boutique." : "This section is turned off for your store."}{" "}
        <Link href="/seller" className="font-medium text-[var(--primary)] hover:underline">
          {locale === "fr" ? "Retour au tableau de bord" : "Back to the dashboard"}
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}

function Banner() {
  const { locale } = useLocale();
  return (
    <div role="note" data-testid="aftersale-banner" className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {locale === "fr" ? BANNER.fr : BANNER.en}
    </div>
  );
}

/** The store's cases of one kind: server paging, a status filter, live. Read-only. */
export function AftersaleSectionList({ kind }: { kind: CaseKind }) {
  const { locale, t } = useLocale();
  const fr = locale === "fr";
  const meta = SECTIONS[kind];
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("");
  const q = useCasePage(kind, page, status);
  const rows = (q.data ?? []).slice(0, PAGE_SIZE);
  const hasNext = (q.data?.length ?? 0) > PAGE_SIZE;
  const title = fr ? meta.titleFr : meta.titleEn;

  return (
    <div className="space-y-6">
      <PageHeader title={title} subtitle={fr ? meta.subFr : meta.subEn} breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: title }]} />
      <Banner />
      {q.error && <LoadError message={q.error} onRetry={q.reload} />}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600" htmlFor="aftersale-status">
          {t("status")}
        </label>
        <select
          id="aftersale-status"
          className="input-premium px-3 py-2 text-sm"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          {statusOptions(kind, fr).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <Card>
        <CardContent className="p-0">
          {q.loading ? (
            <SectionLoader />
          ) : (
            <DataTable
              emptyMessage={fr ? "Rien à afficher pour le moment." : "Nothing to show yet."}
              columns={[
                {
                  key: "reference",
                  label: fr ? meta.idFr : meta.idEn,
                  render: (row) => (
                    <Link href={`${meta.href}/${String(row.id)}`} className="font-medium text-[var(--primary)] hover:underline">
                      {String(row.reference)}
                    </Link>
                  ),
                },
                {
                  key: "orderReference",
                  label: fr ? "Commande" : "Order",
                  render: (row) => (
                    <Link href={`/seller/orders/${String(row.orderReference)}`} className="text-[var(--primary)] hover:underline">
                      {String(row.orderReference)}
                    </Link>
                  ),
                },
                { key: "customerFirstName", label: t("customer") },
                {
                  key: "items",
                  label: fr ? "Articles" : "Items",
                  render: (row) => {
                    const c = row as unknown as SellerCase;
                    return <span className="block max-w-[16rem] break-words text-slate-600">{c.items.map((i) => `${itemLabel(i, fr)} × ${i.qty}`).join(", ") || "—"}</span>;
                  },
                },
                {
                  key: "status",
                  label: t("status"),
                  render: (row) => {
                    const c = row as unknown as SellerCase;
                    return (
                      <span className="flex flex-col items-start gap-1">
                        <Badge variant={caseStatusVariant(c)}>{caseStatusText(c, fr)}</Badge>
                        {c.unread > 0 && (
                          <Badge variant="primary">
                            {fr ? `${c.unread} message(s) du support` : `${c.unread} message${c.unread === 1 ? "" : "s"} from support`}
                          </Badge>
                        )}
                      </span>
                    );
                  },
                },
                { key: "createdAt", label: t("date"), render: (row) => localDay(String(row.createdAt)) },
                {
                  key: "actions",
                  label: t("action"),
                  render: (row) => (
                    <Link href={`${meta.href}/${String(row.id)}`} className="text-sm text-[var(--primary)] hover:underline">
                      {t("view")}
                    </Link>
                  ),
                },
              ]}
              data={rows as unknown as Record<string, unknown>[]}
            />
          )}
        </CardContent>
      </Card>
      {(page > 0 || hasNext) && (
        <div className="flex items-center justify-between">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            {fr ? "Précédent" : "Previous"}
          </Button>
          <span className="text-sm text-slate-500">{fr ? `Page ${page + 1}` : `Page ${page + 1}`}</span>
          <Button size="sm" variant="secondary" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
            {fr ? "Suivant" : "Next"}
          </Button>
        </div>
      )}
    </div>
  );
}

/** One case, read-only: what was asked, where it stands, the money effect, support's note and the private thread. */
export function AftersaleSectionDetail({ kind, id }: { kind: CaseKind; id: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const meta = SECTIONS[kind];
  const q = useCaseDetail(kind, id);
  const c = q.data;
  const title = fr ? meta.titleFr : meta.titleEn;

  if (q.loading) return <SectionLoader />;
  if (q.error && !c) return <LoadError message={q.error} onRetry={q.reload} />;
  if (!c) return <div className="p-8 text-center text-slate-500">{fr ? "Dossier introuvable" : "Case not found"}</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={c.reference}
        subtitle={`${localDay(c.createdAt)} · ${caseStatusText(c, fr)} · ${c.orderReference}`}
        backHref={meta.href}
        breadcrumbs={[{ label: fr ? "Vendeur" : "Seller", href: "/seller" }, { label: title, href: meta.href }, { label: c.reference }]}
        actions={<Badge variant={caseStatusVariant(c)}>{caseStatusText(c, fr)}</Badge>}
      />
      <Banner />
      {q.error && <LoadError message={q.error} onRetry={q.reload} />}

      {c.reasonHidden ? (
        <div role="note" data-testid="reason-hidden" className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600">
          {fr ? "Le support KOMORIKO a le motif de cette demande." : "KOMORIKO support has the reason for this request."}
        </div>
      ) : (
        c.reason && (
          <div data-testid="reason-block" className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{fr ? "Motif" : "Reason"}</p>
            <TranslatableText kind={KIND_TRANSLATE[kind]} id={c.id} auto text={c.reason} i18n={c.reasonI18n} className="mt-1 whitespace-pre-wrap text-lg font-bold text-slate-900" />
          </div>
        )
      )}

      <DetailGrid>
        <DetailGridSection title={fr ? "Informations" : "Information"}>
          <InfoGrid
            items={[
              { label: fr ? "Référence" : "Reference", value: c.reference },
              { label: fr ? "Commande" : "Order", value: <Link href={`/seller/orders/${c.orderReference}`} className="text-[var(--primary)] hover:underline">{c.orderReference}</Link> },
              { label: fr ? "Client" : "Customer", value: c.customerFirstName || "—" },
              { label: fr ? "Ouvert le" : "Opened", value: localDateTime(c.createdAt) },
              { label: fr ? "Dernière mise à jour" : "Last update", value: localDateTime(c.updatedAt) },
              ...(c.refundUsd ? [{ label: fr ? "Remboursé au client" : "Refunded to the customer", value: formatCurrency(c.refundUsd, locale) }] : []),
              ...(c.priceDiffUsd ? [{ label: fr ? "Différence de prix" : "Price difference", value: `${c.priceDiffUsd > 0 ? "+" : "−"}${formatCurrency(Math.abs(c.priceDiffUsd), locale)}` }] : []),
            ]}
          />
        </DetailGridSection>

        <DetailGridSection title={fr ? "Décision du support" : "Support decision"}>
          {c.reasonHidden ? (
            <p className="text-sm text-slate-500">{fr ? "Le support KOMORIKO a le détail de sa décision." : "KOMORIKO support has the details of its decision."}</p>
          ) : c.decisionNote ? (
            <TranslatableText kind={NOTE_TRANSLATE[kind]} id={c.id} auto text={c.decisionNote} i18n={c.decisionNoteI18n} className="whitespace-pre-wrap text-sm text-slate-800" />
          ) : (
            <p className="text-sm text-slate-500">{c.status === "open" || c.status === "requested" ? (fr ? "Le support n'a pas encore décidé." : "Support has not decided yet.") : fr ? "Aucune note." : "No note."}</p>
          )}
        </DetailGridSection>

        <DetailGridSection title={fr ? "Avancement" : "Progress"}>
          <ol className="space-y-2 text-sm" data-testid="aftersale-timeline">
            {c.timeline.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-2">
                <span className={s.done ? (s.key === "refused" || s.key === "rejected" ? "font-medium text-red-700" : "font-medium text-slate-800") : "text-slate-400"}>
                  {s.done ? "● " : "○ "}
                  {stepText(s.key, fr)}
                </span>
                {s.at && <span className="text-xs text-slate-500">{localDateTime(s.at)}</span>}
              </li>
            ))}
          </ol>
        </DetailGridSection>

        <DetailGridSection title={fr ? "Articles concernés" : "Items concerned"} span={2}>
          <ul className="divide-y divide-[var(--border)]">
            {c.items.map((i, n) => (
              <li key={`${i.name}-${n}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="font-medium text-slate-900">
                  {kind === "exchange" ? (n === 0 ? (fr ? "Rendu : " : "Returned: ") : fr ? "Contre : " : "For: ") : ""}
                  {itemLabel(i, fr)}
                </span>
                <span className="text-slate-500">× {i.qty}</span>
              </li>
            ))}
          </ul>
        </DetailGridSection>

        {c.legs && (
          <DetailGridSection title={fr ? "Collecte et retour au vendeur" : "Pickup and return to your store"}>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-2">
                <span className="text-slate-700">{fr ? "Collecte chez le client" : "Pickup from the customer"}</span>
                <Badge variant="info">{legText(c.legs.pickup, fr)}</Badge>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-slate-700">{fr ? "Retour à votre boutique" : "Back to your store"}</span>
                <Badge variant="info">{legText(c.legs.returnToSeller, fr)}</Badge>
              </li>
            </ul>
          </DetailGridSection>
        )}

        {c.attachments.length > 0 && (
          <DetailGridSection title={fr ? "Photos du client" : "Customer photos"}>
            <div className="flex flex-wrap gap-2">
              {c.attachments.map((u) => (
                <a key={u} href={assetUrl(u)} target="_blank" rel="noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <img src={assetUrl(u)} alt={fr ? "Pièce jointe" : "Attachment"} className="h-full w-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          </DetailGridSection>
        )}

        {c.customerThreadShared && (
          <DetailGridSection title={fr ? "Conversation client et support" : "Customer & support conversation"} span={3}>
            <CustomerConversation kind={kind} caseId={c.id} />
          </DetailGridSection>
        )}

        <DetailGridSection title={fr ? "Parler au support" : "Talk to support"} span={3}>
          <CaseThreadPanel kind={kind} caseId={c.id} side="seller" />
        </DetailGridSection>
      </DetailGrid>
    </div>
  );
}

/**
 * The conversation between the customer and KOMORIKO support about this request, READ-ONLY (admin shares it with the store: the
 * server refuses it otherwise). The store cannot write here; "Talk to support" below is its own private thread.
 */
function CustomerConversation({ kind, caseId }: { kind: CaseKind; caseId: string }) {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const q = useCustomerConversation(kind, caseId, true);
  const messages = q.data ?? [];
  return (
    <div className="space-y-3" data-testid="customer-conversation">
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {fr
          ? "Lecture seule : les échanges du client avec le support KOMORIKO. Pour écrire au support, utilisez « Parler au support »."
          : "Read-only: the customer's messages with KOMORIKO support. To write to support, use “Talk to support”."}
      </p>
      {q.error && <LoadError message={q.error} onRetry={q.reload} />}
      {q.loading && <p className="text-sm text-slate-400">{fr ? "Chargement…" : "Loading…"}</p>}
      {!q.loading && !q.error && messages.length === 0 && <p className="text-sm text-slate-400">{fr ? "Aucun message pour l'instant." : "No messages yet."}</p>}
      <div className="max-h-96 space-y-2 overflow-y-auto">
        {messages.map((m) => (
          <div key={m.id} className={`rounded-xl p-3 text-sm ${m.side === "customer" ? "bg-slate-50" : "bg-blue-50"}`}>
            <p className="text-xs font-semibold text-slate-700">
              {m.side === "customer" ? m.authorName || (fr ? "Client" : "Customer") : "KOMORIKO"}
              <span className="ml-1 font-normal text-slate-500">· {m.side === "customer" ? (fr ? "Client" : "Customer") : "Support"} · {localDateTime(m.createdAt)}</span>
            </p>
            <TranslatableText kind="dispute_message" id={m.id} text={m.text} i18n={m.textI18n} className="mt-1 whitespace-pre-line text-slate-800" />
            {m.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.attachments.map((u) => (
                  <a key={u} href={assetUrl(u)} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <img src={assetUrl(u)} alt={fr ? "Pièce jointe" : "Attachment"} className="h-full w-full object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
