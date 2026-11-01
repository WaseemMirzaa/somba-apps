/**
 * The "we don't deliver there yet" refusal (docs/contracts/areas.md, "Not served"), as plain functions.
 *
 * `delivery:quote` and `orders:create` refuse an address outside every served area with the English sentence AND
 * structured fields: `{ code: 'not_served', areaId, areaName, areaNameEn, servedCities: {id,name,nameEn}[] }`. The
 * screens render their own sentence in the UI language from those fields. An old server only sends the sentence
 * ("We don't deliver to {area} yet."), so the message is still parsed as a fallback and the cities then come from
 * the geography the client already holds.
 *
 * No imports: `npm test` loads this file on its own.
 */

export interface ServedCity {
  id: string;
  /** Official (French) name. */
  name: string;
  nameEn: string | null;
}

export interface NotServedInfo {
  /** The area's official (French) name, or what the customer typed; "" when nothing could be matched. */
  area: string;
  /** English name of the area, when known. */
  areaEn?: string;
  areaId?: string | null;
  /** Where we deliver, as the server lists it (absent on an old server: use the client's own footprint). */
  servedCities?: ServedCity[];
}

const NOT_SERVED_EN = /^We don[’']t deliver to (.+?) yet\.?$/i;
const NOT_SERVED_FR = /^Nous ne livrons pas encore (?:à|a|au|aux|en|dans) (.+?)\.?$/i;
/** `{area}` is "this area" when the server matched nothing at all. */
const UNNAMED = /^(?:this area|cette zone)$/i;

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Recognises the server's "We don't deliver to {area} yet." (English on the wire, or already in French). */
export function parseNotServed(message: string | null | undefined): NotServedInfo | null {
  const m = (message ?? "").trim().replace(/\s+/g, " ");
  const hit = NOT_SERVED_EN.exec(m) ?? NOT_SERVED_FR.exec(m);
  if (!hit) return null;
  return { area: UNNAMED.test(hit[1]) ? "" : hit[1] };
}

const SELLER_AREA_EN = /^One seller in your cart cannot ship from their area yet\.?$/i;
const SELLER_AREA_FR = /^Un vendeur de votre panier ne peut pas encore expédier depuis sa zone\.?$/i;

/**
 * The other refusal of a quote (docs/contracts/areas.md, "Addresses, sellers, orders"): the address is served, but a seller in
 * the cart picks up in an area nobody serves yet. English on the wire (`raw` on the error `socketClient.request` throws), and
 * already French in `message` when the UI is French, so both are read.
 */
export function isSellerAreaRefusal(e: unknown): boolean {
  if (!e) return false;
  const err = e as { raw?: unknown; message?: unknown };
  return [err.raw, err.message, e].some((m) => {
    if (typeof m !== "string") return false;
    const t = m.trim().replace(/\s+/g, " ");
    return SELLER_AREA_EN.test(t) || SELLER_AREA_FR.test(t);
  });
}

function cleanCities(v: unknown): ServedCity[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: ServedCity[] = [];
  for (const c of v) {
    const row = c as { id?: unknown; name?: unknown; nameEn?: unknown } | null;
    const name = text(row?.name);
    if (!name) continue;
    out.push({ id: text(row?.id), name, nameEn: text(row?.nameEn) || null });
  }
  return out;
}

/** The structured refusal fields of an ack (`code: 'not_served'`), or null for anything else. */
export function notServedFromAck(ack: unknown): NotServedInfo | null {
  const a = ack as Record<string, unknown> | null | undefined;
  if (!a || typeof a !== "object" || a.code !== "not_served") return null;
  const area = text(a.areaName);
  const areaEn = text(a.areaNameEn);
  return {
    area: UNNAMED.test(area) ? "" : area,
    ...(areaEn && !UNNAMED.test(areaEn) ? { areaEn } : {}),
    areaId: typeof a.areaId === "string" ? a.areaId : null,
    servedCities: cleanCities(a.servedCities) ?? [],
  };
}

/**
 * The refusal behind an error thrown by `socketClient.request`: the structured fields when the server sent them,
 * else the sentence (`raw` is the server's own English text, `message` the localised one).
 */
export function notServedFromError(e: unknown): NotServedInfo | null {
  if (!e) return null;
  const err = e as { raw?: string; message?: string; ack?: unknown };
  return notServedFromAck(err.ack) ?? parseNotServed(err.raw) ?? parseNotServed(err.message ?? (typeof e === "string" ? e : ""));
}

/** The area's name in the reader's language: English falls back to the official (French) name. */
export function notServedArea(info: Pick<NotServedInfo, "area" | "areaEn"> | null | undefined, fr: boolean): string {
  if (!info) return "";
  return fr ? info.area : info.areaEn || info.area;
}

/** The server's served cities in the reader's language ("Kinshasa", "Lubumbashi"); empty when it sent none. */
export function notServedCityNames(info: Pick<NotServedInfo, "servedCities"> | null | undefined, fr: boolean): string[] {
  return (info?.servedCities ?? []).map((c) => (fr ? c.name : c.nameEn || c.name)).filter(Boolean);
}

/**
 * The bilingual refusal shown at checkout, in the cart and in the address forms:
 * "We don't deliver to Lubumbashi yet. We currently deliver in: Kinshasa."
 */
export function notServedText(area: string | null | undefined, cities: string[], fr: boolean): string {
  const where = (area ?? "").trim();
  const head = fr
    ? where ? `Nous ne livrons pas encore à ${where}.` : "Nous ne livrons pas encore dans cette zone."
    : where ? `We don't deliver to ${where} yet.` : "We don't deliver to this area yet.";
  const list = cities.filter(Boolean);
  if (list.length === 0) return head;
  return `${head} ${fr ? "Nous livrons actuellement à :" : "We currently deliver in:"} ${list.join(", ")}.`;
}

/** Lower-case, no accents, no hyphens, apostrophes or spaces: the server's own matching rule for names. */
export const normaliseAreaName = (s: string | null | undefined): string =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s\-’'`.]/g, "");

interface NamedArea {
  name: string;
  nameEn?: string | null;
  googleName?: string | null;
  googleNameEn?: string | null;
  aliases?: string[] | null;
  children?: NamedArea[];
}

/**
 * Old servers only send the area's French name. The English name is found in the geography the client already holds
 * (the cached tree), so no extra request is needed. Returns null when no area carries that name.
 */
export function englishAreaName(root: NamedArea | null | undefined, frenchName: string): string | null {
  const want = normaliseAreaName(frenchName);
  if (!root || !want) return null;
  let found: NamedArea | null = null;
  const walk = (n: NamedArea) => {
    if (found) return;
    const names = [n.name, n.nameEn, n.googleName, n.googleNameEn, ...(n.aliases ?? [])];
    if (names.some((x) => normaliseAreaName(x) === want)) {
      found = n;
      return;
    }
    (n.children ?? []).forEach(walk);
  };
  walk(root);
  const hit = found as NamedArea | null;
  return hit ? hit.nameEn || hit.name : null;
}
