"use client";

import { useEffect, useState } from "react";
import { Globe2, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { NoticeBar } from "@/components/admin/notice-bar";
import { EmptyState, SectionError, SectionLoading } from "@/components/admin/query-state";
import { AreaDetail } from "@/components/admin/area-detail";
import { AreaCreateModal } from "@/components/admin/area-create-modal";
import { AreaTree } from "@/components/geo/area-tree";
import { useLocale } from "@/context/locale-context";
import { useRealtime } from "@/context/realtime-context";
import { canManageHubs, errMsg, useRole } from "@/lib/admin-live";
import { areaName, geoChildren, geoSearch, levelLabel, useGeoVersion, type Area } from "@/lib/areas";
import { countryName } from "@/lib/countries";

/** The selected area, refreshed whenever the geography or the coverage changes (live `geo:updated` / `coverage:updated`). */
function useFreshArea(selected: Area | null): Area | null {
  const version = useGeoVersion();
  const [fresh, setFresh] = useState<Area | null>(null);
  const id = selected?.id;
  const parentId = selected?.parentId ?? null;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    geoChildren(parentId)
      .then((rows) => alive && setFresh(rows.find((r) => r.id === id) ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [id, parentId, version]);
  return fresh && fresh.id === id ? fresh : selected;
}

function useSearch(q: string) {
  const rt = useRealtime();
  const version = useGeoVersion();
  const [state, setState] = useState<{ q: string; rows: Area[]; error: string | null } | null>(null);
  const term = q.trim();
  const connected = rt.status === "connected";
  useEffect(() => {
    if (term.length < 2 || !connected) return;
    let alive = true;
    const t = setTimeout(() => {
      geoSearch(term, { limit: 40 })
        .then((rows) => alive && setState({ q: term, rows, error: null }))
        .catch((e) => alive && setState({ q: term, rows: [], error: errMsg(e) }));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [term, connected, version]);
  const current = term.length >= 2 && state?.q === term ? state : null;
  return { active: term.length >= 2, rows: current?.rows ?? [], error: current?.error ?? null, loading: term.length >= 2 && !current };
}

export default function AdminGeographyPage() {
  const { locale } = useLocale();
  const fr = locale === "fr";
  const role = useRole();
  const mayEdit = canManageHubs(role);
  const [selected, setSelected] = useState<Area | null>(null);
  const [q, setQ] = useState("");
  const [reveal, setReveal] = useState<ReadonlySet<string>>(new Set());
  const [addUnder, setAddUnder] = useState<Area | null>(null);
  const search = useSearch(q);
  const area = useFreshArea(selected);

  function pick(a: Area, fromSearch = false) {
    setSelected(a);
    if (fromSearch) {
      // Open the tree down to the hit (every code on its path except itself), then leave the search.
      setReveal(new Set(a.path.split("/")));
      setQ("");
    }
  }

  const servedBadge = (a: Area) =>
    a.served ? (
      <Badge variant="success" className="max-w-[16rem] truncate">{a.hubName ? `${fr ? "Desservie" : "Served"} · ${a.hubName}` : fr ? "Desservie" : "Served"}</Badge>
    ) : (
      <Badge variant="warning">{fr ? "Bientôt" : "Coming soon"}</Badge>
    );

  const row = (a: Area, withLevel = true) => {
    const other = fr ? a.nameEn : a.name;
    const own = areaName(a, fr);
    return (
      <button
        type="button"
        onClick={() => pick(a, false)}
        className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-0.5 text-left"
        data-testid="geo-row"
        data-code={a.code}
      >
        <span className={`text-sm ${a.active ? "font-medium text-slate-900" : "text-slate-400 line-through"}`}>{own}</span>
        {other && other !== own && <span className="text-xs text-slate-400">({other})</span>}
        {withLevel && <span className="text-[11px] uppercase tracking-wide text-slate-400">{levelLabel(a.level, fr)}</span>}
        {servedBadge(a)}
        {!a.active && <Badge>{fr ? "Masquée" : "Hidden"}</Badge>}
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={fr ? "Géographie" : "Geography"}
        subtitle={
          fr
            ? "Pays → province → ville → district → commune → quartier : noms, orthographe Google, alias, position et zones desservies"
            : "Country → province → city → district → commune → neighbourhood: names, Google spelling, aliases, pin and served areas"
        }
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: fr ? "Géographie" : "Geography" }]}
      />

      {!mayEdit && (
        <NoticeBar>{fr ? "Lecture seule : seuls les rôles admin et opérations modifient la géographie." : "Read-only: only the admin and operations roles edit the geography."}</NoticeBar>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                className="w-full bg-transparent text-sm outline-none"
                placeholder={fr ? "Chercher une zone (nom, orthographe Google, alias)…" : "Search an area (name, Google spelling, alias)…"}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={fr ? "Chercher une zone" : "Search an area"}
                data-testid="geo-search"
              />
            </div>

            {search.active ? (
              search.error ? (
                <SectionError message={search.error} />
              ) : search.loading ? (
                <SectionLoading />
              ) : search.rows.length === 0 ? (
                <EmptyState>{fr ? "Aucune zone ne correspond." : "No area matches."}</EmptyState>
              ) : (
                <ul className="divide-y divide-slate-100" data-testid="geo-results">
                  {search.rows.map((a) => (
                    <li key={a.id}>
                      <button type="button" onClick={() => pick(a, true)} className="flex w-full flex-wrap items-center gap-2 px-1 py-2 text-left hover:bg-slate-50" data-testid="geo-result" data-code={a.code}>
                        <span className="text-sm font-medium text-slate-900">{areaName(a, fr)}</span>
                        <span className="text-[11px] uppercase tracking-wide text-slate-400">{levelLabel(a.level, fr)}</span>
                        {servedBadge(a)}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <Globe2 className="h-4 w-4 text-[var(--primary)]" />
                  {countryName("CD", fr)}
                </p>
                <AreaTree fr={fr} renderRow={(a) => row(a)} reveal={reveal} selectedId={area?.id ?? null} className="max-h-[70vh] overflow-y-auto pr-1" />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            {area ? (
              <AreaDetail key={area.id} area={area} fr={fr} mayEdit={mayEdit} onAdd={setAddUnder} />
            ) : (
              <EmptyState>{fr ? "Choisissez une zone dans l'arbre ou la recherche pour la voir ou la modifier." : "Pick an area in the tree or the search to view or edit it."}</EmptyState>
            )}
          </CardContent>
        </Card>
      </div>

      <NoticeBar>
        {fr
          ? "Une zone est « desservie » quand elle, ou une zone parente, est couverte par un entrepôt actif. Les couvertures se gèrent dans Entrepôts."
          : "An area is “served” when it, or a parent area, is covered by an active warehouse. Coverage is managed under Warehouses."}
      </NoticeBar>

      <AreaCreateModal parent={addUnder} fr={fr} onClose={() => setAddUnder(null)} onCreated={(a) => { setSelected(a); setReveal(new Set(a.path.split("/"))); }} />
    </div>
  );
}
