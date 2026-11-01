import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Address } from '../database/entities';
import type { AddressGeo } from '../database/entities/address.entity';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { AreaChainView, GeoService } from '../geo/geo.service';

/** Only these may be set by the client — never `id`, `userId` or `createdAt`. (`areaId` is validated on its own.) */
const EDITABLE = [
  'label', 'line1', 'line2', 'city', 'commune', 'region',
  'country', 'postalCode', 'phone', 'zoneId', 'isDefault', 'geo',
] as const;

/** An address as clients receive it: the row plus where it is in the delivery geography and whether we deliver there. */
export type AddressView = Address & { areaChain: AreaChainView; served: boolean };

/** Accepts a plausible map pin only; anything else is dropped (null clears the pin). */
export function cleanGeo(raw: unknown): AddressGeo | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const lat = Number(g.lat);
  const lng = Number(g.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const out: AddressGeo = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  if (typeof g.placeId === 'string' && g.placeId.length <= 300) out.placeId = g.placeId;
  if (typeof g.formatted === 'string') out.formatted = g.formatted.slice(0, 300);
  return out;
}

function pickEditable(data: Record<string, unknown> | undefined): Partial<Address> {
  const out: Record<string, unknown> = {};
  for (const k of EDITABLE) {
    if (data && data[k] !== undefined) out[k] = k === 'geo' ? cleanGeo(data[k]) : data[k];
  }
  return out as Partial<Address>;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

@Injectable()
export class AddressesService {
  constructor(
    @InjectRepository(Address) private readonly repo: Repository<Address>,
    private readonly emitter: RealtimeEmitter,
    private readonly geo: GeoService,
  ) {}

  /** Add each address's area chain and served flag. */
  async decorate(rows: Address[]): Promise<AddressView[]> {
    const chains = new Map<string, AreaChainView>();
    for (const id of new Set(rows.map((r) => r.areaId).filter((x): x is string => !!x))) chains.set(id, await this.geo.chainView(id));
    return rows.map((r) => {
      const chain = r.areaId ? (chains.get(r.areaId) ?? []) : [];
      return Object.assign(r, { areaChain: chain, served: chain.length ? chain[chain.length - 1].served : false });
    });
  }

  async list(userId: string): Promise<AddressView[]> {
    return this.decorate(await this.repo.find({ where: { userId }, order: { createdAt: 'ASC' } }));
  }

  /**
   * The area of an address: the given `areaId` (must exist), else Google components, then the pin, then the typed
   * commune / city / province. The text columns are rewritten with the areas' Google names so every address of a place
   * is spelled the same.
   */
  private async place(
    input: { areaId?: unknown; components?: unknown },
    fields: Partial<Address>,
  ): Promise<{ areaId: string | null; text: Partial<Address> }> {
    const { area } = await this.geo.resolveRow({
      areaId: typeof input.areaId === 'string' && input.areaId ? input.areaId : undefined,
      components: input.components,
      geo: fields.geo ?? null,
      commune: text(fields.commune),
      city: text(fields.city),
      region: text(fields.region),
    });
    if (!area) return { areaId: null, text: {} };
    const cols = await this.geo.textColumns(area.id, 'fr');
    const out: Partial<Address> = {};
    if (cols.commune) out.commune = cols.commune;
    if (cols.city) out.city = cols.city;
    if (cols.region) out.region = cols.region;
    if (cols.country) out.country = cols.country;
    return { areaId: area.id, text: out };
  }

  async create(userId: string, data: Partial<Address> & { areaId?: unknown; components?: unknown }): Promise<AddressView> {
    const clean = pickEditable(data as Record<string, unknown>);
    const { areaId, text: names } = await this.place(data, clean);
    Object.assign(clean, names);
    if (!clean.line1 || !clean.city) {
      throw new BadRequestException('Street address and city are required.');
    }
    if (!clean.label) clean.label = 'Home';
    const count = await this.repo.count({ where: { userId } });
    const address = await this.repo.save(
      this.repo.create({
        ...clean,
        areaId,
        userId,
        isDefault: clean.isDefault ?? count === 0,
      }),
    );
    if (address.isDefault) await this.clearOtherDefaults(userId, address.id);
    await this.push(userId);
    return (await this.decorate([address]))[0];
  }

  async update(
    userId: string,
    id: string,
    patch: Partial<Address> & { areaId?: unknown; components?: unknown },
  ): Promise<AddressView | null> {
    const clean = pickEditable(patch as Record<string, unknown>);
    const current = await this.repo.findOne({ where: { id, userId } });
    if (current) {
      // Anything that says where the address is re-resolves its area (an explicit `areaId` wins).
      const movesPlace = patch?.areaId !== undefined || ['geo', 'city', 'commune', 'region'].some((k) => (clean as Record<string, unknown>)[k] !== undefined);
      if (movesPlace) {
        const merged = { ...current, ...clean } as Partial<Address>;
        const { areaId, text: names } = await this.place(patch, merged);
        Object.assign(clean, names);
        await this.repo.update({ id, userId }, { ...clean, areaId });
      } else if (Object.keys(clean).length) {
        await this.repo.update({ id, userId }, clean);
      }
    }
    if (clean.isDefault) await this.clearOtherDefaults(userId, id);
    await this.push(userId);
    const row = await this.repo.findOne({ where: { id, userId } });
    return row ? (await this.decorate([row]))[0] : null;
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.repo.delete({ id, userId });
    await this.push(userId);
  }

  private async clearOtherDefaults(userId: string, keepId: string) {
    await this.repo
      .createQueryBuilder()
      .update(Address)
      .set({ isDefault: false })
      .where('userId = :userId AND id != :keepId', { userId, keepId })
      .execute();
  }

  private async push(userId: string) {
    this.emitter.toUser(userId, 'addresses:updated', await this.list(userId));
  }
}
