import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from '../database/entities';
import { RealtimeEmitter } from '../realtime/realtime-emitter';
import { ADMIN_ROLES } from '../notifications/notifications.service';
import { num, oneOf, str } from '../common/validate';
import { validatePlans } from './plans';
import { cardPaymentsMode } from '../payments/stripe.config';
import { FRAUD_SETTING_KEYS, FRAUD_THRESHOLDS } from '../ops/fraud-rules.config';

/** Settings every client may read (they drive pricing/checkout display). Everything else is admin-only. */
export const PUBLIC_SETTINGS = ['returnWindowDays', 'sellerResponseHours', 'fxRate', 'codEnabled', 'codCapUsd', 'deliveryZones', 'deliveryBaseUsd', 'deliveryPerKmUsd', 'deliveryMaxUsd', 'deliveryTransferUsd', 'requirePinnedAddress', 'requireSellerPickupPin', 'requireDeliveryCode', 'requireVerifiedForCheckout', 'allowInterCityDelivery', 'interCityTransferDays'] as const;
/**
 * How shoppers reach Somba from Help (support phone, e-mail and a WhatsApp number). Blank = not offered. Public like
 * the rest of the shopper settings; written by admins only (see `WRITABLE`).
 */
export const CONTACT_SETTINGS = ['supportPhone', 'supportEmail', 'supportWhatsapp'] as const;
const isContactKey = (k: string) => (CONTACT_SETTINGS as readonly string[]).includes(k);
// `deliveryZones` stays readable for old clients but is never written or used: zones are gone (nearest-warehouse routing).
/** The only keys that can be written, each with its own validation. */
const WRITABLE = ['returnWindowDays', 'sellerResponseHours', 'fxRate', 'codEnabled', 'codCapUsd', 'commissionPct', 'deliveryBaseUsd', 'deliveryPerKmUsd', 'deliveryMaxUsd', 'deliveryTransferUsd', 'requirePinnedAddress', 'requireSellerPickupPin', 'productModeration', 'minPayoutUsd', 'payoutClearanceHours', 'hubAddress', 'requireDeliveryCode', 'requireVerifiedForCheckout', 'sellerPlans', 'seller2faRequired', 'requireStaffTwoFactor', 'allowInterCityDelivery', 'interCityTransferDays', ...FRAUD_SETTING_KEYS] as const;

/**
 * Key/value platform config: FX rate, COD cap, delivery fee numbers,
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

  /** Public view of the STORED settings (what shoppers and guests may see). */
  async publicView(): Promise<Record<string, string>> {
    const all = await this.all();
    return Object.fromEntries(Object.entries(all).filter(([k]) => (PUBLIC_SETTINGS as readonly string[]).includes(k) || isContactKey(k)));
  }

  /**
   * What the apps are sent (`settings:get`, `settings:updated`): the public settings plus `cardPayments`
   * ('stripe' | 'off'), computed from the Stripe configuration and never stored, so no setting can switch the card option on.
   */
  async clientView(): Promise<Record<string, string>> {
    return { ...(await this.publicView()), cardPayments: cardPaymentsMode() };
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
      case 'supportPhone':
      case 'supportWhatsapp': {
        const v = String(value ?? '').trim();
        if (v && !/^\+?[0-9][0-9 ()\-.]{5,19}$/.test(v)) throw new Error(`${key === 'supportPhone' ? 'Support phone' : 'WhatsApp number'} must be a phone number such as +243 970 000 000.`);
        return v;
      }
      case 'supportEmail': {
        const v = String(value ?? '').trim();
        if (v && (v.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))) throw new Error('Support e-mail must be an e-mail address.');
        return v;
      }
      case 'seller2faRequired':
      case 'requireStaffTwoFactor':
      case 'allowInterCityDelivery':
      case 'requireDeliveryCode':
      case 'requireVerifiedForCheckout':
      case 'productModeration':
        return oneOf(String(value), ['true', 'false'] as const, 'Moderation flag');
      case 'minPayoutUsd':
        return String(num(value, 'Minimum payout', { min: 1, max: 100000 }));
      case 'returnWindowDays':
        return String(num(value, 'Return window', { min: 0, max: 90, int: true }));
      case 'sellerResponseHours':
        return String(num(value, 'Seller response time', { min: 0.001, max: 720 }));
      case 'payoutClearanceHours':
        return String(num(value, 'Clearance hours', { min: 0, max: 720, int: true }));
      case 'hubAddress':
        return str(value, 'Hub address', { max: 200 });
      case 'sellerPlans':
        return JSON.stringify(validatePlans(value));
      case 'deliveryBaseUsd':
        return String(num(value, 'Base delivery fee', { min: 0, max: 100 }));
      case 'deliveryPerKmUsd':
        return String(num(value, 'Fee per km', { min: 0, max: 50 }));
      case 'deliveryMaxUsd':
        return String(num(value, 'Maximum delivery fee', { min: 0, max: 500 }));
      case 'deliveryTransferUsd':
        return String(num(value, 'Transfer fee', { min: 0, max: 100 }));
      case 'interCityTransferDays':
        return String(num(value, 'Inter-city transfer days', { min: 0, max: 30, int: true }));
      case 'requirePinnedAddress':
      case 'requireSellerPickupPin':
        return oneOf(String(value), ['true', 'false'] as const, 'Pinned address flag');
      default: {
        // Fraud-rule thresholds: whole numbers inside the range each rule allows (ops/fraud-rules.config.ts).
        const rule = Object.values(FRAUD_THRESHOLDS).find((t) => t.key === key);
        if (rule) return String(num(value, 'Fraud threshold', { min: rule.min, max: rule.max, int: true }));
        throw new Error('Unknown setting.');
      }
    }
  }

  async set(key: string, value: unknown): Promise<Record<string, string>> {
    if (!(WRITABLE as readonly string[]).includes(key) && !isContactKey(key)) throw new Error('Unknown setting.');
    const clean = SettingsService.validate(key, value);
    await this.repo.save(this.repo.create({ key, value: clean }));
    const all = await this.all();
    // Shoppers/guests only ever receive the public subset; admins get everything.
    this.emitter.toRoles(['customer', 'guest', 'seller', 'rider', 'warehouse_staff'], 'settings:updated', await this.clientView());
    this.emitter.toRoles(ADMIN_ROLES, 'settings:updated', all);
    return all;
  }
}
