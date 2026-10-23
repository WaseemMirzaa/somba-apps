import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CartLine } from '../database/entities/cart-line.entity';
import { RealtimeEmitter } from '../realtime/realtime-emitter';

export interface CartLineInput {
  productId: string;
  variant?: string;
  qty: number;
  priceWhenAdded?: number | null;
}

export interface CartView {
  lines: CartLineInput[];
  saved: CartLineInput[];
}

export const MAX_LINES = 100;

/** Validates and de-duplicates what a client sent (same product + variant merged; qty 1…99). */
export function cleanLines(raw: unknown, label: string): CartLineInput[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new BadRequestException(`${label} is not a list.`);
  if (raw.length > MAX_LINES) throw new BadRequestException(`At most ${MAX_LINES} lines.`);
  const out = new Map<string, CartLineInput>();
  for (const r of raw) {
    const productId = String((r as CartLineInput)?.productId ?? '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(productId)) continue; // unknown/garbage ids are dropped, not fatal
    const variant = String((r as CartLineInput)?.variant ?? 'Default').trim().slice(0, 200) || 'Default';
    const qty = Math.min(99, Math.max(1, Math.floor(Number((r as CartLineInput)?.qty) || 1)));
    const p = Number((r as CartLineInput)?.priceWhenAdded);
    const key = `${productId}|${variant}`;
    const prev = out.get(key);
    out.set(key, {
      productId,
      variant,
      qty: Math.min(99, (prev?.qty ?? 0) + qty),
      priceWhenAdded: prev?.priceWhenAdded ?? (Number.isFinite(p) && p > 0 ? p : null),
    });
  }
  return [...out.values()];
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(CartLine) private readonly repo: Repository<CartLine>,
    private readonly ds: DataSource,
    private readonly emitter: RealtimeEmitter,
  ) {}

  async get(userId: string): Promise<CartView> {
    const rows = await this.repo.find({ where: { userId }, order: { position: 'ASC' } });
    const view = (r: CartLine): CartLineInput => ({ productId: r.productId, variant: r.variant, qty: r.qty, priceWhenAdded: r.priceWhenAdded });
    return { lines: rows.filter((r) => !r.saved).map(view), saved: rows.filter((r) => r.saved).map(view) };
  }

  /** Replaces the whole cart (last write wins) and tells the customer's other devices. */
  async set(userId: string, body: { lines?: unknown; saved?: unknown }): Promise<CartView> {
    const lines = cleanLines(body?.lines, 'Cart');
    const saved = cleanLines(body?.saved, 'Saved for later');
    await this.ds.transaction(async (m) => {
      await m.delete(CartLine, { userId });
      const rows = [
        ...lines.map((l, i) => m.create(CartLine, { ...l, variant: l.variant ?? 'Default', userId, saved: false, position: i })),
        ...saved.map((l, i) => m.create(CartLine, { ...l, variant: l.variant ?? 'Default', userId, saved: true, position: i })),
      ];
      if (rows.length) await m.save(rows);
    });
    const view = await this.get(userId);
    this.emitter.toUser(userId, 'cart:updated', view);
    return view;
  }
}
