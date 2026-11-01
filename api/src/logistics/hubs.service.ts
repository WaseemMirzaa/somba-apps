import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Hub, User } from '../database/entities';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { num, str } from '../common/validate';
import { cleanPoint } from '../common/geo/geo';
import { CoverageService } from '../geo/coverage.service';
import { AreaView, GeoService } from '../geo/geo.service';
import { RoutingService } from './routing.service';
import { WAREHOUSE_TIERS, WarehouseTier, tierAllows } from './tiers';

const OPS_ROOMS = [...ADMIN_ROLES, 'warehouse_staff'];

/**
 * A warehouse as the directory shows it: `riders` / `staff` are the active head counts (`activeRiders` / `staffCount`
 * kept for older clients), `area` is where it stands, `coverage` the areas it covers.
 */
export type HubView = Hub & {
  activeRiders: number;
  staffCount: number;
  riders: number;
  staff: number;
  placed: boolean;
  area: AreaView | null;
  coverage: (AreaView & { feeOverrideUsd: number | null })[];
};

/**
 * The warehouse directory: create / edit (with the map position) / switch on and off. Routing only sends orders to
 * warehouses that are active, placed on the map and have at least one active rider.
 */
@Injectable()
export class HubsService {
  constructor(
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly routing: RoutingService,
    private readonly emitter: RealtimeEmitter,
    private readonly geo: GeoService,
    private readonly coverage: CoverageService,
  ) {}

  /** Every hub (inactive ones included, flagged `active:false`); `activeOnly` hides the inactive ones. */
  async list(opts: { activeOnly?: boolean } = {}): Promise<HubView[]> {
    const all = await this.routing.hubsWithRiders();
    const staff = await this.users
      .createQueryBuilder('u')
      .select('u.hubId', 'hubId')
      .addSelect('COUNT(*)', 'n')
      .where("u.role = 'warehouse_staff' AND u.active = 1 AND u.hubId IS NOT NULL")
      .groupBy('u.hubId')
      .getRawMany<{ hubId: string; n: string }>();
    const staffBy = new Map(staff.map((s) => [s.hubId, Number(s.n)]));
    const [covered, areas] = await Promise.all([this.coverage.allByHub(), this.geo.views(all.map((h) => h.areaId).filter((x): x is string => !!x))]);
    const areaBy = new Map(areas.map((a) => [a.id, a]));
    return all
      .filter((h) => !opts.activeOnly || h.active)
      .map((h) =>
        Object.assign(h, {
          staffCount: staffBy.get(h.id) ?? 0,
          riders: h.activeRiders,
          staff: staffBy.get(h.id) ?? 0,
          placed: cleanPoint(h.lat, h.lng) !== null,
          area: h.areaId ? (areaBy.get(h.areaId) ?? null) : null,
          coverage: covered.get(h.id) ?? [],
        }),
      );
  }

  async get(id: string): Promise<HubView | null> {
    return (await this.list()).find((h) => h.id === id) ?? null;
  }

  /**
   * Create (no `id`) or update (`id`) a hub. Only the listed fields are accepted. The map position is `lat` + `lng`
   * together; `requirePosition` (used by `hubs:create`) makes them mandatory, and so does `requireArea` for `areaId`
   * (where the warehouse is). Only admins pass `allowArea`; a manager cannot move their warehouse to another area.
   */
  async save(data: Record<string, unknown>, opts: { requirePosition?: boolean; requireArea?: boolean; allowArea?: boolean } = {}): Promise<Hub> {
    const id = data?.id === undefined || data.id === null || data.id === '' ? null : str(data.id, 'Hub', { max: 64 });
    const existing = id ? await this.hubs.findOne({ where: { id } }) : null;
    if (id && !existing) throw new Error('Hub not found.');
    const hub = existing ?? this.hubs.create({ active: true, country: null, address: null, lat: null, lng: null, areaId: null });
    const has = (k: string) => data[k] !== undefined;
    const wasActive = existing?.active;
    const wasName = existing?.name;
    const wasArea = existing?.areaId ?? null;

    // Where the warehouse is (its location area). A legacy call with only a city name is matched to that city.
    const wantsArea = opts.allowArea !== false && has('areaId') && data.areaId !== null && data.areaId !== '';
    let locationArea: Awaited<ReturnType<GeoService['get']>> | null = null;
    if (wantsArea) {
      locationArea = await this.geo.get(data.areaId);
      hub.areaId = locationArea.id;
    } else if (!existing && opts.requireArea) {
      throw new Error('Choose where this warehouse is.');
    } else if (!hub.areaId && typeof data.city === 'string' && data.city.trim()) {
      locationArea = (await this.geo.resolveRow({ city: data.city })).area;
      hub.areaId = locationArea?.id ?? null;
    }
    if (!existing || has('name')) hub.name = str(data.name, 'Hub name', { min: 2, max: 100 });
    const cityGiven = has('city') && String(data.city ?? '').trim() !== '';
    if (cityGiven) hub.city = str(data.city, 'City', { min: 2, max: 100 });
    else if (locationArea && (!existing || wantsArea)) {
      const ix = await this.geo.index();
      hub.city = (ix.ancestorAt(locationArea.id, 'city') ?? locationArea).name;
    } else if (!existing) hub.city = str(data.city, 'City', { min: 2, max: 100 });
    if (locationArea && !hub.country && !has('country')) hub.country = (await this.geo.index()).root?.nameEn ?? null;
    if (has('country')) hub.country = data.country === null || data.country === '' ? null : str(data.country, 'Country', { max: 100 });
    if (has('address')) hub.address = data.address === null || data.address === '' ? null : str(data.address, 'Address', { min: 3, max: 200 });
    if (!existing || has('capacity')) hub.capacity = num(data.capacity ?? 500, 'Capacity', { min: 1, max: 1_000_000, int: true });
    if (has('lat') || has('lng')) {
      const blank = (v: unknown) => v === null || v === '' || v === undefined;
      if (blank(data.lat) && blank(data.lng)) {
        if (opts.requirePosition) throw new Error('Place the warehouse on the map: latitude and longitude are required.');
        hub.lat = null;
        hub.lng = null;
      } else {
        const p = cleanPoint(data.lat, data.lng);
        if (!p) throw new Error('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).');
        hub.lat = p.lat;
        hub.lng = p.lng;
      }
    } else if (!existing && opts.requirePosition) {
      throw new Error('Place the warehouse on the map: latitude and longitude are required.');
    }
    // Hub names are how incidents and the directory refer to a hub, so they must stay unique.
    const clash = (await this.hubs.find({ select: { id: true, name: true } })).find((h) => h.name.trim().toLowerCase() === hub.name.toLowerCase() && h.id !== hub.id);
    if (clash) throw new Error('A hub with this name already exists.');
    const saved = await this.hubs.save(hub);
    // A new, renamed or relocated warehouse changes the names clients show and the stand-ins routing may pick: refresh.
    if (!existing || saved.name !== wasName || (saved.areaId ?? null) !== wasArea || saved.active !== wasActive) {
      await this.coverage.changed([saved.id], await this.coverage.areaIdsOf(saved.id)).catch(() => undefined);
    } else this.geo.invalidateCoverage();
    this.emitter.toRoles(OPS_ROOMS, 'hub:updated', saved);
    return saved;
  }

  /** Switch a hub on or off. An inactive hub receives no new orders or transfers. */
  async setActive(id: string, active: boolean): Promise<Hub> {
    const hub = await this.hubs.findOne({ where: { id: str(id, 'Hub', { max: 64 }) } });
    if (!hub) throw new Error('Hub not found.');
    if (hub.active !== active) {
      if (!active && (await this.hubs.count({ where: { active: true, id: Not(hub.id) } })) === 0) {
        throw new Error('You cannot deactivate the last active hub.');
      }
      hub.active = active;
      await this.hubs.save(hub);
      // Its areas become unserved (or served again) unless a wider area is covered by another warehouse.
      await this.coverage.changed([hub.id], await this.coverage.areaIdsOf(hub.id)).catch(() => undefined);
    }
    this.emitter.toRoles(OPS_ROOMS, 'hub:updated', hub);
    return hub;
  }

  /** The people of a warehouse: its staff (with tier) and its riders. */
  async people(hubId: string) {
    const rows = await this.users.find({ where: [{ hubId, role: 'warehouse_staff' }, { hubId, role: 'rider' }], order: { name: 'ASC' } });
    return rows.map((u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, active: u.active, hubId: u.hubId ?? null, warehouseTier: u.role === 'warehouse_staff' ? (u.warehouseTier ?? 'operator') : null }));
  }

  /**
   * A manager sets the tier of a colleague at THEIR warehouse (admins: anyone). Only an admin can make a manager, and
   * nobody can change their own tier.
   */
  async setTier(actor: { id: string; role: string; hubId?: string | null; tier?: string | null }, userId: string, tier: unknown): Promise<{ id: string; warehouseTier: WarehouseTier }> {
    if (!tierAllows(actor.role, actor.tier, 'manage')) throw new Error('Only managers can change staff tiers.');
    if (typeof tier !== 'string' || !(WAREHOUSE_TIERS as readonly string[]).includes(tier)) throw new Error(`Tier must be one of: ${WAREHOUSE_TIERS.join(', ')}.`);
    const target = await this.users.findOne({ where: { id: userId } });
    if (!target || target.role !== 'warehouse_staff') throw new Error('Only warehouse staff have a tier.');
    const isAdmin = actor.role.startsWith('admin');
    if (!isAdmin) {
      if (target.id === actor.id) throw new Error('You cannot change your own tier.');
      if (!actor.hubId || target.hubId !== actor.hubId) throw new Error('This person works at another warehouse.');
      if (tier === 'manager') throw new Error('Only an administrator can make someone a manager.');
    }
    await this.users.update({ id: target.id }, { warehouseTier: tier as WarehouseTier });
    this.emitter.toRoles([...ADMIN_ROLES, 'warehouse_staff'], 'roles:updated', { id: target.id, role: target.role, hubId: target.hubId ?? null, warehouseTier: tier });
    return { id: target.id, warehouseTier: tier as WarehouseTier };
  }
}
