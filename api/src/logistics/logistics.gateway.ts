import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import type { Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { User } from '../database/entities';
import { AddressesService } from '../addresses/addresses.service';
import { ProductsService } from '../products/products.service';
import { pageOf } from '../common/paging';
import { str } from '../common/validate';
import { cleanPoint } from '../common/geo/geo';
import { notServedFields } from '../geo/geo.service';
import { HubsService } from './hubs.service';
import { Actor, LogisticsService } from './logistics.service';
import { ParcelsService } from './parcels.service';
import { RoutingService } from './routing.service';
import { estimateOrder } from './order-estimate';
import type { EstimateLine } from './order-estimate';
import { handlingDaysOf } from '../common/delivery/estimate';
import { MAX_HANDLING_DAYS } from '../sellers/storefront';
import { DESK_ADMINS_ONLY, isDeskAdmin, tierAllows } from './tiers';

type AuthedSocket = Socket & { data: { user?: { id: string; role: string; name: string } } };

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

const HUB_ADMINS = ['admin', 'admin_operations'];

/**
 * The warehouse desk, the delivery quote and the hub directory. Lives on the same Socket.IO server as
 * RealtimeGateway (which authenticates the socket and sets `client.data.user`). Staff are limited to THEIR warehouse
 * and to what their tier allows; admins see every warehouse.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class LogisticsGateway {
  constructor(
    private readonly logistics: LogisticsService,
    private readonly routing: RoutingService,
    private readonly hubsSvc: HubsService,
    private readonly products: ProductsService,
    private readonly addresses: AddressesService,
    private readonly parcels: ParcelsService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private signedIn(client: AuthedSocket) {
    const u = client.data?.user;
    if (!u || u.role === 'guest') throw new Error('Sign in to continue.');
    return u;
  }

  /** The caller as the desk sees them: role from the socket, warehouse and tier from the database (they can change while connected). */
  private async actor(client: AuthedSocket): Promise<Actor> {
    const u = this.signedIn(client);
    // Only the desk admins (super admin, operations) work the desk; marketing, moderation, support and finance do not.
    if (u.role.startsWith('admin')) {
      if (!isDeskAdmin(u.role)) throw new Error(DESK_ADMINS_ONLY);
      return { id: u.id, role: u.role, name: u.name, hubId: null, tier: null };
    }
    if (u.role !== 'warehouse_staff') throw new Error('Staff only.');
    const row = await this.users.findOne({ where: { id: u.id }, select: ['id', 'hubId', 'warehouseTier', 'active'] });
    if (!row?.hubId) throw new Error('Your account is not linked to a warehouse. Ask an administrator.');
    return { id: u.id, role: u.role, name: u.name, hubId: row.hubId, tier: row.warehouseTier ?? 'operator' };
  }

  // ── delivery fee quote ───────────────────────────────────────────────────────
  /**
   * What delivery would cost, and through which warehouses, for an address (a saved `addressId`, or an `areaId` / `geo`
   * pin / `city` / `commune`) and the cart lines. Exactly the number `orders:create` charges. An address in an area
   * nobody serves yet gets `ok: false` with "We don't deliver to {area} yet.".
   */
  @SubscribeMessage('delivery:quote')
  async quote(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody()
    body: { addressId?: string; areaId?: string; geo?: { lat?: number; lng?: number }; city?: string; commune?: string; components?: unknown[]; lines?: { productId?: string; qty?: number }[] },
  ) {
    try {
      let geo = cleanPoint(body?.geo?.lat, body?.geo?.lng);
      let city = typeof body?.city === 'string' && body.city.trim() ? body.city.trim() : null;
      let commune = typeof body?.commune === 'string' && body.commune.trim() ? body.commune.trim() : null;
      let areaId = typeof body?.areaId === 'string' && body.areaId ? body.areaId : null;
      if (body?.addressId) {
        const u = this.signedIn(client);
        const a = (await this.addresses.list(u.id)).find((x) => x.id === String(body.addressId));
        if (!a) return fail('Address not found.');
        geo = geo ?? cleanPoint(a.geo?.lat, a.geo?.lng);
        city = city ?? a.city;
        commune = commune ?? a.commune;
        areaId = areaId ?? a.areaId ?? null;
      }
      const lines = Array.isArray(body?.lines) ? body.lines.slice(0, 100) : [];
      const sellerIds: (string | null)[] = [];
      const estimateLines: EstimateLine[] = [];
      for (const l of lines) {
        const p = l?.productId ? await this.products.get(String(l.productId)) : null;
        if (!p) continue;
        sellerIds.push(p.sellerId ?? null);
        estimateLines.push({ sellerId: p.sellerId ?? null, prepDays: p.prepDays, handlingDays: handlingDaysOf(p.sellerHandlingDays, MAX_HANDLING_DAYS) });
      }
      const r = await this.routing.route({ geo, city, commune, areaId, components: Array.isArray(body?.components) ? body.components : null, sellerIds });
      // The same numbers `orders:create` stamps: seller preparation + handling + the platform's route days, slowest seller wins.
      const est = estimateOrder(r, estimateLines);
      const perOrigin = new Map(est.sellers.map((s) => [s.sellerId, s]));
      return ok({
        feeUsd: r.feeUsd,
        deliveryUsd: r.deliveryUsd,
        transferUsd: r.transferUsd,
        defaultTransferUsd: r.defaultTransferUsd,
        distanceKm: r.distanceKm,
        served: r.served,
        destinationHubId: r.destinationHubId,
        destinationHubName: r.destinationHubName,
        destinationHub: r.destinationHub,
        destinationArea: r.destinationArea,
        destinationAreaChain: r.destinationAreaChain,
        originHubIds: r.originHubIds,
        origins: r.origins.map((o) => ({ sellerId: o.sellerId, hubId: o.hubId, hubName: o.hubName, areaName: o.areaName, areaNameEn: o.areaNameEn, fallback: o.fallback, hops: o.hops.map((h) => ({ fromHubId: h.fromHubId, fromHubName: h.fromHubName, toHubId: h.toHubId, toHubName: h.toHubName, transitHours: h.transitHours, costUsd: h.costUsd, laneCost: h.laneCost })), transitHours: o.transitHours, coveringHubId: o.coveringHubId, coveringHubName: o.coveringHubName, prepDays: perOrigin.get(o.sellerId)?.prepDays ?? null, routeDays: perOrigin.get(o.sellerId)?.routeDays ?? null, estimatedDeliveryDate: perOrigin.get(o.sellerId)?.estimatedDeliveryDate ?? null })),
        transfer: r.transfer,
        pinned: r.pinned,
        fallback: r.fallback,
        coveringHubId: r.coveringHubId,
        coveringHubName: r.coveringHubName,
        feeOverrideUsd: r.feeOverrideUsd,
        interCity: r.interCity,
        interCityDays: r.interCityDays,
        transitHours: r.transitHours,
        // `extraDays` keeps its legacy meaning (lanes / inter-city only) so older apps that add it to the product's total still agree.
        extraDays: r.extraDays,
        deliveryMode: est.deliveryMode,
        express: est.deliveryMode === 'express',
        prepDays: est.prepDays,
        routeDays: est.routeDays,
        estimateDays: est.estimateDays,
        estimatedDeliveryDate: est.estimatedDeliveryDate,
        splitAfterHours: await this.routing.splitAfterHours(),
      });
    } catch (e) {
      // A refusal for an area nobody serves also carries { areaId, areaName, areaNameEn, servedCities } for the client to render.
      return { ...fail((e as Error).message), ...notServedFields(e) };
    }
  }

  // ── hub directory ────────────────────────────────────────────────────────────
  @SubscribeMessage('hubs:list')
  async hubsList(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { activeOnly?: boolean }) {
    try {
      const u = this.signedIn(client);
      const rows = await this.hubsSvc.list({ activeOnly: body?.activeOnly === true });
      // The full directory (staff and rider counts, coverage) is for the desk; everyone else, other admin roles included, gets the public list.
      const ops = isDeskAdmin(u.role) || u.role === 'warehouse_staff';
      return ok(ops ? rows : rows.map((h) => ({ id: h.id, name: h.name, city: h.city, country: h.country, lat: h.lat, lng: h.lng, active: h.active, areaId: h.areaId ?? null })));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('hubs:create')
  async hubsCreate(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const u = this.signedIn(client);
      if (!HUB_ADMINS.includes(u.role)) return fail('Not allowed.');
      const { id: _ignored, active: _a, ...data } = body ?? {};
      void _ignored;
      void _a;
      const hub = await this.hubsSvc.save(data, { requirePosition: true, requireArea: true });
      return ok(await this.hubsSvc.get(hub.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Admins edit any hub; a manager edits THEIR hub's name, address, capacity and position (not its on/off switch). */
  @SubscribeMessage('hubs:update')
  async hubsUpdate(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: Record<string, unknown>) {
    try {
      const u = this.signedIn(client);
      const id = str(body?.id, 'Hub', { max: 64 });
      if (!HUB_ADMINS.includes(u.role)) {
        const me = await this.actor(client).catch(() => null);
        if (!me || me.role !== 'warehouse_staff' || !tierAllows(me.role, me.tier, 'manage') || me.hubId !== id) return fail('Not allowed.');
      }
      const { active: _a, ...data } = body;
      void _a;
      // Only admins move a warehouse to another area; a manager edits name, address, capacity and position.
      const hub = await this.hubsSvc.save(data, { allowArea: HUB_ADMINS.includes(u.role) });
      if (typeof body.active === 'boolean' && HUB_ADMINS.includes(u.role)) await this.hubsSvc.setActive(id, body.active);
      return ok(await this.hubsSvc.get(hub.id));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('hubs:setActive')
  async hubsSetActive(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { id: string; active: boolean }) {
    try {
      const u = this.signedIn(client);
      if (!HUB_ADMINS.includes(u.role)) return fail('Not allowed.');
      if (typeof body?.active !== 'boolean') return fail('Active must be true or false.');
      return ok(await this.hubsSvc.setActive(String(body?.id ?? ''), body.active));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The staff and riders of a warehouse (a manager: their own; admins: any). */
  @SubscribeMessage('hubs:people')
  async hubsPeople(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string }) {
    try {
      const me = await this.actor(client);
      if (!tierAllows(me.role, me.tier, 'manage')) return fail('Only managers can see the staff list.');
      const hubId = me.hubId ?? String(body?.hubId ?? '');
      if (!hubId) return fail('Choose a warehouse.');
      return ok(await this.hubsSvc.people(hubId));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('hubs:setTier')
  async hubsSetTier(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { userId: string; tier: string }) {
    try {
      const me = await this.actor(client);
      return ok(await this.hubsSvc.setTier(me, String(body?.userId ?? ''), body?.tier));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ── warehouse desk ───────────────────────────────────────────────────────────
  /** Tasks of MY warehouse (legs it manages, sends or receives), with what I may do with each. */
  @SubscribeMessage('logistics:queue')
  async queue(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string; kind?: string; status?: string; limit?: number; offset?: number }) {
    try {
      const me = await this.actor(client);
      const hubId = me.hubId ?? (body?.hubId ? String(body.hubId) : null);
      const { take, skip } = pageOf(body, { def: 200 });
      const { tasks, counts } = await this.logistics.queue(hubId, { kind: body?.kind ? String(body.kind) : undefined, status: body?.status ? String(body.status) : undefined, take, skip });
      const views = await this.logistics.viewMany(tasks);
      return ok({ hubId, tasks: views.map((v, i) => ({ ...v, desk: this.logistics.desk(tasks[i], me) })), counts });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The riders a task can be given to (its warehouse's; either end's for a transfer). */
  @SubscribeMessage('logistics:riders')
  async riders(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId: string }) {
    try {
      const me = await this.actor(client);
      const task = await this.logistics.getTask(String(body?.taskId ?? ''));
      if (me.hubId && !this.logistics.touches(task, me.hubId)) return fail('This task belongs to another warehouse.');
      return ok(await this.logistics.ridersFor(task));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  @SubscribeMessage('logistics:assign')
  async assign(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId: string; riderId: string }) {
    try {
      const me = await this.actor(client);
      const task = await this.logistics.assign(String(body?.taskId ?? ''), String(body?.riderId ?? ''), me);
      return ok({ ...(await this.logistics.view(task)), desk: this.logistics.desk(task, me) });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * Scan a parcel in at my warehouse; the next leg is created when it is due. `{ taskId }` scans the whole leg in (refused until
   * every box was scanned while `requireParcelScan` is on); `{ code: 'PKG-XXXXXXXX' }` scans one box by its KOMORIKO code: the
   * leg is found from the box, and scanned in when its last box arrives (`completed`, with the checklist).
   */
  @SubscribeMessage('logistics:scanIn')
  async scanIn(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId?: string; code?: string; manual?: boolean }) {
    try {
      const me = await this.actor(client);
      if (body?.code) {
        const r = await this.logistics.scanInByCode(body.code, me.hubId ?? null, me, body.manual === true);
        return ok({ task: await this.logistics.view(r.task), next: await this.logistics.viewMany(r.next), checklist: r.parcels, completed: r.completed });
      }
      const taskId = String(body?.taskId ?? '');
      const hubId = me.hubId ?? (await this.logistics.getTask(taskId)).toHubId;
      if (!hubId) return fail('This parcel is not due at a warehouse.');
      const { task, next } = await this.logistics.onScanIn(taskId, hubId, me);
      return ok({ task: await this.logistics.view(task), next: await this.logistics.viewMany(next), checklist: await this.parcels.checklist(task), completed: true });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Hand a parcel to its (assigned) rider at my warehouse: assigned -> picked up. */
  @SubscribeMessage('logistics:dispatchTransfer')
  async dispatchTransfer(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId?: string; code?: string; manual?: boolean }) {
    return this.scanOutImpl(client, body);
  }

  @SubscribeMessage('logistics:scanOut')
  async scanOut(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId?: string; code?: string; manual?: boolean }) {
    return this.scanOutImpl(client, body);
  }

  private async scanOutImpl(client: AuthedSocket, body: { taskId?: string; code?: string; manual?: boolean }) {
    try {
      const me = await this.actor(client);
      if (body?.code) {
        const r = await this.logistics.scanOutByCode(body.code, me.hubId ?? null, me, body.manual === true);
        return ok({ ...(await this.logistics.view(r.task)), checklist: r.parcels, completed: r.completed });
      }
      const taskId = String(body?.taskId ?? '');
      const hubId = me.hubId ?? (await this.logistics.getTask(taskId)).fromHubId;
      if (!hubId) return fail('This parcel does not leave from a warehouse.');
      const task = await this.logistics.scanOut(taskId, hubId, me);
      return ok(await this.logistics.view(task));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /**
   * Operations open the way back for a return (customer -> destination warehouse -> seller) by hand. The after-sale
   * flows do this themselves when a return is approved; this is the manual lever (and idempotent per `disputeId`).
   */
  @SubscribeMessage('logistics:createReturnPickup')
  async createReturnPickup(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { disputeId: string; orderId: string; items?: { orderItemId?: string; productId?: string; qty?: number }[] },
  ) {
    try {
      const u = this.signedIn(client);
      if (!HUB_ADMINS.includes(u.role)) return fail('Not allowed.');
      const task = await this.logistics.createReturnPickup({
        disputeId: str(body?.disputeId, 'Case', { max: 64 }),
        orderId: String(body?.orderId ?? ''),
        items: Array.isArray(body?.items) ? body.items.slice(0, 100) : undefined,
      });
      return ok(await this.logistics.view(task));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Operations send a replacement / exchange unit to the customer by hand (the after-sale flows do it on approval). */
  @SubscribeMessage('logistics:createReplacementDelivery')
  async createReplacementDelivery(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { replacementId?: string; exchangeId?: string; orderId: string },
  ) {
    try {
      const u = this.signedIn(client);
      if (!HUB_ADMINS.includes(u.role)) return fail('Not allowed.');
      const task = await this.logistics.createReplacementDelivery({
        replacementId: body?.replacementId ? String(body.replacementId) : undefined,
        exchangeId: body?.exchangeId ? String(body.exchangeId) : undefined,
        orderId: String(body?.orderId ?? ''),
      });
      return ok(await this.logistics.view(task));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Parcels in my warehouse's custody: inbound, on hand, outbound. */
  @SubscribeMessage('logistics:custody')
  async custody(@ConnectedSocket() client: AuthedSocket, @MessageBody() body?: { hubId?: string }) {
    try {
      const me = await this.actor(client);
      const hubId = me.hubId ?? (body?.hubId ? String(body.hubId) : null);
      if (!hubId) return fail('Choose a warehouse.');
      return ok({ hubId, ...(await this.logistics.custody(hubId)) });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  // ── parcels: labels and scans ────────────────────────────────────────────────
  /** A rider scans one box on their leg (or on a transfer run): `{ taskId | runId, code, stage: 'pickup' | 'dropoff', manual? }`. Answers the checklist. */
  @SubscribeMessage('rider:scanParcel')
  async riderScanParcel(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId?: string; runId?: string; code?: string; stage?: string; manual?: boolean }) {
    try {
      const u = this.signedIn(client);
      if (u.role !== 'rider') return fail('Riders only.');
      return ok(await this.parcels.riderScan(u.id, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The checklist of a rider's leg (or run): every box with when it was scanned out and in. */
  @SubscribeMessage('rider:legParcels')
  async riderLegParcels(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId?: string; runId?: string }) {
    try {
      const u = this.signedIn(client);
      if (u.role !== 'rider') return fail('Riders only.');
      return ok(await this.parcels.legChecklist(u.id, body ?? {}));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** Supervisors and managers mark a box scanned by hand (damaged label): needs a reason; audited. Riders cannot skip a scan. */
  @SubscribeMessage('logistics:markParcel')
  async markParcel(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId?: string; code?: string; stage?: string; reason?: string }) {
    try {
      const me = await this.actor(client);
      const checklist = await this.parcels.markByHand(me, body ?? {}, (t) => !me.hubId || this.logistics.touches(t, me.hubId));
      const task = await this.logistics.getTask(String(body?.taskId ?? ''));
      await this.logistics.emitTask(task);
      return ok({ task: await this.logistics.view(task), checklist });
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The checklist of any leg for the desk (staff of a warehouse that touches it, and the desk admins). */
  @SubscribeMessage('logistics:legParcels')
  async deskLegParcels(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { taskId?: string }) {
    try {
      const me = await this.actor(client);
      const task = await this.logistics.getTask(String(body?.taskId ?? ''));
      if (me.hubId && !this.logistics.touches(task, me.hubId)) return fail('This task belongs to another warehouse.');
      return ok(await this.parcels.checklist(task));
    } catch (e) {
      return fail((e as Error).message);
    }
  }

  /** The label of a return, so the customer can show it to the rider (`null` until the return pickup exists). */
  @SubscribeMessage('parcels:forReturn')
  async parcelForReturn(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { returnId?: string; disputeId?: string }) {
    try {
      const u = this.signedIn(client);
      return ok(await this.parcels.returnParcelFor(u, String(body?.returnId ?? body?.disputeId ?? '')));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
