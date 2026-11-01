"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinned, Warehouse } from "lucide-react";
import { useRealtime } from "@/context/realtime-context";
import {
  areaName,
  geoCommunes,
  geoResolve,
  groupCommunes,
  levelLabel,
  notServedText,
  servedCityNames,
  useAreaChildren,
  useFootprint,
  useGeoVersion,
  type Area,
  type AreaChain,
  type AreaHint,
  type CommuneGroup,
  type CommuneRow,
} from "@/lib/areas";

export interface AreaSelection {
  /** The most specific area chosen (quartier, else commune, else city, else province). */
  areaId: string | null;
  area: Area | null;
  /** Province → … → most specific, districts included when the commune sits in one. */
  chain: AreaChain;
  served: boolean;
  /** Enough detail to save: a commune is chosen whenever the city has communes. */
  complete: boolean;
}

type Sel = { province: Area | null; city: Area | null; district: Area | null; commune: Area | null; quartier: Area | null };
const EMPTY: Sel = { province: null, city: null, district: null, commune: null, quartier: null };

function fromChain(chain: AreaChain | null | undefined): Sel {
  const sel: Sel = { ...EMPTY };
  for (const a of chain ?? []) {
    if (a.level === "province") sel.province = a;
    else if (a.level === "city") sel.city = a;
    else if (a.level === "district") sel.district = a;
    else if (a.level === "commune") sel.commune = a;
    else if (a.level === "quartier") sel.quartier = a;
  }
  return sel;
}

type Group = CommuneGroup<Area, CommuneRow>;

/**
 * The communes of a city in ONE call (`geo:communes`), grouped by the district each commune carries (Kinshasa), flat
 * when the city has none.
 */
function useCommunes(city: Area | null, version: number, connected: boolean, fr: boolean) {
  const [state, setState] = useState<{ key: string; groups: Group[] } | null>(null);
  const key = `${city?.id ?? ""}:${version}`;
  useEffect(() => {
    if (!city || !connected) return;
    let alive = true;
    geoCommunes(city.id)
      .then((rows) => alive && setState({ key, groups: groupCommunes<Area, CommuneRow>(rows, fr) }))
      .catch(() => alive && setState({ key, groups: [] }));
    return () => {
      alive = false;
    };
  }, [city, key, connected, fr]);
  const ready = !!city && state?.key === key;
  return { groups: ready ? state!.groups : null, loading: !!city && !ready };
}

const selectClass = "input-premium w-full px-3 py-2 text-sm disabled:opacity-60";

/**
 * Province → City → Commune (→ Quartier) pickers, prefilled from a map pin.
 *
 * `hint` carries what the pin gave (`components` from Google, a `pin`, or typed `text`): each new `hint` object is sent
 * to `geo:resolve` and the pickers fill in from the answer. The user can still correct them. Areas where we do not
 * deliver yet are listed last and disabled ("coming soon") unless `allowUnserved` (a warehouse may sit anywhere).
 * Districts never show: they only group the communes.
 */
export function AreaPicker({
  fr,
  hint,
  initialChain,
  allowUnserved = false,
  disabled = false,
  purpose = "delivery",
  onChange,
  testId = "area-picker",
}: {
  fr: boolean;
  hint?: AreaHint | null;
  /** The chain of an address that is being edited (`areaChain`). */
  initialChain?: AreaChain | null;
  allowUnserved?: boolean;
  disabled?: boolean;
  /** Changes the wording only: where we deliver, where a seller's parcels are collected, where a warehouse sits. */
  purpose?: "delivery" | "pickup" | "warehouse";
  onChange: (sel: AreaSelection) => void;
  testId?: string;
}) {
  const rt = useRealtime();
  const connected = rt.status === "connected";
  const version = useGeoVersion();
  const footprint = useFootprint();
  const [sel, setSel] = useState<Sel>(() => fromChain(initialChain));
  const [resolving, setResolving] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const onChangeRef = useRef(onChange);
  const lastHint = useRef<AreaHint | null | undefined>(null);
  const lastKey = useRef<string>("");

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const provinces = useAreaChildren(null);
  const cities = useAreaChildren(sel.province?.id ?? undefined, !!sel.province);
  const communes = useCommunes(sel.city, version, connected, fr);
  const quartiers = useAreaChildren(sel.commune?.id ?? undefined, !!sel.commune);
  const quartierRows = useMemo(() => (quartiers.rows ?? []).filter((a) => a.level === "quartier"), [quartiers.rows]);

  // A new pin: ask the server which area it is in, then fill the pickers.
  useEffect(() => {
    if (!hint || hint === lastHint.current || !connected) return;
    lastHint.current = hint;
    const hasInput = (hint.components && hint.components.length > 0) || hint.pin || hint.text;
    if (!hasInput) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- shows "matching…" while the server answers
    setResolving(true);
    setNoMatch(false);
    geoResolve(hint)
      .then((res) => {
        if (!alive) return;
        if (res.area && res.chain?.length) setSel(fromChain(res.chain));
        else setNoMatch(true);
      })
      .catch(() => alive && setNoMatch(true))
      .finally(() => alive && setResolving(false));
    return () => {
      alive = false;
    };
  }, [hint, connected]);

  // A province with a single city (Kinshasa) picks it for you.
  useEffect(() => {
    if (sel.province && !sel.city && cities.rows && cities.rows.length === 1 && cities.rows[0].level === "city") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived default
      setSel((s) => (s.province && !s.city ? { ...s, city: cities.rows![0] } : s));
    }
  }, [sel.province, sel.city, cities.rows]);

  const deepest = sel.quartier ?? sel.commune ?? sel.city ?? sel.province;
  const needsCity = !!sel.province && (cities.rows?.length ?? 0) > 0;
  const needsCommune = !!sel.city && (communes.groups?.reduce((n, g) => n + g.areas.length, 0) ?? 0) > 0;
  const loadingDeeper = cities.loading || communes.loading;
  const servedOk = !!deepest && (allowUnserved || deepest.served);
  const complete = !!sel.province && !loadingDeeper && (!needsCity || !!sel.city) && (!needsCommune || !!sel.commune) && servedOk;
  const chain = useMemo(() => [sel.province, sel.city, sel.district, sel.commune, sel.quartier].filter((a): a is Area => !!a), [sel]);

  useEffect(() => {
    const key = `${deepest?.id ?? ""}|${complete}|${deepest?.served ?? false}`;
    if (key === lastKey.current) return;
    lastKey.current = key;
    onChangeRef.current({ areaId: deepest?.id ?? null, area: deepest ?? null, chain, served: !!deepest?.served, complete });
  }, [deepest, chain, complete]);

  const optionDisabled = (a: Area) => !allowUnserved && !footprint.has(a);
  const soon = fr ? "bientôt" : "coming soon";
  const label = (a: Area) => `${areaName(a, fr)}${footprint.ready && optionDisabled(a) ? ` (${soon})` : ""}`;

  /** The chosen area is shown even when it is not in the loaded list (hidden, or the list is still loading). */
  const withCurrent = (rows: Area[] | null | undefined, current: Area | null) => {
    const list = rows ?? [];
    return current && !list.some((a) => a.id === current.id) ? [current, ...list] : list;
  };

  function pick(level: "province" | "city" | "commune" | "quartier", id: string, rows: Area[]) {
    const a = rows.find((r) => r.id === id) ?? null;
    setNoMatch(false);
    if (level === "province") setSel({ ...EMPTY, province: a });
    else if (level === "city") setSel((s) => ({ ...EMPTY, province: s.province, city: a }));
    else if (level === "commune") {
      // The commune carries its district (null when it sits directly under the city).
      const district = (a as CommuneRow | null)?.district ?? null;
      setSel((s) => ({ ...s, district, commune: a, quartier: null }));
    } else setSel((s) => ({ ...s, quartier: a }));
  }

  const communeRows = communes.groups?.flatMap((g) => g.areas) ?? [];
  const showCommuneGroups = (communes.groups?.length ?? 0) > 1 || !!communes.groups?.[0]?.district;
  const names = servedCityNames(footprint, fr);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4" data-testid={testId}>
      <div className="flex items-start gap-2">
        <MapPinned className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {purpose === "pickup" ? (fr ? "Zone de collecte" : "Pickup area") : purpose === "warehouse" ? (fr ? "Emplacement de l'entrepôt" : "Warehouse location") : fr ? "Zone de livraison" : "Delivery area"}
          </p>
          <p className="text-xs text-slate-500">
            {purpose === "warehouse"
              ? fr ? "Province, ville et commune où se trouve l'entrepôt. Remplie à partir de l'épingle si vous la placez." : "The province, city and commune where the warehouse sits. Filled in from the pin if you place one."
              : fr
                ? "Remplie à partir de l'épingle ; corrigez-la si besoin. Les zones non desservies sont grisées."
                : "Filled in from the pin; correct it if needed. Areas we do not serve yet are greyed out."}
          </p>
        </div>
      </div>

      {provinces.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700" role="alert" data-testid="area-error">
          {fr ? "Impossible de charger les zones : " : "Could not load the areas: "}
          {provinces.error}
        </p>
      )}
      {resolving && <p className="text-xs text-slate-500" role="status">{fr ? "Recherche de la zone de l'épingle…" : "Matching the pin to an area…"}</p>}
      {noMatch && !resolving && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" role="note" data-testid="area-nomatch">
          {fr ? "Nous n'avons pas reconnu cet endroit : choisissez la zone dans les listes ci-dessous." : "We could not recognise this place: choose the area from the lists below."}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600">
          {levelLabel("province", fr)}
          <select
            className={`${selectClass} mt-1`}
            data-testid="area-province"
            value={sel.province?.id ?? ""}
            disabled={disabled || provinces.loading}
            onChange={(e) => pick("province", e.target.value, provinces.rows ?? [])}
          >
            <option value="">{fr ? "Choisir…" : "Select…"}</option>
            {withCurrent(provinces.rows, sel.province).map((a) => (
              <option key={a.id} value={a.id} disabled={optionDisabled(a) && a.id !== sel.province?.id}>{label(a)}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {levelLabel("city", fr)}
          <select
            className={`${selectClass} mt-1`}
            data-testid="area-city"
            value={sel.city?.id ?? ""}
            disabled={disabled || !sel.province || cities.loading}
            onChange={(e) => pick("city", e.target.value, cities.rows ?? [])}
          >
            <option value="">{fr ? "Choisir…" : "Select…"}</option>
            {withCurrent(cities.rows, sel.city).map((a) => (
              <option key={a.id} value={a.id} disabled={optionDisabled(a) && a.id !== sel.city?.id}>{label(a)}</option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-600">
          {levelLabel("commune", fr)}
          <select
            className={`${selectClass} mt-1`}
            data-testid="area-commune"
            value={sel.commune?.id ?? ""}
            disabled={disabled || !sel.city || communes.loading || (communeRows.length === 0 && !sel.commune)}
            onChange={(e) => pick("commune", e.target.value, communeRows)}
          >
            <option value="">{communes.loading ? (fr ? "Chargement…" : "Loading…") : communeRows.length === 0 && sel.city ? (fr ? "Aucune commune" : "No communes") : fr ? "Choisir…" : "Select…"}</option>
            {sel.commune && !communeRows.some((a) => a.id === sel.commune!.id) && <option value={sel.commune.id}>{label(sel.commune)}</option>}
            {showCommuneGroups
              ? (communes.groups ?? []).map((g) => (
                  <optgroup key={g.district?.id ?? "direct"} label={g.district ? areaName(g.district, fr) : levelLabel("commune", fr)}>
                    {g.areas.map((a) => (
                      <option key={a.id} value={a.id} disabled={optionDisabled(a) && a.id !== sel.commune?.id}>{label(a)}</option>
                    ))}
                  </optgroup>
                ))
              : communeRows.map((a) => (
                  <option key={a.id} value={a.id} disabled={optionDisabled(a) && a.id !== sel.commune?.id}>{label(a)}</option>
                ))}
          </select>
        </label>
        {(quartierRows.length > 0 || sel.quartier) && (
          <label className="block text-xs font-medium text-slate-600">
            {levelLabel("quartier", fr)}
            <select
              className={`${selectClass} mt-1`}
              data-testid="area-quartier"
              value={sel.quartier?.id ?? ""}
              disabled={disabled}
              onChange={(e) => pick("quartier", e.target.value, quartierRows)}
            >
              <option value="">{fr ? "Facultatif" : "Optional"}</option>
              {withCurrent(quartierRows, sel.quartier).map((a) => (
                <option key={a.id} value={a.id} disabled={optionDisabled(a) && a.id !== sel.quartier?.id}>{label(a)}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {deepest && deepest.served && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800" data-testid="area-served">
          <Warehouse className="h-4 w-4 shrink-0" />
          <span>
            {purpose === "pickup" ? (fr ? "Zone desservie : vos colis sont collectés" : "Served area: your parcels are collected") : fr ? "Zone desservie" : "We deliver here"}
            {deepest.hubName ? ` · ${fr ? "entrepôt" : "warehouse"} ${deepest.hubName}` : ""}
          </span>
        </p>
      )}
      {deepest && !deepest.served && deepest.partiallyServed && !allowUnserved && (
        <p role="note" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900" data-testid="area-partial">
          {fr
            ? `Nous ne livrons que dans une partie de ${areaName(deepest, fr)} : choisissez la ville ou la commune.`
            : `We only deliver in part of ${areaName(deepest, fr)}: choose the city or commune.`}
        </p>
      )}
      {deepest && !deepest.served && !deepest.partiallyServed && !allowUnserved && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900" role="alert" data-testid="area-unserved">
          {notServedText(areaName(deepest, fr), names, fr)}{" "}
          {purpose === "pickup"
            ? fr ? "Vous pouvez préparer la boutique ; les ventes ouvriront dès que nous livrerons chez vous." : "You can prepare the store; sales open when we deliver there."
            : fr ? "Vous pouvez l'enregistrer, mais pas commander vers cette adresse pour l'instant." : "You can save it, but you cannot order to it yet."}
        </p>
      )}
      {sel.city && needsCommune && !sel.commune && !communes.loading && (
        <p className="text-xs text-slate-500" role="note">
          {fr ? "Choisissez la commune : elle détermine l'entrepôt qui vous livre." : "Choose the commune: it decides which warehouse serves you."}
        </p>
      )}
    </div>
  );
}
