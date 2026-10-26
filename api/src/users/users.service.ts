import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { IsNull, Not, Repository } from 'typeorm';
import { User, UserRole } from '../database/entities';
import { DEFAULT_NOTIFY, NOTIFY_CATEGORIES, parseNotify } from './notify-prefs';
import type { NotifyPrefs } from './notify-prefs';

/** Public-safe projection of a user (never leaks the password hash). */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  locale: 'en' | 'fr';
  walletBalance: number;
  active: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  avatar: string | null;
  /** Two-factor authentication is on (the sign-in asks for a second code). */
  twofaEnabled: boolean;
  prefs: UserPrefs;
  /** Home warehouse (riders and warehouse staff always have one; null for everyone else). */
  hubId: string | null;
  /** Warehouse staff tier: operator | supervisor | manager (null for everyone else). */
  warehouseTier: 'operator' | 'supervisor' | 'manager' | null;
}

/** Notification + privacy + market preferences (customer Settings screen). */
export interface UserPrefs {
  push: boolean;
  email: boolean;
  sms: boolean;
  personalize: boolean;
  market: 'FR' | 'DRC';
  /** Which kinds of notice may push (order, payout, stock, review, question, message, product, promo). */
  notify: NotifyPrefs;
}

export const DEFAULT_PREFS: UserPrefs = {
  push: true,
  email: true,
  sms: false,
  personalize: true,
  market: 'DRC',
  notify: { ...DEFAULT_NOTIFY },
};

const PHONE_RE = /^\+?[0-9 ()-]{7,20}$/;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  /** Deterministic lookup key so we can find users without decrypting emails. */
  static emailHash(email: string): string {
    return createHash('sha256')
      .update(email.trim().toLowerCase())
      .digest('hex');
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByPhoneHash(hash: string): Promise<User[]> {
    return this.repo.find({ where: { phoneHash: hash } });
  }

  /** One-off fill of `phoneHash` for rows saved before the column existed (cheap: only rows still missing it). */
  async onModuleInit(): Promise<void> {
    try {
      const rows = await this.repo.find({ where: { phoneHash: IsNull(), phone: Not(IsNull()) } });
      for (const u of rows) await this.repo.save(u); // @BeforeUpdate computes the hash
    } catch {
      /* schema not ready yet (first boot before migrations): the next start fills it */
    }
  }

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({
      where: { emailHash: UsersService.emailHash(email) },
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    name: string;
    role: UserRole;
    phone?: string | null;
    locale?: 'en' | 'fr';
  }): Promise<User> {
    const user = this.repo.create({
      email: data.email,
      emailHash: UsersService.emailHash(data.email),
      passwordHash: data.passwordHash,
      name: data.name,
      role: data.role,
      phone: data.phone ?? null,
      locale: data.locale ?? 'en',
    });
    return this.repo.save(user);
  }

  save(user: User): Promise<User> {
    return this.repo.save(user);
  }

  static parsePrefs(raw: string | null): UserPrefs {
    try {
      const stored = raw ? (JSON.parse(raw) as Partial<UserPrefs>) : {};
      return { ...DEFAULT_PREFS, ...stored, notify: parseNotify(stored.notify) };
    } catch {
      return { ...DEFAULT_PREFS, notify: { ...DEFAULT_NOTIFY } };
    }
  }

  /** Whitelisted profile edit. Changing the phone number un-verifies it. */
  async updateProfile(
    userId: string,
    patch: { name?: string; phone?: string | null; locale?: string; avatar?: string | null },
  ): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error('Account not found.');
    if (patch.name !== undefined) {
      const name = String(patch.name).trim();
      if (name.length < 2 || name.length > 80) throw new Error('Name must be 2–80 characters.');
      user.name = name;
    }
    if (patch.phone !== undefined) {
      const phone = patch.phone === null || patch.phone === '' ? null : String(patch.phone).trim();
      if (phone !== null && !PHONE_RE.test(phone)) throw new Error('Enter a valid phone number.');
      if (phone !== user.phone) user.phoneVerified = false;
      user.phone = phone;
    }
    if (patch.locale !== undefined) {
      if (patch.locale !== 'en' && patch.locale !== 'fr') throw new Error('Locale must be en or fr.');
      user.locale = patch.locale;
    }
    if (patch.avatar !== undefined) {
      const a = patch.avatar === null || patch.avatar === '' ? null : String(patch.avatar);
      if (a !== null && (a.length > 255 || !/^https?:\/\//.test(a))) throw new Error('Invalid avatar URL.');
      user.avatar = a;
    }
    return this.repo.save(user);
  }

  async setPrefs(userId: string, patch: Partial<UserPrefs>): Promise<UserPrefs> {
    const user = await this.findById(userId);
    if (!user) throw new Error('Account not found.');
    const next = UsersService.parsePrefs(user.prefs);
    for (const k of ['push', 'email', 'sms', 'personalize'] as const) {
      if (patch[k] !== undefined) {
        if (typeof patch[k] !== 'boolean') throw new Error(`${k} must be true or false.`);
        next[k] = patch[k] as boolean;
      }
    }
    if (patch.market !== undefined) {
      if (patch.market !== 'FR' && patch.market !== 'DRC') throw new Error('market must be FR or DRC.');
      next.market = patch.market;
    }
    if (patch.notify !== undefined) {
      if (!patch.notify || typeof patch.notify !== 'object' || Array.isArray(patch.notify)) throw new Error('notify must be an object of true/false switches.');
      for (const [k, v] of Object.entries(patch.notify as Record<string, unknown>)) {
        if (!(NOTIFY_CATEGORIES as readonly string[]).includes(k)) throw new Error(`Unknown notification kind: ${k}.`);
        if (typeof v !== 'boolean') throw new Error(`${k} must be true or false.`);
        next.notify[k as keyof NotifyPrefs] = v;
      }
    }
    user.prefs = JSON.stringify(next);
    await this.repo.save(user);
    return next;
  }

  findByRole(role: UserRole): Promise<User[]> {
    return this.repo.find({ where: { role } });
  }

  static toPublic(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      locale: user.locale,
      walletBalance: user.walletBalance,
      active: user.active,
      emailVerified: !!user.emailVerified,
      phoneVerified: !!user.phoneVerified,
      avatar: user.avatar ?? null,
      twofaEnabled: !!user.twofaEnabled,
      prefs: UsersService.parsePrefs(user.prefs),
      hubId: user.hubId ?? null,
      warehouseTier: user.role === 'warehouse_staff' ? (user.warehouseTier ?? 'operator') : null,
    };
  }
}
