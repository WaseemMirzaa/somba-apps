"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { localDateTime } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadMore } from "@/components/ui/load-more";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { errMsg } from "@/lib/admin-live";
import { socketClient } from "@/lib/realtime/socket-client";
import { adminBreadcrumb, auditActionLabel, auditEntityLabel, auditRoleLabel } from "@/lib/admin-i18n";
import { AUDIT_PAGE_SIZE, EMPTY_AUDIT_FILTERS, auditRangeError, auditRequest, hasAuditFilters, type AuditFilters } from "@/lib/audit-filter";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";

interface AuditRow {
  id: string;
  actor: string;
  role: string;
  action: string;
  entity: string;
  entityId: string;
  detail?: string | null;
  timestamp?: string;
  createdAt?: string;
}

export default function AdminAuditPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const rt = useRealtime();
  const connected = rt.status === "connected";
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [items, setItems] = useState<AuditRow[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<{ actions: string[]; roles: string[] }>({ actions: [], roles: [] });
  const filtersRef = useRef(filters);
  const rangeError = auditRangeError(filters, fr);
  const filtered = hasAuditFilters(filters);

  // Every change of a filter asks the server again for the first page (text is given a moment to settle).
  useEffect(() => {
    filtersRef.current = filters;
    if (!connected || rangeError) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const rows = await socketClient.request<AuditRow[]>("audit:list", auditRequest(filters));
        if (!live) return;
        setItems(Array.isArray(rows) ? rows : []);
        setHasMore(Array.isArray(rows) && rows.length === AUDIT_PAGE_SIZE);
        setError(null);
      } catch (e) {
        if (live) setError(errMsg(e));
      } finally {
        if (live) setLoading(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [filters, connected, rangeError]);

  useEffect(() => {
    if (!connected) return;
    void socketClient
      .request<{ actions: string[]; roles: string[] }>("audit:facets")
      .then((f) => setFacets(f))
      .catch(() => undefined); // the pickers stay empty; the text filters still work
  }, [connected]);

  // New entries appear at the top as they happen, but only in the unfiltered view (a filtered view would need re-checking).
  useEffect(() => {
    if (!connected) return;
    const sock = socketClient.current;
    if (!sock) return;
    const onNew = (row: AuditRow) => {
      if (hasAuditFilters(filtersRef.current)) return;
      setItems((cur) => (cur.some((x) => x.id === row.id) ? cur : [row, ...cur]));
    };
    sock.on("audit:created", onNew);
    return () => {
      sock.off("audit:created", onNew);
    };
  }, [connected]);

  const loadMore = useCallback(async () => {
    const rows = await socketClient.request<AuditRow[]>("audit:list", auditRequest(filtersRef.current, items.length));
    setItems((cur) => [...cur, ...rows.filter((r) => !cur.some((x) => x.id === r.id))]);
    setHasMore(rows.length === AUDIT_PAGE_SIZE);
  }, [items.length]);

  const update = (p: Partial<AuditFilters>) => setFilters((f) => ({ ...f, ...p }));
  const field = "input-premium w-full px-3 py-2 text-sm";
  const label = "mb-1.5 block text-xs font-medium text-slate-600";

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Journal d'audit" : "Audit Log"}
        subtitle={fr ? "Actions du personnel enregistrées par le serveur" : "Staff actions recorded by the server"}
        breadcrumbs={[adminBreadcrumb(locale), { label: fr ? "Audit" : "Audit" }]}
      />

      <div className="card-premium grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label={fr ? "Filtres du journal" : "Log filters"}>
        <div>
          <label htmlFor="audit-action" className={label}>{fr ? "Action" : "Action"}</label>
          <select id="audit-action" className={field} value={filters.action} onChange={(e) => update({ action: e.target.value })}>
            <option value="">{fr ? "Toutes les actions" : "All actions"}</option>
            {facets.actions.map((a) => (
              <option key={a} value={a}>{auditActionLabel(a, fr)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-role" className={label}>{fr ? "Rôle" : "Role"}</label>
          <select id="audit-role" className={field} value={filters.role} onChange={(e) => update({ role: e.target.value })}>
            <option value="">{fr ? "Tous les rôles" : "All roles"}</option>
            {facets.roles.map((r) => (
              <option key={r} value={r}>{auditRoleLabel(r, fr)}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="audit-actor" className={label}>{fr ? "Auteur" : "Actor"}</label>
          <input id="audit-actor" type="search" className={field} placeholder={fr ? "Nom de l'auteur" : "Name of the person"} value={filters.actor} onChange={(e) => update({ actor: e.target.value })} />
        </div>
        <div>
          <label htmlFor="audit-q" className={label}>{fr ? "Rechercher" : "Search"}</label>
          <input id="audit-q" type="search" className={field} placeholder={fr ? "Identifiant, détail…" : "ID, detail…"} value={filters.q} onChange={(e) => update({ q: e.target.value })} />
        </div>
        <div>
          <label htmlFor="audit-from" className={label}>{fr ? "Date de début" : "From date"}</label>
          <input id="audit-from" type="date" className={field} value={filters.from} onChange={(e) => update({ from: e.target.value })} />
        </div>
        <div>
          <label htmlFor="audit-to" className={label}>{fr ? "Date de fin" : "To date"}</label>
          <input id="audit-to" type="date" className={field} value={filters.to} onChange={(e) => update({ to: e.target.value })} />
        </div>
        {filtered && (
          <div className="flex items-end">
            <button type="button" onClick={() => setFilters(EMPTY_AUDIT_FILTERS)} className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-red-50">
              {fr ? "Effacer" : "Clear"}
            </button>
          </div>
        )}
        {rangeError && <p role="alert" className="text-sm text-red-700 sm:col-span-2 lg:col-span-4">{rangeError}</p>}
      </div>

      {error && <SectionError message={error} onRetry={() => update({})} />}
      {loading && !error && <SectionLoading />}
      {!loading && !error && items.length === 0 && (
        <EmptyState>
          {filtered ? (fr ? "Aucune entrée ne correspond à ces filtres." : "No entries match these filters.") : fr ? "Aucune activité enregistrée." : "No activity recorded yet."}
        </EmptyState>
      )}

      <div className="space-y-3">
        {items.map((log) => (
          <Card key={log.id}>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="primary">{auditActionLabel(log.action, fr)}</Badge>
                <span className="text-xs text-slate-400">{log.timestamp ?? (log.createdAt ? localDateTime(log.createdAt) : "")}</span>
              </div>
              <p className="mt-2 break-words text-sm">
                <strong>{log.actor}</strong> <span className="text-slate-400">({auditRoleLabel(log.role, fr)})</span> · {auditEntityLabel(log.entity, fr)}{" "}
                <code className="break-all text-[var(--primary)]">{log.entityId}</code>
                {log.detail ? <span className="text-slate-500"> · {log.detail}</span> : null}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!loading && !error && items.length > 0 && (
        <LoadMore hasMore={hasMore} onLoad={loadMore} loaded={items.length} noun={{ en: "entries", fr: "entrées" }} />
      )}
    </div>
  );
}
