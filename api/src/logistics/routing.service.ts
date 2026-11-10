import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GeoArea, Hub, Seller, User } from '../database/entities';
import { SettingsService } from '../content/settings.service';
import { GeoPoint, haversineKm, isGeoPoint, normPlace } from '../common/geo/geo';
import { ExpressFeeConfig, FeeBreakdown, FeeConfig, FEE_SETTING_KEYS, EXPRESS_SETTING_KEYS, deliveryFee, expressFee, expressFeeConfigFrom, feeConfigFrom } from './fee';
import { HubOpsSettingsService } from './hub-ops-settings.service';
import { nextWorkingMoment } from './hub-ops-rules';
import { AreaChainView, AreaView, Covering, GeoService } from '../geo/geo.service';
import { parseShipping } from '../geo/address-input';
import { areaKeys } from '../geo/area-model';
import { LanesService } from './lanes.service';
import { PlannedHop, hubsOnRoute } from './lane-route';
import { localDaysOf } from '../common/delivery/estimate';

/** A warehouse with its count of active riders (the router only sends orders where somebody can deliver). */
export type RoutedHub = Hub & { activeRiders: number };

/**
 * Why the warehouse that handles an order is not the one that covers the area:
 * `city` = the covering warehouse has no active rider, a staffed one in the same city took over;
 * `nearest` = none in the city, the nearest staffed one in the same province took over;
 * `no_riders` = nobody nearby has a rider: the order stays on the covering warehouse and admins are told.
 */
export type RouteFallback = null | 'city' | 'nearest' | 'no_riders';

/** One seller's collection point. */
export interface RouteOrigin {
  sellerId: string | null;
  hubId: string;
  hubName: string;
  areaId: string | null;
  areaName: string | null;
  areaNameEn: string | null;
  /** Set when the covering warehouse had no riders. */
  fallback: RouteFallback;
  coveringHubId: string | null;
  coveringHubName: string | null;
  /**
   * The transfer hops from this origin to the destination (empty when they are the same warehouse). `costUsd` is the
   * effective price of the hop (the lane's own price, else the default transfer fee); `laneCost` says whether the lane set it.
   */
  hops: { fromHubId: string; fromHubName: string; toHubId: string; toHubName: string; transitHours: number; costUsd: number; laneCost: boolean }[];
  transitHours: number;
  /** This seller's parcels travel between two cities. */
  interCity: boolean;
  /** Days this seller's parcels add to the estimate: the lane transit rounded up to days, else the inter-city allowance when it crosses cities, else 0. */
  extraDays: number;
}

export interface Route {
  feeUsd: number;
  /** base + distance part (capped), or the flat area fee; without the transfer fee */
  deliveryUsd: number;
  transferUsd: number;
  /** The per-hop transfer fee used when a lane has no price of its own (`deliveryTransferUsd`). */
  defaultTransferUsd: number;
  distanceKm: number;
  destinationHubId: string;
  destinationHubName: string;
  destinationHub: { id: string; name: string; city: string };
  /** The delivery area (most specific) and the chain above it. */
  served: true;
  destinationAreaId: string;
  destinationArea: AreaView;
  destinationAreaChain: AreaChainView;
  /** One origin warehouse per seller, in the order the sellers first appear in the lines. */
  originHubIds: string[];
  /** seller id -> origin warehouse id (null key = lines with no seller) */
  originBySeller: Record<string, string>;
  origins: RouteOrigin[];
  /** Is any parcel coming from another warehouse than the destination? */
  transfer: boolean;
  /** Did the address carry a map pin? */
  pinned: boolean;
  /** The destination's fallback (see {@link RouteFallback}); origins carry their own. */
  fallback: RouteFallback;
  /** The warehouse that covers the delivery area when another one handles it (fallback), else null. */
  coveringHubId: string | null;
  coveringHubName: string | null;
  /** The planned chain of warehouses per seller key: `[origin, …, destination]` (one entry when nothing travels). */
  routeBySeller: Record<string, string[]>;
  /** The longest transit (hours) over the lanes any parcel uses. */
  transitHours: number;
  /** Days added to the delivery estimate: the lanes' transit (rounded up to days), or the inter-city allowance when no lane says. */
  extraDays: number;
  /** Warehouse pairs that lanes should connect but do not (the parcel goes direct and admins are told). */
  unconnected: { fromHubId: string; toHubId: string; fromHubName: string; toHubName: string }[];
  /** The flat fee of the area's coverage row, when one applied. */
  feeOverrideUsd: number | null;
  /** Parcels travel between two cities: `interCityDays` are added to the delivery estimate. */
  interCity: boolean;
  interCityDays: number;
  /** The platform's local transit days (`localDeliveryDays`, default 1): hub -> customer. */
  localDeliveryDays: number;
  /**
   * `express` when a rider goes straight from the seller to the customer (same commune, see {@link RoutingService.expressFor}): the fee is the express
   * fee (seller pin -> customer pin, `distanceKm` is that distance), there is no transfer, no hops, no extra days and no flat area fee.
   */
  deliveryMode: 'standard' | 'express';
  /** Platform days of an express route (`expressDeliveryDays`); 0 on a standard route. */
  expressDays: number;
  /** An express order counts its days from this moment: the managing warehouse's next working moment. Null on a standard route. */
  expressStart: Date | null;
}

export interface RouteInput {
  /** The order / quote address as a JSON string (area, text fields and pin are read from it). */
  shippingAddress?: string | null;
  /** Or already-parsed pieces. */
  areaId?: string | null;
  geo?: GeoPoint | null;
  city?: string | null;
  commune?: string | null;
  components?: unknown[] | null;
  /** The seller of each line (a store id, a seller user id, or null for lines with no seller). */
  sellerIds: (string | null | undefined)[];
}

export const INTER_CITY_SETTINGS = ['allowInterCityDelivery', 'interCityTransferDays'] as const;
export const DEFAULT_INTER_CITY_DAYS = 3;
export const DEFAULT_SPLIT_AFTER_HOURS = 24;

const NO_SELLER = '_none';

/**
 * Area routing and the delivery fee. The warehouse of an address is the one covering its most specific covered area
 * (walking up commune -> district -> city -> province); distance is only used to pick a stand-in when that warehouse has
 * no riders, and for the fee. Pure data in, a {@link Route} out: it never writes (the order service stores the result,
 * the logistics service turns it into tasks).
 */
@Injectable()
export class RoutingService {
  constructor(
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly settings: SettingsService,
    private readonly geo: GeoService,
    private readonly lanes: LanesService,
    @Optional() private readonly hubOps?: HubOpsSettingsService,
  ) {}

  /** Every warehouse with the number of active riders it has. */
  async hubsWithRiders(): Promise<RoutedHub[]> {
    const [hubs, counts] = await Promise.all([
      this.hubs.find({ order: { name: 'ASC' } }),
      this.users
        .createQueryBuilder('u')
        .select('u.hubId', 'hubId')
        .addSelect('COUNT(*)', 'n')
        .where("u.role = 'rider' AND u.active = 1 AND u.hubId IS NOT NULL")
        .groupBy('u.hubId')
        .getRawMany<{ hubId: string; n: string }>(),
    ]);
    const byHub = new Map(counts.map((c) => [c.hubId, Number(c.n)]));
    return hubs.map((h) => Object.assign(h, { activeRiders: byHub.get(h.id) ?? 0 }));
  }

  async feeConfig(): Promise<FeeConfig> {
    const all = await this.settings.all();
    return feeConfigFrom(Object.fromEntries(FEE_SETTING_KEYS.map((k) => [k, all[k]])));
  }

  /** The express fee numbers (`expressBaseUsd` / `expressPerKmUsd` / `expressMaxUsd`). */
  async expressFeeConfig(): Promise<ExpressFeeConfig> {
    const all = await this.settings.all();
    return expressFeeConfigFrom(Object.fromEntries(EXPRESS_SETTING_KEYS.map((k) => [k, all[k]])));
  }

  /** The inter-city switch and the days it adds. */
  async interCityConfig(): Promise<{ allowed: boolean; days: number; localDays: number }> {
    const all = await this.settings.all();
    const days = Number(all.interCityTransferDays);
    return { allowed: all.allowInterCityDelivery !== 'false', days: Number.isFinite(days) && days >= 0 ? days : DEFAULT_INTER_CITY_DAYS, localDays: localDaysOf(all.localDeliveryDays) };
  }

  /** Hours a multi-seller order waits for its last parcel before the arrived ones are delivered (`splitDeliveryAfterHours`, default 24; 0 = never split). */
  async splitAfterHours(): Promise<number> {
    const n = Number((await this.settings.all()).splitDeliveryAfterHours);
    return Number.isFinite(n) && n >= 0 && n <= 720 ? Math.round(n) : DEFAULT_SPLIT_AFTER_HOURS;
  }

  /** The store row behind a seller id (a store id, or the owner's user id on demo data). */
  private async sellerRows(ids: string[]): Promise<Map<string, Seller>> {
    const out = new Map<string, Seller>();
    if (!ids.length) return out;
    const rows = await this.sellers.find({ where: [{ id: In(ids) }, { userId: In(ids) }] });
    for (const id of ids) {
      const row = rows.find((r) => r.id === id) ?? rows.find((r) => r.userId === id);
      if (row) out.set(id, row);
    }
    return out;
  }

  // ── areas ────────────────────────────────────────────────────────────────────
  /** The delivery area an address is in, or null. Falls back to the area of a warehouse in the same city text (old data). */
  private async areaOfAddress(input: RouteInput, hubs: RoutedHub[]): Promise<{ area: GeoArea | null; typed: string | null; point: GeoPoint | null }> {
    const f = parseShipping(input.shippingAddress);
    const point = input.geo && isGeoPoint(input.geo) ? input.geo : f.point;
    const city = input.city ?? f.city;
    const commune = input.commune ?? f.commune;
    const { area } = await this.geo.resolveRow({
      areaId: input.areaId ?? f.areaId,
      components: input.components ?? f.components ?? undefined,
      geo: point,
      commune,
      city,
      region: f.region,
      quartier: f.quartier,
    });
    if (area) return { area, typed: commune ?? city, point };
    // Last resort for data from before areas existed: a warehouse in the city the address names.
    const want = normPlace(city);
    const hub = want ? hubs.find((h) => h.active && h.areaId && normPlace(h.city) === want) : null;
    return { area: hub?.areaId ? (await this.geo.index()).get(hub.areaId) : null, typed: commune ?? city, point };
  }

  /** Is a warehouse located inside (or at) an area? Uses its location area, else its city text. */
  private hubInside(ix: Awaited<ReturnType<GeoService['index']>>, h: RoutedHub, ancestor: GeoArea | null): boolean {
    if (!ancestor) return false;
    if (h.areaId) return h.areaId === ancestor.id || ix.isUnder(h.areaId, ancestor.id);
    const keys = areaKeys(h.city);
    return keys.length > 0 && [ancestor.name, ancestor.nameEn, ancestor.googleName, ancestor.googleNameEn].some((n) => areaKeys(n)[0] === keys[0]);
  }

  /**
   * The warehouse that handles an area: the covering one, or — when it has no active rider — the nearest staffed
   * warehouse in the same city, then the same province (`fallback` says which). Null when the area is not served.
   */
  async hubFor(
    areaId: string,
    point: GeoPoint | null,
    hubs: RoutedHub[],
  ): Promise<{ hub: RoutedHub; coveringHub: RoutedHub; covering: Covering; fallback: RouteFallback } | null> {
    const covering = await this.geo.covering(areaId);
    if (!covering) return null;
    const coveringHub = hubs.find((h) => h.id === covering.hubId && h.active);
    if (!coveringHub) return null;
    if (coveringHub.activeRiders > 0) return { hub: coveringHub, coveringHub, covering, fallback: null };

    const ix = await this.geo.index();
    const area = ix.get(areaId) as GeoArea;
    const ref: GeoPoint | null = point ?? (isGeoPoint({ lat: area.lat, lng: area.lng }) ? { lat: area.lat as number, lng: area.lng as number } : null);
    const staffed = hubs.filter((h) => h.active && h.activeRiders > 0 && h.id !== coveringHub.id);
    const nearest = (pool: RoutedHub[]): RoutedHub | null => {
      let best: RoutedHub | null = null;
      let bestKm = Infinity;
      for (const h of pool) {
        const km = ref && isGeoPoint({ lat: h.lat, lng: h.lng }) ? haversineKm(ref, { lat: h.lat as number, lng: h.lng as number }) : 1e9;
        if (km < bestKm - 1e-9 || (Math.abs(km - bestKm) <= 1e-9 && best && h.id < best.id)) {
          best = h;
          bestKm = km;
        }
      }
      return best;
    };
    const city = ix.ancestorAt(areaId, 'city');
    const province = ix.ancestorAt(areaId, 'province');
    const sameCity = nearest(staffed.filter((h) => this.hubInside(ix, h, city)));
    if (sameCity) return { hub: sameCity, coveringHub, covering, fallback: 'city' };
    const sameProvince = nearest(staffed.filter((h) => this.hubInside(ix, h, province)));
    if (sameProvince) return { hub: sameProvince, coveringHub, covering, fallback: 'nearest' };
    return { hub: coveringHub, coveringHub, covering, fallback: 'no_riders' };
  }

  /** The area a seller picks up from: the stored one, else resolved from the pin (stores from before areas existed). */
  private async sellerArea(seller: Seller): Promise<{ area: GeoArea | null; point: GeoPoint | null }> {
    const point = isGeoPoint({ lat: seller.pickupLat, lng: seller.pickupLng }) ? { lat: seller.pickupLat as number, lng: seller.pickupLng as number } : null;
    if (seller.pickupAreaId) return { area: (await this.geo.index()).get(seller.pickupAreaId), point };
    if (point) return { area: (await this.geo.resolveRow({ geo: point })).area, point };
    return { area: null, point };
  }

  /**
   * The origin warehouse of one seller. An order's recorded origin wins while that warehouse still has riders (nothing is
   * rerouted mid-journey); else the warehouse handling the seller's pickup area; a store with no known area (an older
   * store) or an area nobody serves sends its parcels straight to the destination (no transfer leg).
   */
  async originFor(seller: Seller | null, destination: RoutedHub, hubs: RoutedHub[], recordedHubId?: string | null): Promise<RoutedHub> {
    if (recordedHubId) {
      const recorded = hubs.find((h) => h.id === recordedHubId && h.active && h.activeRiders > 0);
      if (recorded) return recorded;
    }
    if (!seller) return destination;
    const { area, point } = await this.sellerArea(seller);
    if (!area) return destination;
    return (await this.hubFor(area.id, point, hubs))?.hub ?? destination;
  }

  // ── express ──────────────────────────────────────────────────────────────────
  /**
   * Does this order go EXPRESS (a rider takes the parcel from the seller straight to the customer, skipping the warehouse)? It is
   * automatic, the customer is not asked. Every one of these must hold, else it is a standard order:
   *  - the platform switch `expressDeliveryEnabled` is on;
   *  - exactly one seller, who has `expressDelivery` on;
   *  - the seller has a pickup area AND a pin, and the customer's address has a pin (without both there is no distance);
   *  - both are in the same commune (the commune above the pickup area and above the delivery area);
   *  - one warehouse manages both ends (origin = destination) and neither end is a stand-in for a warehouse with no riders;
   *  - the distance seller pin -> customer pin is within `expressMaxKm` (0 = no limit).
   * Returns the fee and the days, or null. Pure data in, never writes.
   */
  async expressFor(p: {
    keys: string[];
    sellers: Map<string, Seller>;
    origins: Pick<RouteOrigin, 'hubId' | 'fallback'>[];
    destination: RoutedHub;
    destinationFallback: RouteFallback;
    deliveryAreaId: string;
    customerPoint: GeoPoint | null;
  }): Promise<{ fee: FeeBreakdown; days: number; start: Date } | null> {
    const all = await this.settings.all();
    if (all.expressDeliveryEnabled !== 'true') return null;
    if (p.keys.length !== 1 || p.keys[0] === NO_SELLER) return null;
    const seller = p.sellers.get(p.keys[0]);
    if (!seller?.expressDelivery || !seller.pickupAreaId) return null;
    const sellerPin = isGeoPoint({ lat: seller.pickupLat, lng: seller.pickupLng }) ? { lat: seller.pickupLat as number, lng: seller.pickupLng as number } : null;
    if (!sellerPin || !p.customerPoint) return null;
    const ix = await this.geo.index();
    const sellerCommune = ix.ancestorAt(seller.pickupAreaId, 'commune');
    const customerCommune = ix.ancestorAt(p.deliveryAreaId, 'commune');
    if (!sellerCommune || !customerCommune || sellerCommune.id !== customerCommune.id) return null;
    const origin = p.origins[0];
    if (!origin || origin.fallback || p.destinationFallback || origin.hubId !== p.destination.id) return null;
    const km = haversineKm(sellerPin, p.customerPoint);
    const maxKm = Number(all.expressMaxKm);
    if (Number.isFinite(maxKm) && maxKm > 0 && km > maxKm) return null;
    const days = Number(all.expressDeliveryDays);
    const fee = expressFee(await this.expressFeeConfig(), km);
    // Days are counted from the moment a rider of the managing warehouse can start (a 21:00 order with 0 days is not "today").
    const start = this.hubOps ? nextWorkingMoment(await this.hubOps.ops(p.destination.id), new Date()) : new Date();
    return { fee, days: Number.isFinite(days) && days >= 0 ? Math.min(30, Math.round(days)) : 0, start };
  }

  // ── the route ────────────────────────────────────────────────────────────────
  /** The full route and fee for an address and the sellers of the lines. Throws when the address (or a seller) is not served. */
  async route(input: RouteInput): Promise<Route> {
    const hubs = await this.hubsWithRiders();
    if (!hubs.some((h) => h.active)) throw new BadRequestException('Delivery is not available right now: no warehouse is open.');

    const { area, typed, point } = await this.areaOfAddress(input, hubs);
    if (!area) throw await this.geo.notServed(null, typed);
    const dest = await this.hubFor(area.id, point, hubs);
    if (!dest) throw await this.geo.notServed(area);
    const destination = dest.hub;

    const keys = [...new Set(input.sellerIds.map((s) => s ?? NO_SELLER))];
    const rows = await this.sellerRows(keys.filter((k) => k !== NO_SELLER));
    const originBySeller: Record<string, string> = {};
    const origins: RouteOrigin[] = [];
    const destCity = await this.geo.cityKeyOf(area.id);
    let interCity = false;
    const sellerInterCity = new Set<string>();
    for (const k of keys) {
      const seller = k === NO_SELLER ? null : (rows.get(k) ?? null);
      let hub: RoutedHub = destination;
      let sellerAreaRow: GeoArea | null = null;
      let fallback: RouteFallback = null;
      let covering: RoutedHub | null = null;
      if (seller) {
        const sa = await this.sellerArea(seller);
        sellerAreaRow = sa.area;
        if (sa.area) {
          const found = await this.hubFor(sa.area.id, sa.point, hubs);
          if (!found) throw new BadRequestException('One seller in your cart cannot ship from their area yet.');
          hub = found.hub;
          fallback = found.fallback;
          covering = found.fallback ? found.coveringHub : null;
          const originCity = await this.geo.cityKeyOf(sa.area.id);
          if (originCity && destCity && originCity !== destCity) {
            interCity = true;
            sellerInterCity.add(k);
          }
        }
      }
      originBySeller[k] = hub.id;
      origins.push({
        sellerId: k === NO_SELLER ? null : k,
        hubId: hub.id,
        hubName: hub.name,
        areaId: sellerAreaRow?.id ?? null,
        areaName: sellerAreaRow?.name ?? null,
        areaNameEn: sellerAreaRow?.nameEn ?? sellerAreaRow?.name ?? null,
        fallback,
        coveringHubId: covering?.id ?? null,
        coveringHubName: covering?.name ?? null,
        hops: [],
        transitHours: 0,
        interCity: sellerInterCity.has(k),
        extraDays: 0,
      });
    }
    const originHubIds = origins.map((o) => o.hubId);

    const ic = await this.interCityConfig();
    if (interCity && !ic.allowed) throw new BadRequestException('Delivery between cities is not available right now.');

    const cfg = await this.feeConfig();
    // The chain of warehouses each parcel travels: the shortest over active lanes, direct when there are none.
    const nameOf = new Map(hubs.map((h) => [h.id, h.name]));
    const routeBySeller: Record<string, string[]> = {};
    const distinct = new Map<string, PlannedHop>();
    const unconnected: Route['unconnected'] = [];
    let transitHours = 0;
    for (const [i, k] of keys.entries()) {
      const o = origins[i];
      const plan = await this.lanes.route(o.hubId, destination.id);
      routeBySeller[k] = hubsOnRoute(plan.hops, o.hubId);
      o.hops = plan.hops.map((h) => ({ fromHubId: h.fromHubId, fromHubName: nameOf.get(h.fromHubId) ?? h.fromHubId, toHubId: h.toHubId, toHubName: nameOf.get(h.toHubId) ?? h.toHubId, transitHours: h.transitHours, costUsd: h.costUsd ?? cfg.transferUsd, laneCost: typeof h.costUsd === 'number' }));
      o.transitHours = plan.totalHours;
      const transit = Math.ceil(plan.totalHours / 24);
      o.extraDays = transit > 0 ? transit : o.interCity ? ic.days : 0;
      transitHours = Math.max(transitHours, plan.totalHours);
      if (!plan.connected && !unconnected.some((u) => u.fromHubId === o.hubId && u.toHubId === destination.id)) {
        unconnected.push({ fromHubId: o.hubId, toHubId: destination.id, fromHubName: nameOf.get(o.hubId) ?? o.hubId, toHubName: destination.name });
      }
      for (const h of plan.hops) distinct.set(`${h.fromHubId}>${h.toHubId}`, h);
    }

    const transfer = originHubIds.some((id) => id !== destination.id);
    const hubPoint = isGeoPoint({ lat: destination.lat, lng: destination.lng }) ? { lat: destination.lat as number, lng: destination.lng as number } : null;
    const km = point && hubPoint ? haversineKm(hubPoint, point) : 0;
    // A transfer fee per hop (a lane may set its own price); parcels sharing a hop pay it once.
    const fee = deliveryFee(cfg, km, [...distinct.values()].map((h) => h.costUsd ?? cfg.transferUsd), dest.covering.feeOverrideUsd);
    const transitDays = Math.ceil(transitHours / 24);
    const extraDays = interCity ? (transitDays > 0 ? transitDays : ic.days) : transitDays;
    const [destinationArea, destinationAreaChain] = await Promise.all([this.geo.view(area.id) as Promise<AreaView>, this.geo.chainView(area.id)]);
    // An order that qualifies goes express: the express fee replaces the whole standard fee (no transfer, no flat area fee).
    const express = await this.expressFor({ keys, sellers: rows, origins, destination, destinationFallback: dest.fallback, deliveryAreaId: area.id, customerPoint: point });
    const standard = !express;
    return {
      deliveryMode: express ? 'express' : 'standard',
      expressDays: express?.days ?? 0,
      expressStart: express?.start ?? null,
      feeUsd: express ? express.fee.feeUsd : fee.feeUsd,
      deliveryUsd: express ? express.fee.deliveryUsd : fee.deliveryUsd,
      transferUsd: express ? 0 : fee.transferUsd,
      defaultTransferUsd: cfg.transferUsd,
      distanceKm: express ? express.fee.distanceKm : fee.distanceKm,
      destinationHubId: destination.id,
      destinationHubName: destination.name,
      destinationHub: { id: destination.id, name: destination.name, city: destination.city },
      served: true,
      destinationAreaId: area.id,
      destinationArea,
      destinationAreaChain,
      originHubIds,
      originBySeller,
      origins,
      routeBySeller,
      transitHours: standard ? transitHours : 0,
      extraDays: standard ? extraDays : 0,
      unconnected,
      transfer: standard ? transfer : false,
      pinned: !!point,
      fallback: dest.fallback,
      coveringHubId: dest.fallback ? dest.coveringHub.id : null,
      coveringHubName: dest.fallback ? dest.coveringHub.name : null,
      feeOverrideUsd: standard ? (dest.covering.feeOverrideUsd ?? null) : null,
      interCity: standard ? interCity : false,
      interCityDays: standard && interCity ? ic.days : 0,
      localDeliveryDays: ic.localDays,
    };
  }
}
