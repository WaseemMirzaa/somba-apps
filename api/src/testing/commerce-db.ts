import { DataSource } from 'typeorm';
import {
  Campaign,
  FlashSale,
  Order,
  OrderItem,
  Payout,
  PayoutStatementLine,
  Product,
  ProductView,
  Promo,
  Seller,
  StockMovement,
  TaxDocument,
  User,
} from '../database/entities';
import { CategoriesService } from '../catalog/categories.service';
import { CampaignsService } from '../flows/campaigns.service';
import { CouponsService } from '../content/coupons.service';
import { PromosService } from '../content/promos.service';
import { InventoryService } from '../inventory/inventory.service';
import { FinanceService } from '../finance/finance.service';
import { PayoutsService } from '../payouts/payouts.service';
import { ProductsService, cleanListing } from '../products/products.service';
import type { ListingInput } from '../products/products.service';
import { addCategory, addSeller, recordingEmitter, testDb, testTranslations } from './test-db';

export interface Note {
  to: string;
  title: string;
  body: string;
  type?: string;
}

/**
 * The commerce services on one in-memory database (the real entities), with a recording emitter and notifier.
 * Settings are a plain map: `world.settings.payoutClearanceHours = '0'`.
 */
export async function commerceWorld() {
  const ds = await testDb();
  const emitter = recordingEmitter();
  const translations = testTranslations(ds);
  const notes: Note[] = [];
  const notifications = {
    toUser: async (to: string, n: { title: string; body: string; type?: string }) => void notes.push({ to: `user:${to}`, ...n }),
    toRole: async (to: string, n: { title: string; body: string; type?: string }) => void notes.push({ to: `role:${to}`, ...n }),
    toAdmins: async (n: { title: string; body: string; type?: string }) => void notes.push({ to: 'admins', ...n }),
  };
  const settings: Record<string, string> = { payoutClearanceHours: '0', commissionPct: '10', minPayoutUsd: '1' };
  const settingsSvc = { get: async (k: string) => settings[k] ?? null };
  const categories = new CategoriesService(ds.getRepository('Category') as never, ds.getRepository(Product), emitter as never, translations);
  const products = new ProductsService(
    ds.getRepository(Product),
    ds.getRepository(FlashSale),
    ds.getRepository(Seller),
    ds.getRepository(Campaign),
    ds.getRepository(ProductView),
    emitter as never,
    categories,
    translations,
    ds.getRepository(StockMovement),
  );
  const promos = new PromosService(
    ds.getRepository(Promo),
    ds.getRepository(FlashSale),
    ds.getRepository(Order),
    ds.getRepository(Product),
    emitter as never,
    products,
    translations,
    ds.getRepository(Seller),
    notifications as never,
  );
  const coupons = new CouponsService(ds.getRepository(Promo), ds.getRepository(Order), ds.getRepository(Seller), emitter as never);
  const campaigns = new CampaignsService(
    ds.getRepository(Campaign),
    ds.getRepository(Seller),
    ds.getRepository(Product),
    notifications as never,
    emitter as never,
    products,
    translations,
  );
  const inventory = new InventoryService(
    ds.getRepository(Product),
    ds.getRepository(Seller),
    ds.getRepository(OrderItem),
    products,
    notifications as never,
    emitter as never,
  );
  inventory.onModuleInit();
  const wallet = { apply: async () => undefined };
  const payouts = new PayoutsService(
    ds.getRepository(Payout),
    ds.getRepository(Order),
    ds.getRepository(Product),
    ds.getRepository(Seller),
    settingsSvc as never,
    wallet as never,
    notifications as never,
    emitter as never,
    ds.getRepository(PayoutStatementLine),
  );
  const finance = new FinanceService(
    ds.getRepository(OrderItem),
    ds.getRepository(Payout),
    ds.getRepository(Seller),
    ds.getRepository(TaxDocument),
    ds.getRepository(User),
    settingsSvc as never,
    payouts,
    notifications as never,
  );
  const electronics = (await addCategory(ds, 'Electronics', 'Électronique')).id;

  /** An approved store with its owner account. */
  const store = async (name = 'Kinshasa Traders', userId = `u-${name}`, over: Partial<Seller> = {}) => {
    await ds.getRepository(User).save(ds.getRepository(User).create({ id: userId, name: `${name} owner`, email: `${userId}@x.test`, emailHash: userId, passwordHash: 'x', role: 'seller' } as never));
    return addSeller(ds, { name, userId, ...over });
  };
  const product = (seller: Seller, input: ListingInput = {}, status: 'live' | 'pending' = 'live') =>
    products.create(cleanListing({ name: 'Phone', price: 10, categoryId: electronics, stock: 10, ...input }, { partial: false, allowStatus: false }), { sellerId: seller.id, status });

  return { ds, emitter, translations, notes, settings, categories, products, promos, coupons, campaigns, inventory, payouts, finance, electronics, store, product };
}

export type World = Awaited<ReturnType<typeof commerceWorld>>;
