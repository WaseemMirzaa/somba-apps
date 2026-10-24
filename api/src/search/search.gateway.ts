import { MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { ProductsService } from '../products/products.service';

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (error: string) => ({ ok: false as const, error });

/**
 * `products:search` — public, read-only. Returns live product ids ranked by relevance (accent-insensitive,
 * English + French names and descriptions, category, seller; one typo tolerated). Clients apply their own filters.
 * The ranking reads the composed fields (ProductsService.searchable): the French text is part of the match.
 */
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class SearchGateway {
  constructor(private readonly products: ProductsService) {}

  @SubscribeMessage('products:search')
  async search(@MessageBody() body: { q?: string; limit?: number }) {
    try {
      const q = String(body?.q ?? '').slice(0, 100);
      const limit = Math.min(200, Math.max(1, Math.floor(Number(body?.limit) || 50)));
      if (q.trim().length < 2) return ok({ ids: [] as string[], total: 0 });
      return ok(await this.products.search(q, limit));
    } catch (e) {
      return fail((e as Error).message);
    }
  }
}
