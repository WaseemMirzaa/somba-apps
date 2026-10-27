import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Hub, HubLane } from '../database/entities';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { num } from '../common/validate';
import { LaneEdge, PlannedRoute, planRoute, reverseOverLanes } from './lane-route';
import type { PlannedHop } from './lane-route';

const OPS_ROOMS = [...ADMIN_ROLES, 'warehouse_staff'];
const CACHE_MS = 5_000;

/** A lane as clients receive it. */
export interface LaneView {
  id: string;
  fromHubId: string;
  fromHubName: string;
  toHubId: string;
  toHubName: string;
  transitHours: number;
  costUsd: number | null;
  active: boolean;
  /** The opposite direction exists too. */
  bidirectional: boolean;
}

/**
 * The lanes between warehouses and the routes over them. A lane is usable when it is active and both its warehouses are.
 * Pure data in the table; the shortest-chain logic lives in `lane-route.ts`.
 */
@Injectable()
export class LanesService {
  private cache: { at: number; edges: LaneEdge[] } | null = null;

  constructor(
    @InjectRepository(HubLane) private readonly lanes: Repository<HubLane>,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    private readonly emitter: RealtimeEmitter,
  ) {}

  invalidate(): void {
    this.cache = null;
  }

  /** The usable lanes (active, between active warehouses). */
  async edges(): Promise<LaneEdge[]> {
    if (!this.cache || Date.now() - this.cache.at > CACHE_MS) {
      const [rows, hubs] = await Promise.all([this.lanes.find({ where: { active: true } }), this.hubs.find({ select: { id: true, active: true } })]);
      const live = new Set(hubs.filter((h) => h.active).map((h) => h.id));
      this.cache = {
        at: Date.now(),
        edges: rows.filter((l) => live.has(l.fromHubId) && live.has(l.toHubId)).map((l) => ({ fromHubId: l.fromHubId, toHubId: l.toHubId, transitHours: l.transitHours, costUsd: l.costUsd ?? null })),
      };
    }
    return this.cache.edges;
  }

  /** The route a parcel takes between two warehouses (see {@link planRoute}). */
  async route(fromHubId: string, toHubId: string): Promise<PlannedRoute> {
    return planRoute(await this.edges(), fromHubId, toHubId);
  }

  /** A recorded route run backwards over today's lanes ("returns follow the same route in reverse"), else null. */
  async reverse(recordedHubs: readonly string[]): Promise<PlannedHop[] | null> {
    return reverseOverLanes(await this.edges(), recordedHubs);
  }

  // ── directory ────────────────────────────────────────────────────────────────
  private async view(rows: HubLane[]): Promise<LaneView[]> {
    const names = new Map((await this.hubs.find({ select: { id: true, name: true } })).map((h) => [h.id, h.name]));
    const all = await this.lanes.find();
    const has = new Set(all.map((l) => `${l.fromHubId}>${l.toHubId}`));
    return rows.map((l) => ({
      id: l.id,
      fromHubId: l.fromHubId,
      fromHubName: names.get(l.fromHubId) ?? l.fromHubId,
      toHubId: l.toHubId,
      toHubName: names.get(l.toHubId) ?? l.toHubId,
      transitHours: l.transitHours,
      costUsd: l.costUsd ?? null,
      active: l.active,
      bidirectional: has.has(`${l.toHubId}>${l.fromHubId}`),
    }));
  }

  /** Every lane (or those touching one warehouse), ordered by the warehouses' names. */
  async list(hubId?: string | null): Promise<LaneView[]> {
    const rows = await this.lanes.find({ where: hubId ? [{ fromHubId: hubId }, { toHubId: hubId }] : undefined });
    const out = await this.view(rows);
    return out.sort((a, b) => a.fromHubName.localeCompare(b.fromHubName) || a.toHubName.localeCompare(b.toHubName));
  }

  private async hubOrThrow(id: unknown): Promise<Hub> {
    const hub = await this.hubs.findOne({ where: { id: typeof id === 'string' ? id : '' } });
    if (!hub) throw new NotFoundException('Hub not found.');
    return hub;
  }

  private async put(fromHubId: string, toHubId: string, v: { transitHours: number; costUsd: number | null; active: boolean }): Promise<HubLane> {
    const existing = await this.lanes.findOne({ where: { fromHubId, toHubId } });
    return this.lanes.save(existing ? Object.assign(existing, v) : this.lanes.create({ fromHubId, toHubId, ...v }));
  }

  /**
   * Create or update a lane. `bidirectional: true` keeps the opposite direction in step (same time, cost, state);
   * `false` removes it; omitted leaves it alone. With an `id` the lane is edited (its warehouses can change too).
   */
  async upsert(input: Record<string, unknown>): Promise<LaneView> {
    let fromHubId = typeof input.fromHubId === 'string' ? input.fromHubId : '';
    let toHubId = typeof input.toHubId === 'string' ? input.toHubId : '';
    const current = typeof input.id === 'string' && input.id ? await this.lanes.findOne({ where: { id: input.id } }) : null;
    if (typeof input.id === 'string' && input.id && !current) throw new NotFoundException('Lane not found.');
    if (current) {
      fromHubId = fromHubId || current.fromHubId;
      toHubId = toHubId || current.toHubId;
    }
    await this.hubOrThrow(fromHubId);
    await this.hubOrThrow(toHubId);
    if (fromHubId === toHubId) throw new BadRequestException('A lane connects two different warehouses.');
    const transitHours = input.transitHours === undefined && current ? current.transitHours : num(input.transitHours, 'Transit time (hours)', { min: 0, max: 720 });
    const costUsd =
      input.costUsd === undefined ? (current?.costUsd ?? null) : input.costUsd === null || input.costUsd === '' ? null : Math.round(num(input.costUsd, 'Lane cost', { min: 0, max: 1000 }) * 100) / 100;
    if (input.active !== undefined && typeof input.active !== 'boolean') throw new BadRequestException('Active must be true or false.');
    const active = typeof input.active === 'boolean' ? input.active : (current?.active ?? true);
    if (input.bidirectional !== undefined && typeof input.bidirectional !== 'boolean') throw new BadRequestException('Bidirectional must be true or false.');

    // Moving an existing lane to another pair: the old pair goes.
    if (current && (current.fromHubId !== fromHubId || current.toHubId !== toHubId)) await this.lanes.delete({ id: current.id });
    const lane = await this.put(fromHubId, toHubId, { transitHours, costUsd, active });
    if (input.bidirectional === true) await this.put(toHubId, fromHubId, { transitHours, costUsd, active });
    if (input.bidirectional === false) await this.lanes.delete({ fromHubId: toHubId, toHubId: fromHubId });
    await this.changed();
    return (await this.view([lane]))[0];
  }

  async remove(id: unknown, opts: { both?: boolean } = {}): Promise<{ removed: true }> {
    const lane = await this.lanes.findOne({ where: { id: typeof id === 'string' ? id : '' } });
    if (!lane) throw new NotFoundException('Lane not found.');
    await this.lanes.delete({ id: lane.id });
    if (opts.both) await this.lanes.delete({ fromHubId: lane.toHubId, toHubId: lane.fromHubId });
    await this.changed();
    return { removed: true };
  }

  /** `routes:preview`: the route between two warehouses, or an error when lanes exist but none connects them. */
  async preview(fromHubId: unknown, toHubId: unknown): Promise<{ hops: PlannedHop[]; totalHours: number; direct: boolean }> {
    const from = await this.hubOrThrow(fromHubId);
    const to = await this.hubOrThrow(toHubId);
    const r = await this.route(from.id, to.id);
    if (!r.connected) throw new BadRequestException('These warehouses are not connected by any lane.');
    return { hops: r.hops, totalHours: r.totalHours, direct: r.direct };
  }

  private async changed(): Promise<void> {
    this.invalidate();
    this.emitter.toRoles(OPS_ROOMS, 'lanes:updated', await this.list());
  }
}
