import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Hub, Setting } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { num, oneOf, str } from '../common/validate';
import { validatePlans } from './plans';

/** Settings every client may read (they drive pricing/checkout display). Everything else is admin-only. */
export const PUBLIC_SETTINGS = ['fxRate', 'codEnabled', 'codCapUsd', 'deliveryZones', 'requireDeliveryCode', 'requireVerifiedForCheckout'] as const;
/** The only keys that can be written, each with its own validation. */
const WRITABLE = ['fxRate', 'codEnabled', 'codCapUsd', 'commissionPct', 'deliveryZones', 'productModeration', 'minPayoutUsd', 'payoutClearanceHours', 'hubAddress', 'requireDeliveryCode', 'requireVerifiedForCheckout', 'sellerPlans'] as const;

/**
 * Key/value platform config: FX rate, COD cap, delivery zones (JSON),
 * feature flags. Values are stored as strings; JSON values are parsed by
 * callers.
 */
@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Setting) private readonly repo: Repository<Setting>,
    private readonly emitter: RealtimeEmitter,
    @InjectRepository(Hub) private readonly hubs: Repository<Hub>,
  ) {}

  async all(): Promise<Record<string, string>> {
    const rows = await this.repo.find();
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async get(key: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { key } });
    return row?.value ?? null;
  }

  /** Public view of the settings (what shoppers and guests may see). */
  async publicView(): Promise<Record<string, string>> {
    const all = await this.all();
    return Object.fromEntries(Object.entries(all).filter(([k]) => (PUBLIC_SETTINGS as readonly string[]).includes(k)));
  }

  /** Validate a settings change; returns the normalised string to store. */
  /** Every zone's warehouse must exist (an inactive one is allowed: it may be switched back on). */
  private async assertZoneHubs(json: string): Promise<void> {
    const ids = [...new Set((JSON.parse(json) as { hubId: string | null }[]).map((z) => z.hubId).filter((h): h is string => !!h))];
    if (!ids.length) return;
    const found = new Set((await this.hubs.find({ where: { id: In(ids) }, select: ['id'] })).map((h) => h.id));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) throw new Error('A zone points at a warehouse that does not exist. Pick a warehouse from the list.');
  }

  private static validate(key: string, value: unknown): string {
    switch (key) {
      case 'fxRate':
        return String(num(value, 'Exchange rate', { min: 1, max: 100000 }));
      case 'codCapUsd':
        return String(num(value, 'COD cap', { min: 0, max: 100000 }));
      case 'commissionPct':
        return String(num(value, 'Commission', { min: 0, max: 60 }));
      case 'codEnabled':
        return oneOf(String(value), ['true', 'false'] as const, 'COD flag');
      case 'requireDeliveryCode':
      case 'requireVerifiedForCheckout':
      case 'productModeration':
        return oneOf(String(value), ['true', 'false'] as const, 'Moderation flag');
      case 'minPayoutUsd':
        return String(num(value, 'Minimum payout', { min: 1, max: 100000 }));
      case 'payoutClearanceHours':
        return String(num(value, 'Clearance hours', { min: 0, max: 720, int: true }));
      case 'hubAddress':
        return str(value, 'Hub address', { max: 200 });
      case 'sellerPlans':
        return JSON.stringify(validatePlans(value));
      case 'deliveryZones': {
        let zones: unknown;
        try {
          zones = typeof value === 'string' ? JSON.parse(value) : value;
        } catch {
          throw new Error('Zones must be valid JSON.');
        }
        if (!Array.isArray(zones) || zones.length > 100) throw new Error('Zones must be a list.');
        const clean = zones.map((z: Record<string, unknown>) => ({
          id: str(z?.id, 'Zone id', { max: 40 }),
          name: str(z?.name, 'Zone name', { max: 80 }),
          nameFr: typeof z?.nameFr === 'string' ? z.nameFr.slice(0, 80) : undefined,
          city: str(z?.city ?? '-', 'City', { max: 80 }),
          feeUsd: num(z?.feeUsd, 'Zone fee', { min: 0, max: 50 }),
          // The warehouse whose riders deliver this zone (checked against real warehouses in set()).
          hubId: typeof z?.hubId === 'string' && z.hubId.trim() ? z.hubId.trim().slice(0, 64) : null,
        }));
        if (new Set(clean.map((z) => z.id)).size !== clean.length) throw new Error('Zone ids must be unique.');
        return JSON.stringify(clean);
      }
      default:
        throw new Error('Unknown setting.');
    }
  }

  async set(key: string, value: unknown): Promise<Record<string, string>> {
    if (!(WRITABLE as readonly string[]).includes(key)) throw new Error('Unknown setting.');
    const clean = SettingsService.validate(key, value);
    if (key === 'deliveryZones') await this.assertZoneHubs(clean);
    await this.repo.save(this.repo.create({ key, value: clean }));
    const all = await this.all();
    // Shoppers/guests only ever receive the public subset; admins get everything.
    this.emitter.toRoles(['customer', 'guest', 'seller', 'rider', 'warehouse_staff'], 'settings:updated', await this.publicView());
    this.emitter.toRoles(ADMIN_ROLES, 'settings:updated', all);
    return all;
  }
}
