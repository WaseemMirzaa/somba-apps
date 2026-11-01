import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Hub, HubCoverage, Seller } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { num } from '../common/validate';
import { AreaIndex } from './area-index';
import { AreaView, GeoService } from './geo.service';

export interface CoverageConflict {
  area: AreaView;
  hubId: string;
  hubName: string;
}

/**
 * Which warehouse covers which area. One owner per area (unique index + a check here), the most specific assignment
 * wins when routing. Every change refreshes the served-area cache, recomputes the sellers' origin warehouses and tells
 * every client with `coverage:updated`. Orders already in progress are never touched.
 */
@Injectable()
export class CoverageService {
  constructor(
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
    @InjectRepository(HubCoverage) private readonly rows: Repository<HubCoverage>,
    @InjectRepository(Seller) private readonly sellers: Repository<Seller>,
    private readonly geo: GeoService,
    private readonly emitter: RealtimeEmitter,
  ) {}

  private async hubOrThrow(hubId: unknown): Promise<Hub> {
    const hub = await this.hubs.findOne({ where: { id: typeof hubId === 'string' ? hubId : '' } });
    if (!hub) throw new NotFoundException('Hub not found.');
    return hub;
  }

  /** Every warehouse's covered areas, for the directory. */
  async allByHub(): Promise<Map<string, (AreaView & { feeOverrideUsd: number | null })[]>> {
    const rows = await this.rows.find();
    const views = new Map((await this.geo.views([...new Set(rows.map((r) => r.areaId))])).map((v) => [v.id, v]));
    const out = new Map<string, (AreaView & { feeOverrideUsd: number | null })[]>();
    for (const r of rows) {
      const v = views.get(r.areaId);
      if (!v) continue;
      out.set(r.hubId, [...(out.get(r.hubId) ?? []), { ...v, feeOverrideUsd: r.feeOverrideUsd ?? null }]);
    }
    for (const list of out.values()) list.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }

  async areaIdsOf(hubId: string): Promise<string[]> {
    return (await this.rows.find({ where: { hubId }, select: { areaId: true } })).map((r) => r.areaId);
  }

  /** The areas a warehouse covers (with the fee override of each row). */
  async forHub(hubId: unknown): Promise<{ hubId: string; areas: (AreaView & { feeOverrideUsd: number | null })[] }> {
    const hub = await this.hubOrThrow(hubId);
    const rows = await this.rows.find({ where: { hubId: hub.id } });
    const views = await this.geo.views(rows.map((r) => r.areaId));
    const fee = new Map(rows.map((r) => [r.areaId, r.feeOverrideUsd ?? null]));
    const areas = views.map((v) => ({ ...v, feeOverrideUsd: fee.get(v.id) ?? null })).sort((a, b) => a.path.localeCompare(b.path));
    return { hubId: hub.id, areas };
  }

  /**
   * Give areas to a warehouse. An area another warehouse owns is refused and listed in `conflicts`, unless `move` is
   * true (then it changes hands). `feeOverrideUsd` sets (number) or clears (null) the flat fee of the assigned rows.
   */
  async assign(input: { hubId?: unknown; areaIds?: unknown; move?: unknown; feeOverrideUsd?: unknown }): Promise<{ assigned: AreaView[]; conflicts: CoverageConflict[] }> {
    const hub = await this.hubOrThrow(input.hubId);
    if (!Array.isArray(input.areaIds) || !input.areaIds.length || input.areaIds.length > 500) throw new BadRequestException('Choose at least one area.');
    const areaIds = [...new Set(input.areaIds.map((a) => String(a)))];
    const move = input.move === true;
    const override = input.feeOverrideUsd === undefined ? undefined : input.feeOverrideUsd === null || input.feeOverrideUsd === '' ? null : Math.round(num(input.feeOverrideUsd, 'Flat delivery fee', { min: 0, max: 500 }) * 100) / 100;

    const ix = await this.geo.index();
    for (const id of areaIds) if (!ix.get(id)) throw new NotFoundException('Area not found.');
    const existing = new Map((await this.rows.find({ where: { areaId: In(areaIds) } })).map((r) => [r.areaId, r]));
    const owners = new Map((await this.hubs.find({ where: { id: In([...new Set([...existing.values()].map((r) => r.hubId))]) } })).map((h) => [h.id, h]));

    const assigned: string[] = [];
    const moved: string[] = [];
    const conflicts: CoverageConflict[] = [];
    const fromHubs = new Set<string>();
    for (const areaId of areaIds) {
      const row = existing.get(areaId);
      if (!row) {
        try {
          await this.rows.save(this.rows.create({ hubId: hub.id, areaId, feeOverrideUsd: override ?? null }));
        } catch {
          // Lost a race on the unique index: someone else took it a moment ago.
          const now = await this.rows.findOne({ where: { areaId } });
          const owner = now ? await this.hubs.findOne({ where: { id: now.hubId } }) : null;
          throw new Error(`This area is already covered by ${owner?.name ?? 'another warehouse'}.`);
        }
        assigned.push(areaId);
      } else if (row.hubId === hub.id) {
        if (override !== undefined && (row.feeOverrideUsd ?? null) !== override) {
          row.feeOverrideUsd = override;
          await this.rows.save(row);
        }
        assigned.push(areaId);
      } else if (move) {
        fromHubs.add(row.hubId);
        row.hubId = hub.id;
        row.feeOverrideUsd = override ?? null; // the previous owner's flat fee does not follow the area
        await this.rows.save(row);
        assigned.push(areaId);
        moved.push(areaId);
      } else {
        const owner = owners.get(row.hubId);
        conflicts.push({ area: (await this.geo.view(areaId)) as AreaView, hubId: row.hubId, hubName: owner?.name ?? 'another warehouse' });
      }
    }
    if (assigned.length) await this.changed([hub.id, ...fromHubs], assigned, { from: [...fromHubs], moved });
    return { assigned: await this.geo.views(assigned), conflicts };
  }

  async unassign(input: { hubId?: unknown; areaIds?: unknown }): Promise<{ removed: number }> {
    const hub = await this.hubOrThrow(input.hubId);
    if (!Array.isArray(input.areaIds) || !input.areaIds.length || input.areaIds.length > 500) throw new BadRequestException('Choose at least one area.');
    const areaIds = [...new Set(input.areaIds.map((a) => String(a)))];
    const found = await this.rows.find({ where: { hubId: hub.id, areaId: In(areaIds) } });
    if (found.length) {
      await this.rows.delete({ id: In(found.map((r) => r.id)) });
      await this.changed([hub.id], found.map((r) => r.areaId));
    }
    return { removed: found.length };
  }

  /** Who serves every area of a subtree (the whole country when no root): served areas only; `direct` = assigned on that very area. */
  async map(rootId?: unknown): Promise<{ areaId: string; hubId: string; hubName: string; direct: boolean }[]> {
    const ix = await this.geo.index();
    const root = rootId ? ix.get(String(rootId)) : ix.root;
    if (!root) throw new NotFoundException('Area not found.');
    const ids = ix.subtree(root.id).map((a) => a.id);
    const cov = await this.geo.coveringMany(ids);
    const out: { areaId: string; hubId: string; hubName: string; direct: boolean }[] = [];
    for (const id of ids) {
      const c = cov.get(id);
      if (c) out.push({ areaId: id, hubId: c.hubId, hubName: c.hubName, direct: c.direct });
    }
    return out;
  }

  /**
   * Areas inside a partly served city (or district) that nobody covers: communes whose siblings are served but which
   * are not. Wholly unserved provinces and cities are "coming soon", not gaps.
   */
  async gaps(rootId: unknown): Promise<AreaView[]> {
    const ix = await this.geo.index();
    const root = ix.get(typeof rootId === 'string' ? rootId : null);
    if (!root) throw new NotFoundException('Area not found.');
    const ids = ix.subtree(root.id).map((a) => a.id);
    const cov = await this.geo.coveringMany(ids);
    const served = (id: string) => !!cov.get(id);
    const below = new Map<string, boolean>();
    const coveredBelow = async (id: string) => {
      if (!below.has(id)) below.set(id, await this.geo.hasCoverageBelow(id));
      return below.get(id) as boolean;
    };
    const out: string[] = [];
    const leafGaps = (a: ReturnType<AreaIndex['get']>) => {
      if (!a) return;
      const kids = ix.children(a.id).filter((c) => c.active);
      const communes = kids.filter((k) => k.level === 'commune' || k.level === 'district');
      if ((a.level === 'city' || a.level === 'district') && communes.length) communes.forEach((k) => leafGaps(k));
      else out.push(a.id);
    };
    const walk = async (a: NonNullable<ReturnType<AreaIndex['get']>>): Promise<void> => {
      if (served(a.id) || !(await coveredBelow(a.id))) return;
      const inCity = ['city', 'district', 'commune'].includes(a.level);
      for (const c of ix.children(a.id)) {
        if (!c.active || served(c.id)) continue;
        if (await coveredBelow(c.id)) await walk(c);
        else if (inCity) leafGaps(c);
      }
    };
    await walk(root);
    return this.geo.views(out);
  }

  /** Recompute where every store's parcels are collected: the warehouse covering its pickup area (null = not served). */
  async recomputeSellerOrigins(): Promise<number> {
    const rows = await this.sellers.find({ select: { id: true, pickupAreaId: true, originHubId: true } });
    const cov = await this.geo.coveringMany([...new Set(rows.map((r) => r.pickupAreaId).filter((x): x is string => !!x))]);
    let changed = 0;
    for (const s of rows) {
      const next = s.pickupAreaId ? (cov.get(s.pickupAreaId)?.hubId ?? null) : null;
      if ((s.originHubId ?? null) !== next) {
        await this.sellers.update({ id: s.id }, { originHubId: next });
        changed++;
      }
    }
    return changed;
  }

  /**
   * Something that decides who serves what changed (coverage rows, a warehouse switched on/off or created): refresh the
   * cache, recompute the stores' origins, tell everyone. In-progress orders keep their legs.
   */
  async changed(hubIds: string[], areaIds: string[], extra: { from?: string[]; moved?: string[] } = {}): Promise<void> {
    this.geo.invalidateCoverage();
    await this.recomputeSellerOrigins().catch(() => undefined);
    const unique = [...new Set(hubIds)];
    const payload = { hubId: unique[0] ?? null, areaIds, ...(extra.from?.length ? { fromHubIds: extra.from } : {}), ...(extra.moved?.length ? { movedAreaIds: extra.moved } : {}) };
    this.emitter.broadcast('coverage:updated', payload);
  }
}
