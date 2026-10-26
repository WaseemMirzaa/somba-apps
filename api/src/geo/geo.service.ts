import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Address, GeoArea, Hub, HubCoverage, Order, Seller } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { cleanPoint } from '../common/geo/geo';
import { num, str } from '../common/validate';
import { AreaIndex } from './area-index';
import { AREA_LEVELS, AreaLevel, CHILD_LEVELS, LEVEL_DEPTH, areaKeys, codeFragment, isAreaLevel } from './area-model';
import { GoogleComponent, MatchedBy, ResolveInput, TextHints, resolveArea } from './area-resolve';
import { buildAreaRows, loadDrc, loadGoogleNames } from './geo-data';

/** Every role that has a socket: area changes are pushed to all of them (guests browse the pickers too). */
export const EVERYONE = ['guest', 'customer', 'seller', 'rider', 'warehouse_staff', 'admin', 'admin_operations', 'admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation'];

/** An area as every payload serves it (see docs/contracts/areas.md). */
export interface AreaView {
  id: string;
  code: string;
  level: AreaLevel;
  name: string;
  nameEn: string | null;
  googleName: string;
  googleNameEn: string;
  aliases: string[];
  parentId: string | null;
  path: string;
  depth: number;
  lat: number | null;
  lng: number | null;
  active: boolean;
  /** A city's status: `official` or `decree-2013` (null elsewhere). */
  status: string | null;
  served: boolean;
  /** Not served itself, but something inside it is (e.g. Haut-Katanga when only the city Lubumbashi is covered). */
  partiallyServed: boolean;
  hubId: string | null;
  hubName: string | null;
  childCount: number;
}
export type AreaChainView = AreaView[];

/** Who covers an area and why: the first coverage row, walking up, that belongs to an active warehouse. */
export interface Covering {
  hubId: string;
  hubName: string;
  /** The area the deciding coverage row is attached to (the area itself, or an ancestor). */
  coverageAreaId: string;
  /** Flat delivery fee of the deciding row (replaces base + per km), when set. */
  feeOverrideUsd: number | null;
  direct: boolean;
}

interface CoverageSnapshot {
  /** areaId -> row, only rows of ACTIVE warehouses. */
  effective: Map<string, { hubId: string; hubName: string; feeOverrideUsd: number | null }>;
  hubs: Map<string, { id: string; name: string; active: boolean; areaId: string | null }>;
}

const INDEX_TTL_MS = 30_000;
const COVERAGE_TTL_MS = 10_000;

export interface ResolveReply {
  area: AreaView | null;
  chain: AreaChainView;
  served: boolean;
  hubId: string | null;
  hubName: string | null;
  matchedBy: MatchedBy | null;
}

export interface AddressAreaInput {
  areaId?: unknown;
  components?: unknown;
  geo?: { lat?: unknown; lng?: unknown } | null;
  commune?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  quartier?: string | null;
}

/**
 * The delivery geography: the area tree (cached in memory), name matching, resolving an address to an area, and "who
 * serves this area" (cached, invalidated whenever coverage or a warehouse changes). Routing, addresses, sellers and the
 * admin screens all go through here. See docs/contracts/areas.md.
 */
@Injectable()
export class GeoService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GeoService.name);
  private ix: AreaIndex | null = null;
  private ixAt = 0;
  private snap: CoverageSnapshot | null = null;
  private snapAt = 0;

  constructor(
    @InjectRepository(GeoArea) private readonly areas: Repository<GeoArea>,
    @InjectRepository(HubCoverage) private readonly coverage: Repository<HubCoverage>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(Address) private readonly addresses: Repository<Address>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  /** A database that has no geography yet (a fresh dev database) gets the DRC tree on first boot. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      if ((await this.areas.count()) === 0) {
        const n = await this.ensureSeeded();
        this.logger.log(`Seeded ${n} delivery areas.`);
      }
    } catch (e) {
      this.logger.warn(`Could not seed the delivery areas: ${(e as Error).message}`);
    }
  }

  /** Insert the DRC areas that are missing (by code); never touches an existing row. Returns how many were added. */
  async ensureSeeded(): Promise<number> {
    const existing = await this.areas.find({ select: { id: true, code: true } });
    const known = new Map(existing.map((a) => [a.code, a.id]));
    const rows = buildAreaRows(loadDrc(), loadGoogleNames(), known);
    const fresh = rows.filter((r) => !known.has(r.code));
    for (let i = 0; i < fresh.length; i += 200) await this.areas.insert(fresh.slice(i, i + 200).map((r) => ({ ...r, active: true }) as never));
    this.invalidate();
    return fresh.length;
  }

  // ── caches ───────────────────────────────────────────────────────────────────
  invalidateAreas(): void {
    this.ix = null;
  }

  invalidateCoverage(): void {
    this.snap = null;
  }

  invalidate(): void {
    this.invalidateAreas();
    this.invalidateCoverage();
  }

  async index(): Promise<AreaIndex> {
    if (!this.ix || Date.now() - this.ixAt > INDEX_TTL_MS) {
      this.ix = new AreaIndex(await this.areas.find());
      this.ixAt = Date.now();
    }
    return this.ix;
  }

  private async snapshot(): Promise<CoverageSnapshot> {
    if (!this.snap || Date.now() - this.snapAt > COVERAGE_TTL_MS) {
      const [rows, hubs] = await Promise.all([this.coverage.find(), this.hubs.find()]);
      const hubMap = new Map(hubs.map((h) => [h.id, { id: h.id, name: h.name, active: h.active, areaId: h.areaId ?? null }]));
      const effective: CoverageSnapshot['effective'] = new Map();
      for (const r of rows) {
        const h = hubMap.get(r.hubId);
        if (h?.active) effective.set(r.areaId, { hubId: h.id, hubName: h.name, feeOverrideUsd: r.feeOverrideUsd ?? null });
      }
      this.snap = { effective, hubs: hubMap };
      this.snapAt = Date.now();
    }
    return this.snap;
  }

  // ── who serves an area ───────────────────────────────────────────────────────
  /** The covering warehouse of an area: its own coverage row, else the nearest ancestor's (an inactive warehouse is skipped). */
  async covering(areaId: string | null | undefined): Promise<Covering | null> {
    if (!areaId) return null;
    return this.coveringIn(await this.index(), await this.snapshot(), areaId);
  }

  private coveringIn(ix: AreaIndex, snap: CoverageSnapshot, areaId: string): Covering | null {
    const chain = ix.chain(areaId);
    for (let i = chain.length - 1; i >= 0; i--) {
      const e = snap.effective.get(chain[i].id);
      if (e) return { hubId: e.hubId, hubName: e.hubName, coverageAreaId: chain[i].id, feeOverrideUsd: e.feeOverrideUsd, direct: chain[i].id === areaId };
    }
    return null;
  }

  /** Covering warehouse of many areas at once (null = not served). */
  async coveringMany(ids: readonly string[]): Promise<Map<string, Covering | null>> {
    const [ix, snap] = await Promise.all([this.index(), this.snapshot()]);
    return new Map(ids.map((id) => [id, this.coveringIn(ix, snap, id)]));
  }

  /** Does any active warehouse hold a coverage row on this area or below it? (For gap analysis.) */
  async hasCoverageBelow(areaId: string): Promise<boolean> {
    const [ix, snap] = await Promise.all([this.index(), this.snapshot()]);
    return ix.subtree(areaId).some((a) => a.id !== areaId && snap.effective.has(a.id));
  }

  /** Warehouses by id (name, active, location area) from the same snapshot routing uses. */
  async hubDirectory(): Promise<CoverageSnapshot['hubs']> {
    return (await this.snapshot()).hubs;
  }

  /** Areas that have a covered area somewhere below them (memoised per index + coverage snapshot). */
  private partialMemo: { ix: AreaIndex; snap: CoverageSnapshot; set: Set<string> } | null = null;

  private coveredBelow(ix: AreaIndex, snap: CoverageSnapshot): Set<string> {
    if (this.partialMemo && this.partialMemo.ix === ix && this.partialMemo.snap === snap) return this.partialMemo.set;
    const set = new Set<string>();
    for (const areaId of snap.effective.keys()) for (const a of ix.chain(areaId)) if (a.id !== areaId) set.add(a.id);
    this.partialMemo = { ix, snap, set };
    return set;
  }

  // ── views ────────────────────────────────────────────────────────────────────
  private viewIn(ix: AreaIndex, snap: CoverageSnapshot, a: GeoArea): AreaView {
    const cov = this.coveringIn(ix, snap, a.id);
    return {
      id: a.id,
      code: a.code,
      level: a.level,
      name: a.name,
      nameEn: a.nameEn ?? null,
      googleName: a.googleName,
      googleNameEn: a.googleNameEn || a.googleName,
      aliases: a.aliases ?? [],
      parentId: a.parentId ?? null,
      path: a.path,
      depth: a.depth,
      lat: a.lat ?? null,
      lng: a.lng ?? null,
      active: a.active,
      status: typeof a.meta?.status === 'string' ? (a.meta.status as string) : null,
      served: !!cov,
      partiallyServed: !cov && this.coveredBelow(ix, snap).has(a.id),
      hubId: cov?.hubId ?? null,
      hubName: cov?.hubName ?? null,
      childCount: ix.children(a.id).length,
    };
  }

  async view(areaId: string | null | undefined): Promise<AreaView | null> {
    if (!areaId) return null;
    const [ix, snap] = await Promise.all([this.index(), this.snapshot()]);
    const a = ix.get(areaId);
    return a ? this.viewIn(ix, snap, a) : null;
  }

  async views(ids: readonly string[]): Promise<AreaView[]> {
    const [ix, snap] = await Promise.all([this.index(), this.snapshot()]);
    return ids.map((id) => ix.get(id)).filter((a): a is GeoArea => !!a).map((a) => this.viewIn(ix, snap, a));
  }

  /** The area and its ancestors (country first). */
  async chainView(areaId: string | null | undefined): Promise<AreaChainView> {
    if (!areaId) return [];
    const [ix, snap] = await Promise.all([this.index(), this.snapshot()]);
    return ix.chain(areaId).map((a) => this.viewIn(ix, snap, a));
  }

  async get(id: unknown): Promise<GeoArea> {
    const a = (await this.index()).get(typeof id === 'string' ? id : null);
    if (!a) throw new NotFoundException('Area not found.');
    return a;
  }

  async getByCode(code: string): Promise<GeoArea | null> {
    return (await this.index()).byCode.get(code) ?? null;
  }

  // ── reads ────────────────────────────────────────────────────────────────────
  private sortServedFirst(list: AreaView[]): AreaView[] {
    return list.map((v, i) => ({ v, i })).sort((a, b) => Number(b.v.served) - Number(a.v.served) || a.i - b.i).map((x) => x.v);
  }

  /**
   * Children of an area (none given: the country's provinces), served first, then in display order. Inactive areas only for
   * admins. `flatten: 'commune'` returns every commune below the area instead (for Kinshasa: the 24 communes in one call),
   * each with its `district` (null when the commune hangs straight under a city), sorted by district, then served first,
   * then by name.
   */
  async children(input: { parentId?: string | null; parentCode?: string | null; flatten?: string | null }, opts: { includeInactive?: boolean } = {}): Promise<(AreaView & { district?: AreaView | null })[]> {
    const [ix, snap] = await Promise.all([this.index(), this.snapshot()]);
    let parent: GeoArea | null = null;
    if (input.parentId) parent = ix.get(input.parentId);
    else if (input.parentCode) parent = ix.byCode.get(String(input.parentCode)) ?? null;
    else parent = ix.root;
    if ((input.parentId || input.parentCode) && !parent) throw new NotFoundException('Area not found.');
    if (!parent) return [];
    if (input.flatten !== undefined && input.flatten !== null && input.flatten !== '') {
      if (input.flatten !== 'commune') throw new BadRequestException("Flatten must be 'commune'.");
      const communes = ix.subtree(parent.id).filter((a) => a.level === 'commune' && (opts.includeInactive || a.active));
      // By district first (the districts' own display order, communes under no district last) so districts never interleave,
      // then served first, then by name.
      const rows = communes.map((a) => {
        const d = ix.ancestorAt(a.id, 'district');
        return { a, d, v: { ...this.viewIn(ix, snap, a), district: d ? this.viewIn(ix, snap, d) : null } };
      });
      rows.sort((x, y) => {
        if (x.d?.id !== y.d?.id) {
          if (!x.d) return 1;
          if (!y.d) return -1;
          return (x.d.sortOrder ?? 0) - (y.d.sortOrder ?? 0) || x.d.name.localeCompare(y.d.name, 'fr') || (x.d.id < y.d.id ? -1 : 1);
        }
        return Number(y.v.served) - Number(x.v.served) || x.a.name.localeCompare(y.a.name, 'fr');
      });
      return rows.map((r) => r.v);
    }
    return this.sortServedFirst(
      ix
        .children(parent.id)
        .filter((a) => opts.includeInactive || a.active)
        .map((a) => this.viewIn(ix, snap, a)),
    );
  }

  /** A nested tree from a root (default: the country) down `depth` levels (default: all). */
  async tree(input: { rootCode?: string | null; depth?: number | null }, opts: { includeInactive?: boolean } = {}): Promise<(AreaView & { children: AreaView[] }) | null> {
    const [ix, snap] = await Promise.all([this.index(), this.snapshot()]);
    const root = input.rootCode ? (ix.byCode.get(String(input.rootCode)) ?? null) : ix.root;
    if (input.rootCode && !root) throw new NotFoundException('Area not found.');
    if (!root) return null;
    const maxDepth = input.depth === undefined || input.depth === null ? 8 : Math.max(0, Math.min(8, Math.floor(Number(input.depth)) || 0));
    const build = (a: GeoArea, d: number): AreaView & { children: AreaView[] } => ({
      ...this.viewIn(ix, snap, a),
      children: d >= maxDepth ? [] : this.sortServedFirst(ix.children(a.id).filter((c) => opts.includeInactive || c.active).map((c) => build(c, d + 1))) as never,
    });
    return build(root, 0);
  }

  /** Search by name in either language, either Google spelling, or an alias (accent, hyphen and apostrophe insensitive). */
  async search(input: { q?: unknown; level?: unknown; servedOnly?: unknown; limit?: unknown }, opts: { includeInactive?: boolean } = {}): Promise<AreaView[]> {
    const q = typeof input.q === 'string' ? input.q.trim().slice(0, 100) : '';
    if (!areaKeys(q).length) return [];
    const level = input.level === undefined || input.level === null || input.level === '' ? null : input.level;
    if (level !== null && !isAreaLevel(level)) throw new BadRequestException(`Level must be one of: ${AREA_LEVELS.join(', ')}.`);
    const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit)) || 20));
    const [ix, snap] = await Promise.all([this.index(), this.snapshot()]);
    const found = ix.search(q, level ? { levels: [level] } : {}).filter((a) => opts.includeInactive || a.active);
    const views = found.map((a) => this.viewIn(ix, snap, a)).filter((v) => input.servedOnly !== true || v.served);
    return this.sortServedFirst(views).slice(0, limit);
  }

  // ── resolving ────────────────────────────────────────────────────────────────
  /** The area row for an address (a given `areaId`, else Google components, typed text and the pin). Null when nothing matches. */
  async resolveRow(input: AddressAreaInput): Promise<{ area: GeoArea | null; matchedBy: MatchedBy | null }> {
    const ix = await this.index();
    if (typeof input.areaId === 'string' && input.areaId) {
      const a = ix.get(input.areaId);
      if (!a) throw new NotFoundException('Area not found.');
      return { area: a, matchedBy: null };
    }
    const comps = Array.isArray(input.components) ? (input.components as GoogleComponent[]).slice(0, 40) : undefined;
    const text: TextHints = { commune: input.commune ?? null, city: input.city ?? null, province: input.region ?? null, quartier: input.quartier ?? null };
    const r = resolveArea(ix, { components: comps, text, pin: input.geo ?? null } satisfies ResolveInput);
    return { area: r.area, matchedBy: r.matchedBy };
  }

  /** `geo:resolve`: the area, its chain, whether it is served and by whom. */
  async resolve(input: { components?: unknown; text?: { commune?: string; city?: string; province?: string; quartier?: string } | null; pin?: { lat?: unknown; lng?: unknown } | null }): Promise<ResolveReply> {
    const { area, matchedBy } = await this.resolveRow({ components: input.components, commune: input.text?.commune, city: input.text?.city, region: input.text?.province, quartier: input.text?.quartier, geo: input.pin });
    if (!area) return { area: null, chain: [], served: false, hubId: null, hubName: null, matchedBy: null };
    const chain = await this.chainView(area.id);
    const v = chain[chain.length - 1];
    return { area: v, chain, served: v.served, hubId: v.hubId, hubName: v.hubName, matchedBy };
  }

  /** Province / city / commune / country names of an area, in Google's spelling, for the address text columns. */
  async textColumns(areaId: string | null | undefined, lang: 'fr' | 'en' = 'fr'): Promise<{ commune: string | null; city: string | null; region: string | null; country: string | null; quartier: string | null }> {
    const ix = await this.index();
    const chain = ix.chain(areaId);
    const name = (a: GeoArea | undefined) => (a ? (lang === 'en' ? a.googleNameEn || a.googleName : a.googleName) : null);
    const at = (level: AreaLevel) => chain.find((a) => a.level === level);
    // A district-level area (no commune) has no commune text.
    return { commune: name(at('commune')), city: name(at('city')), region: name(at('province')), country: name(at('country')), quartier: name(at('quartier')) };
  }

  /** The key two areas compare on to decide "same city": the city, else the province, else the area itself. */
  async cityKeyOf(areaId: string | null | undefined): Promise<string | null> {
    if (!areaId) return null;
    const ix = await this.index();
    return (ix.ancestorAt(areaId, 'city') ?? ix.ancestorAt(areaId, 'province'))?.id ?? null;
  }

  // ── admin writes ─────────────────────────────────────────────────────────────
  private async push(area: GeoArea): Promise<AreaView> {
    this.invalidateAreas();
    const view = (await this.view(area.id)) as AreaView;
    this.emitter.broadcast('geo:updated', view);
    return view;
  }

  private cleanAliases(v: unknown): string[] {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) throw new BadRequestException('Aliases must be a list of names.');
    return [...new Set(v.map((a) => str(a, 'Alias', { min: 1, max: 100 })))].slice(0, 30);
  }

  private async assertUniqueName(ix: AreaIndex, parentId: string | null, name: string, exceptId?: string): Promise<void> {
    const key = areaKeys(name)[0];
    const clash = ix.children(parentId).find((c) => c.id !== exceptId && areaKeys(c.name)[0] === key);
    if (clash) throw new BadRequestException('An area with this name already exists here.');
  }

  /** Add an area under a parent (a commune or quartier under a city, a quartier under a commune…). */
  async create(input: Record<string, unknown>): Promise<AreaView> {
    const ix = await this.index();
    const parent = ix.get(typeof input.parentId === 'string' ? input.parentId : null);
    if (!parent) throw new NotFoundException('Area not found.');
    if (!isAreaLevel(input.level)) throw new BadRequestException(`Level must be one of: ${AREA_LEVELS.join(', ')}.`);
    const level = input.level;
    if (!CHILD_LEVELS[parent.level].includes(level)) throw new BadRequestException(`A ${level} cannot be added under a ${parent.level}.`);
    const name = str(input.name, 'Name', { min: 2, max: 150 });
    await this.assertUniqueName(ix, parent.id, name);
    const nameEn = input.nameEn === undefined || input.nameEn === null || input.nameEn === '' ? null : str(input.nameEn, 'English name', { min: 2, max: 150 });
    const googleName = input.googleName ? str(input.googleName, 'Google name', { min: 1, max: 150 }) : name;
    const googleNameEn = input.googleNameEn ? str(input.googleNameEn, 'Google name (English)', { min: 1, max: 150 }) : nameEn || googleName;
    let lat: number | null = null;
    let lng: number | null = null;
    if (input.lat !== undefined && input.lat !== null && input.lat !== '') {
      const p = cleanPoint(input.lat, input.lng);
      if (!p) throw new BadRequestException('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
      lat = p.lat;
      lng = p.lng;
    }
    let code: string;
    if (input.code !== undefined && input.code !== null && input.code !== '') {
      code = str(input.code, 'Code', { min: 2, max: 64 }).toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9-]*$/.test(code)) throw new BadRequestException('Code may only contain letters, digits and hyphens.');
      if (ix.byCode.has(code)) throw new BadRequestException('An area with this code already exists.');
    } else {
      const base = `${parent.code}-${codeFragment(name)}`;
      code = base;
      for (let n = 2; ix.byCode.has(code); n++) code = `${base}${n}`;
    }
    const siblings = ix.children(parent.id);
    const row = await this.areas.save(
      this.areas.create({
        code,
        level,
        name,
        nameEn: nameEn && nameEn !== name ? nameEn : null,
        googleName,
        googleNameEn,
        aliases: this.cleanAliases(input.aliases),
        parentId: parent.id,
        path: `${parent.path}/${code}`,
        depth: LEVEL_DEPTH[level],
        lat,
        lng,
        active: true,
        sortOrder: siblings.reduce((m, s) => Math.max(m, s.sortOrder ?? 0), 0) + 1,
      }),
    );
    return this.push(row);
  }

  async update(input: Record<string, unknown>): Promise<AreaView> {
    const ix = await this.index();
    const current = ix.get(typeof input.id === 'string' ? input.id : null);
    if (!current) throw new NotFoundException('Area not found.');
    const row = await this.areas.findOne({ where: { id: current.id } });
    if (!row) throw new NotFoundException('Area not found.');
    const has = (k: string) => input[k] !== undefined;
    if (has('name')) {
      row.name = str(input.name, 'Name', { min: 2, max: 150 });
      await this.assertUniqueName(ix, row.parentId, row.name, row.id);
    }
    if (has('nameEn')) row.nameEn = input.nameEn === null || input.nameEn === '' ? null : str(input.nameEn, 'English name', { min: 2, max: 150 });
    if (row.nameEn === row.name) row.nameEn = null;
    if (has('googleName')) row.googleName = str(input.googleName, 'Google name', { min: 1, max: 150 });
    if (has('googleNameEn')) row.googleNameEn = str(input.googleNameEn, 'Google name (English)', { min: 1, max: 150 });
    if (has('aliases')) row.aliases = this.cleanAliases(input.aliases);
    if (has('lat') || has('lng')) {
      if ((input.lat === null || input.lat === '') && (input.lng === null || input.lng === '')) {
        row.lat = null;
        row.lng = null;
      } else {
        const p = cleanPoint(input.lat, input.lng);
        if (!p) throw new BadRequestException('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
        row.lat = p.lat;
        row.lng = p.lng;
      }
    }
    if (has('active')) {
      if (typeof input.active !== 'boolean') throw new BadRequestException('Active must be true or false.');
      row.active = input.active;
    }
    if (has('sortOrder')) row.sortOrder = num(input.sortOrder, 'Order', { min: 0, max: 100000, int: true });
    return this.push(await this.areas.save(row));
  }

  // ── numbers for the admin Geography screen ───────────────────────────────────
  /** Customers (with an address), sellers (pickup) and orders in an area and everything below it. */
  async stats(areaId: unknown): Promise<{ areaId: string; customers: number; sellers: number; orders: number }> {
    const ix = await this.index();
    const area = ix.get(typeof areaId === 'string' ? areaId : null);
    if (!area) throw new NotFoundException('Area not found.');
    const ids = ix.subtree(area.id).map((a) => a.id);
    const [customers, sellers, orders] = await Promise.all([
      this.addresses.createQueryBuilder('a').select('COUNT(DISTINCT a.userId)', 'n').where('a.areaId IN (:...ids)', { ids }).getRawOne<{ n: string }>(),
      this.sellers.count({ where: { pickupAreaId: In(ids) } }),
      this.orders.count({ where: { destinationAreaId: In(ids) } }),
    ]);
    return { areaId: area.id, customers: Number(customers?.n ?? 0), sellers, orders };
  }

  // ── names for messages ───────────────────────────────────────────────────────
  /** "We don't deliver to {area} yet." — the area's name (French/official) or what the customer typed. */
  notServedMessage(area: Pick<GeoArea, 'name'> | null, typed?: string | null): string {
    return `We don't deliver to ${area?.name ?? (typed && typed.trim() ? typed.trim() : 'this area')} yet.`;
  }

  /** Cities with any coverage: covered themselves, or with a covered district / commune inside. For "we deliver to…" lists. */
  async servedCities(): Promise<AreaView[]> {
    const [ix, snap] = await Promise.all([this.index(), this.snapshot()]);
    return [...ix.byId.values()]
      .filter((a) => a.level === 'city' && a.active)
      .map((a) => this.viewIn(ix, snap, a))
      .filter((v) => v.served || v.partiallyServed)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  /**
   * The refusal for an address nobody serves: the English message on the wire plus structured fields, so a client shows it in
   * either language and lists the cities we do serve ("We don't deliver to Lubumbashi yet. We deliver to: Kinshasa").
   */
  async notServed(area: Pick<GeoArea, 'id' | 'name' | 'nameEn'> | null, typed?: string | null): Promise<NotServedException> {
    const cities = await this.servedCities().catch(() => [] as AreaView[]);
    return new NotServedException(this.notServedMessage(area, typed), {
      areaId: area?.id ?? null,
      areaName: area?.name ?? (typed && typed.trim() ? typed.trim() : null),
      areaNameEn: area ? (area.nameEn ?? area.name) : typed && typed.trim() ? typed.trim() : null,
      servedCities: cities.map((c) => ({ id: c.id, name: c.name, nameEn: c.nameEn ?? c.name })),
    });
  }
}

/** What a client needs to render "We don't deliver to {area} yet." itself. */
export interface NotServedDetails {
  areaId: string | null;
  areaName: string | null;
  areaNameEn: string | null;
  servedCities: { id: string; name: string; nameEn: string }[];
}

export class NotServedException extends BadRequestException {
  constructor(
    message: string,
    readonly details: NotServedDetails,
  ) {
    super(message);
  }
}

/** The structured fields to spread into an `ok: false` ack when the error is a not-served refusal (else nothing). */
export function notServedFields(e: unknown): Partial<NotServedDetails> & { code?: 'not_served' } {
  return e instanceof NotServedException ? { code: 'not_served', ...e.details } : {};
}
