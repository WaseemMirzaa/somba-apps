import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import type { EntitySubscriberInterface } from 'typeorm';
import { OrderItem, Product } from '../database/entities';
import { hasNoOptions, localizeVariantLabel, storedVariantGroups } from '../common/variants/variants';
import { composeText, composeVariants } from './translatable';
import type { RowLite } from './translatable';
import { TranslationService, chunk } from './translation.service';

/**
 * Order lines are served with `productNameFr` / `variantFr`. Every way an order is loaded (list, detail, the
 * events a service emits, the seller's redacted view) goes through TypeORM, so the lines are completed here once:
 *  1. the snapshot rows written when the order was placed (translations(order_item, productName|variant, fr));
 *  2. for older orders, the product's CURRENT translation;
 *  3. else the name / label as stored.
 * Lines loaded in the same tick are resolved with one batched lookup (≤ 500 ids per query).
 */
@Injectable()
export class OrderItemTranslationSubscriber implements EntitySubscriberInterface<OrderItem> {
  private pending: { item: OrderItem; done: () => void; fail: (e: unknown) => void }[] = [];
  private scheduled = false;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly translations: TranslationService,
  ) {
    // Not `subscribers: [...]` in the module options: the subscriber needs injected services.
    if (!ds.subscribers.includes(this)) ds.subscribers.push(this);
  }

  listenTo() {
    return OrderItem;
  }

  afterLoad(item: OrderItem): Promise<void> {
    return new Promise<void>((done, fail) => {
      this.pending.push({ item, done, fail });
      if (!this.scheduled) {
        this.scheduled = true;
        queueMicrotask(() => void this.flush());
      }
    });
  }

  private async flush(): Promise<void> {
    const batch = this.pending;
    this.pending = [];
    this.scheduled = false;
    try {
      await this.resolve(batch.map((b) => b.item));
      batch.forEach((b) => b.done());
    } catch (e) {
      // Translation is decoration: a failure here must never break loading an order.
      batch.forEach((b) => b.done());
      void e;
    }
  }

  /** Fill `productNameFr` / `variantFr` on the given lines (`variantFr` is null for a product without options). */
  async resolve(items: OrderItem[]): Promise<void> {
    const todo = items.filter((i) => i.productNameFr === undefined || i.variantFr === undefined);
    if (!todo.length) return;
    const snaps = await this.translations.rowsFor('order_item', todo.map((i) => i.id));
    const needProducts = new Set<string>();
    for (const i of todo) {
      const mine = snaps.get(i.id) ?? [];
      const hasName = mine.some((r) => r.field === 'productName' && r.locale === 'fr');
      const hasVariant = mine.some((r) => r.field === 'variant' && r.locale === 'fr');
      if ((!hasName || (!hasVariant && !hasNoOptions(i.variant))) && i.productId && !i.productId.startsWith('ext:')) needProducts.add(i.productId);
    }
    const products = new Map<string, Product>();
    for (const part of chunk([...needProducts])) {
      for (const p of await this.ds.getRepository(Product).find({ where: { id: In(part) } })) products.set(p.id, p);
    }
    const prodRows = needProducts.size ? await this.translations.rowsFor('product', [...needProducts]) : new Map();
    for (const i of todo) {
      const mine = snaps.get(i.id) ?? [];
      const snapName = mine.find((r) => r.field === 'productName' && r.locale === 'fr')?.value;
      const snapVariant = mine.find((r) => r.field === 'variant' && r.locale === 'fr')?.value;
      const p = products.get(i.productId);
      const rows = (p ? (prodRows.get(p.id) ?? []) : []) as RowLite[];
      let nameFr = snapName;
      if (nameFr === undefined && p) nameFr = composeText(p.sourceLang, p.name, rows.filter((r) => r.field === 'name')).fr ?? undefined;
      // A product without options ("Default") has no label to translate: serve null, not the canonical word.
      let variantFr: string | null | undefined = hasNoOptions(i.variant) ? null : snapVariant;
      if (variantFr === undefined) {
        if (p) {
          const v = composeVariants(p.sourceLang, p.variants, rows.filter((r) => r.field === 'variants'));
          variantFr = localizeVariantLabel(i.variant, storedVariantGroups(p.variants), v.fr);
        } else variantFr = i.variant;
      }
      i.productNameFr = nameFr ?? i.productName;
      i.variantFr = variantFr;
    }
  }
}
