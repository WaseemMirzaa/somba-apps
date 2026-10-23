import { InjectRepository } from '@nestjs/typeorm';
import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Repository } from 'typeorm';
import { Product } from '../database/entities';
import { score } from './rank';

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/** Upper bound of live listings scanned per query; beyond this a search index (MySQL FULLTEXT / Meilisearch) is due. */
const SCAN_LIMIT = 5000;

/**
 * `products:search` — public, read-only. Returns live product ids ranked by relevance (accent-insensitive,
 * English + French names, category, seller, description; one typo tolerated). Clients apply their own filters.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class SearchGateway {
  constructor(@InjectRepository(Product) private readonly products: Repository<Product>) {}

  @SubscribeMessage('products:search')
  async search(@MessageBody() body: { q?: string; limit?: number }) {
    try {
      const q = String(body?.q ?? '').slice(0, 100);
      const limit = Math.min(200, Math.max(1, Math.floor(Number(body?.limit) || 50)));
      if (q.trim().length < 2) return ok({ ids: [] as string[], total: 0 });
      const rows = await this.products.find({
        where: { status: 'live' },
        select: ['id', 'name', 'nameFr', 'category', 'categoryFr', 'sellerName', 'description', 'rating', 'reviewsCount'],
        take: SCAN_LIMIT,
      });
      const ranked = rows
        .map((p) => ({ id: p.id, s: score(p, q) }))
        .filter((r) => r.s > 0)
        .sort((a, b) => b.s - a.s);
      return ok({ ids: ranked.slice(0, limit).map((r) => r.id), total: ranked.length });
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
