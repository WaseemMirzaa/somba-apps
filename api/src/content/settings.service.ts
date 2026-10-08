import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { num, oneOf, str } from '../common/validate';

/** Settings every client may read (they drive pricing/checkout display). Everything else is admin-only. */
export const PUBLIC_SETTINGS = ['fxRate', 'codEnabled', 'codCapUsd', 'deliveryZones'] as const;
/** The only keys that can be written, each with its own validation. */
const WRITABLE = ['fxRate', 'codEnabled', 'codCapUsd', 'commissionPct', 'deliveryZones'] as const;

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
    await this.repo.save(this.repo.create({ key, value: SettingsService.validate(key, value) }));
    const all = await this.all();
    // Shoppers/guests only ever receive the public subset; admins get everything.
    this.emitter.toRoles(['customer', 'guest', 'seller', 'rider', 'warehouse_staff'], 'settings:updated', await this.publicView());
    this.emitter.toRoles(ADMIN_ROLES, 'settings:updated', all);
    return all;
  }
}
