/**
 * Delivery zones live in the `deliveryZones` setting: [{ id, name, nameFr?, city, feeUsd, hubId? }]. A zone is a
 * commune (or a group of them) and belongs to one warehouse through `hubId`. Same matching as the customer app's
 * util/zone_match.dart, so the server and the app agree on which zone an address is in.
 */
export interface DeliveryZone {
  id: string;
  name: string;
  nameFr?: string;
  city: string;
  feeUsd: number;
  hubId?: string | null;
}

export function parseZones(raw: string | null | undefined): DeliveryZone[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as DeliveryZone[]).filter((z) => z && typeof z.id === 'string') : [];
  } catch {
    return [];
  }
}

const FROM = 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ';
const TO = 'aaaaaaceeeeiiiinooooouuuuyy';

/** Lower-case, accents stripped, "Commune de" dropped, punctuation squashed: "Commune de Limeté " → "limete". */
export function normZone(v: string | null | undefined): string {
  if (!v) return '';
  let out = '';
  for (const ch of v.toLowerCase()) {
    const i = FROM.indexOf(ch);
    out += i >= 0 ? TO[i] : ch;
  }
  return out
    .replace(/^commune (de |d')?/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The zone an address falls in: its saved zone id when still valid, else its commune (within the same city). */
export function zoneForAddress(
  addr: { commune?: string | null; city?: string | null; zoneId?: string | null },
  zones: DeliveryZone[],
): DeliveryZone | null {
  if (addr.zoneId) {
    const byId = zones.find((z) => z.id === addr.zoneId);
    if (byId) return byId;
  }
  const c = normZone(addr.commune);
  if (!c) return null;
  const city = normZone(addr.city);
  return (
    zones.find((z) => {
      const names = new Set([normZone(z.id), normZone(z.name), normZone(z.nameFr)]);
      const zCity = normZone(z.city);
      const sameCity = !city || !zCity || zCity === city;
      return sameCity && names.has(c);
    }) ?? null
  );
}
