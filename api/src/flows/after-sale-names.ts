import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderItem } from '../database/entities';
import { ProductsService } from '../products/products.service';
import { TranslationService, chunk } from '../translation/translation.service';

/** An item a replacement or exchange names: the order it is on, the sku the app sent (the product id), and the name stored with the request. */
export interface ItemRef {
  orderId: string;
  sku: string;
  name: string;
}

const same = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * The French name of the item a replacement or exchange is about (`productNameFr`, `fromNameFr`, `toNameFr`).
 * Replacements and exchanges keep the one name they were filed with; this finds its French:
 *  1. the snapshot written with the order line (`translations(order_item, productName, fr)`), when the line matches
 *     (same order, `sku` = the line's product id);
 *  2. else the listing's current French title;
 *  3. else null.
 * A stored name that is not that item's name (an exchange's `toName` is often what the customer typed, "same shirt
 * in M") has no French of its own, so it gets null rather than another text's translation.
 * Everything is looked up in batches: one query for the order lines, one for the snapshots, and the listings'
 * titles go through the same composer as every other product title.
 */
@Injectable()
export class AfterSaleNames {
  private readonly logger = new Logger('AfterSaleNames');

  constructor(
    @InjectRepository(OrderItem) private readonly lines: Repository<OrderItem>,
    private readonly translations: TranslationService,
    private readonly products: ProductsService,
  ) {}

  /** One entry per ref, in order. A French name is decoration: if the lookup fails, the list still loads (with nulls). */
  async frenchNames(refs: ItemRef[]): Promise<(string | null)[]> {
    try {
      return await this.resolve(refs);
    } catch (e) {
      this.logger.warn(`French names skipped: ${(e as Error).message}`);
      return refs.map(() => null);
    }
  }

  private async resolve(refs: ItemRef[]): Promise<(string | null)[]> {
    const wanted = refs.filter((r) => r.orderId && r.sku && r.name);
    if (!wanted.length) return refs.map(() => null);

    // The order lines of those orders (raw rows: no entity hydration, so no per-line lookups of its own).
    const byOrder = new Map<string, { id: string; productId: string; productName: string }[]>();
    for (const part of chunk([...new Set(wanted.map((r) => r.orderId))])) {
      const rows = await this.lines
        .createQueryBuilder('i')
        .select('i.id', 'id')
        .addSelect('i.orderId', 'orderId')
        .addSelect('i.productId', 'productId')
        .addSelect('i.productName', 'productName')
        .where('i.orderId IN (:...ids)', { ids: part })
        .getRawMany<{ id: string; orderId: string; productId: string; productName: string }>();
      for (const r of rows) byOrder.set(r.orderId, [...(byOrder.get(r.orderId) ?? []), r]);
    }
    const matched = (r: ItemRef) => (byOrder.get(r.orderId) ?? []).filter((l) => l.productId === r.sku);

    const snapshots = await this.translations.rowsFor('order_item', wanted.flatMap((r) => matched(r).map((l) => l.id)));
    // The product to ask for the current title: the matched line's product, else the sku itself when it is a product id.
    const productIds = [...new Set(wanted.map((r) => matched(r)[0]?.productId ?? r.sku))];
    const titles = await this.products.names(productIds);

    return refs.map((r) => {
      if (!r.orderId || !r.sku || !r.name) return null;
      const lines = matched(r);
      for (const l of lines) {
        if (!same(l.productName, r.name)) continue;
        const snap = snapshots.get(l.id)?.find((s) => s.field === 'productName' && s.locale === 'fr');
        if (snap) return snap.value;
      }
      const current = titles.get(lines[0]?.productId ?? r.sku);
      if (current && (same(current.name, r.name) || lines.some((l) => same(l.productName, r.name)))) return current.nameFr;
      return null;
    });
  }
}
