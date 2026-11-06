import { CmsBlock, FlashSale, FraudAlert, FraudSignal, Promo, Campaign, WarehouseException, WarehouseBin } from '../entities';
import { Seller } from '../entities';
import { SellersService } from '../../ops/sellers.service';
import { CmsService } from '../../content/cms.service';
import { PromosService } from '../../content/promos.service';
import { CampaignsService } from '../../flows/campaigns.service';
import { FraudRulesService } from '../../ops/fraud-rules.service';
import { WarehouseService } from '../../warehouse/warehouse.service';
import { WarehouseStockService } from '../../inventory/warehouse-stock.service';
import { InventoryService } from '../../inventory/inventory.service';
import type { Actor } from '../../logistics/logistics.service';
import { log } from './demo-common';
import type { DemoCtx } from './demo-ctx';

const H = 3_600_000;
const D = 86_400_000;

/** What the admin screens need to be non-empty: banners, promos, flash sales, campaigns, fraud, incidents, warehouse stock. */
export async function seedAdminQueues(ctx: DemoCtx): Promise<void> {
  await cmsAndPromos(ctx);
  await flashAndCampaigns(ctx);
  await fraud(ctx);
  await warehouse(ctx);
  await stockAdjustments(ctx);
  await suspendStoreF(ctx);
  log('✓ admin queues: banners, promo codes, flash sales, campaigns, fraud alerts, incidents, warehouse stock');
}

const user = (ctx: DemoCtx, key: string) => ctx.users.get(key)!;

async function cmsAndPromos(ctx: DemoCtx): Promise<void> {
  const cms = ctx.app.get(CmsService);
  const repo = ctx.ds.getRepository(CmsBlock);
  const blocks = [
    { key: 'demo-home-hero', type: 'banner', title: 'Demo shop: everything for the home', titleFr: 'Boutique démo : tout pour la maison', body: 'Fashion, food and electronics from Kinshasa stores. Free delivery on your first order over $50.', bodyFr: 'Mode, alimentation et électronique de boutiques de Kinshasa. Livraison offerte dès 50 $ pour votre première commande.' },
    { key: 'demo-promo-strip', type: 'banner', title: 'Use code DEMO10 for 10% off', titleFr: 'Code DEMO10 : 10 % de réduction', body: 'On orders over $20. Demo data, visible to everyone while it is installed.', bodyFr: 'Dès 20 $ d’achat. Données de démonstration, visibles par tous tant qu’elles sont installées.' },
    { key: 'demo-delivery', type: 'banner', title: 'Delivered by our own riders', titleFr: 'Livré par nos propres livreurs', body: 'Track your parcel from the seller to your door, and give the 4-digit code to the rider.', bodyFr: 'Suivez votre colis du vendeur jusqu’à votre porte et donnez le code à 4 chiffres au livreur.' },
  ];
  for (const b of blocks) if (!(await repo.findOne({ where: { key: b.key } }))) await cms.upsert({ ...b, active: true });
  const promos = ctx.app.get(PromosService);
  const promoRepo = ctx.ds.getRepository(Promo);
  if (!(await promoRepo.findOne({ where: { code: 'DEMOWELCOME' } }))) await promos.create({ code: 'DEMOWELCOME', type: 'fixed', value: 3, minOrder: 15, description: 'Demo: $3 off orders over $15', maxUses: 100, perUserLimit: 1 });
  if (!(await promoRepo.findOne({ where: { code: 'DEMOPAUSED' } }))) await promos.create({ code: 'DEMOPAUSED', type: 'percent', value: 15, minOrder: 40, description: 'Demo: a paused code (switch it on to test)', active: false });
}

async function flashAndCampaigns(ctx: DemoCtx): Promise<void> {
  const promos = ctx.app.get(PromosService);
  const campaigns = ctx.app.get(CampaignsService);
  const flashRepo = ctx.ds.getRepository(FlashSale);
  const phone = ctx.products.get('MK-PHN')!;
  // The platform's own flash sale on the smartphone, running now.
  if (!(await flashRepo.findOne({ where: { productId: phone.id } }))) {
    await promos.createFlashSale({ productId: phone.id, flashPrice: 99, startsAt: new Date(Date.now() - 6 * H).toISOString(), endsAt: new Date(Date.now() + 2 * D).toISOString(), title: 'Smartphone A15 flash deal', titleFr: 'Offre flash Smartphone A15' });
  }
  // Store A proposes one more: it waits in the marketing queue.
  const earbuds = ctx.products.get('MK-EAR')!;
  if (!(await flashRepo.findOne({ where: { productId: earbuds.id } }))) {
    await promos.nominate(ctx.stores.get('A') as Seller, { productId: earbuds.id, flashPrice: 17.5, startsAt: new Date(Date.now() + 1 * D).toISOString(), endsAt: new Date(Date.now() + 5 * D).toISOString(), title: 'Wireless Earbuds weekend deal', titleFr: 'Écouteurs sans fil : offre du week-end' });
  }
  // Campaigns: one waiting for marketing, one saved as a draft.
  const owner = user(ctx, 'seller.a');
  const store = ctx.stores.get('A')!;
  const campRepo = ctx.ds.getRepository(Campaign);
  const mk = async (name: string, nameFr: string, discount: number, skus: string[], draft: boolean, startInDays: number) => {
    if (await campRepo.findOne({ where: { sellerId: store.id, name } })) return;
    await campaigns.create({ id: owner.id, name: owner.name, role: 'seller' }, {
      name, nameFr, discount, budgetUsd: 150,
      startDate: new Date(Date.now() + startInDays * D).toISOString().slice(0, 10),
      endDate: new Date(Date.now() + (startInDays + 14) * D).toISOString().slice(0, 10),
      productIds: skus.map((s) => ctx.products.get(s)!.id), productCount: skus.length, draft,
    });
  };
  await mk('Back to School', 'Rentrée scolaire', 15, ['MK-NBK', 'MK-BPK', 'MK-SNK'], false, 3);
  await mk('Kitchen Month (draft)', 'Mois de la cuisine (brouillon)', 10, ['MK-PLT', 'MK-HNY'], true, 20);
}

async function fraud(ctx: DemoCtx): Promise<void> {
  const rita = user(ctx, 'customer.fraud');
  const repo = ctx.ds.getRepository(FraudAlert);
  if (await repo.count({ where: { customerId: rita.id } })) return;
  const signals = ctx.ds.getRepository(FraudSignal);
  // Three address changes in a day while a parcel was on its way, and one device shared by three accounts.
  for (let i = 0; i < 3; i++) await signals.save(signals.create({ userId: rita.id, kind: 'address_change', key: `demo-address-${i}` }));
  for (const key of ['customer.fraud', 'customer.new', 'customer.unverified']) await signals.save(signals.create({ userId: user(ctx, key).id, kind: 'device', key: 'demo-device-shared' }));
  await ctx.app.get(FraudRulesService).evaluate(rita.id);
  // The signals are dated three days back, so the live sweep does not raise alerts for the other two accounts.
  await ctx.ds.query('UPDATE fraud_signals SET createdAt = ? WHERE `key` LIKE ?', [new Date(Date.now() - 3 * D), 'demo-%']);
  const raised = await repo.count({ where: { customerId: rita.id } });
  if (!raised) log('! no fraud alert was raised for the fraud demo customer (thresholds changed?)');
}

async function warehouse(ctx: DemoCtx): Promise<void> {
  const svc = ctx.app.get(WarehouseService);
  const stock = ctx.app.get(WarehouseStockService);
  const excRepo = ctx.ds.getRepository(WarehouseException);
  const mgr = user(ctx, 'warehouse.manager');
  const op = user(ctx, 'warehouse.operator');
  const actor = (u: typeof mgr, tier: string): Actor => ({ id: u.id, role: u.role, name: u.name, hubId: ctx.mainHub.id, tier });
  // Incidents on real demo parcels.
  const pick = async (sku: string) => {
    const rows = await ctx.ds.query('SELECT t.id FROM delivery_tasks t JOIN order_items i ON i.orderId = t.orderId WHERE i.productId = ? AND t.kind = ? ORDER BY t.createdAt DESC LIMIT 1', [ctx.products.get(sku)!.id, 'pickup']);
    return rows[0]?.id as string | undefined;
  };
  if (!(await excRepo.count({ where: { raisedBy: op.name } }))) {
    const t1 = await pick('MB-BTL');
    const t2 = await pick('MK-SNK');
    const a = await svc.createException(op.name, { taskId: t1, type: 'missing_item', severity: 'high', notes: 'Two of the three steel bottles in the parcel were missing at scan-in.' }, ctx.mainHub.id);
    const b = await svc.createException(op.name, { taskId: t2, type: 'damaged', severity: 'medium', notes: 'Shoe box crushed at one corner; the shoes look fine.' }, ctx.mainHub.id);
    await svc.setExceptionStatus(b.id, 'investigating', undefined, ctx.mainHub.id);
    await svc.createException(op.name, { taskId: await pick('MK-HNY'), type: 'address_issue', severity: 'low', notes: 'Customer phone was off; rider could not confirm the address.' }, ctx.mainHub.id).then((c) => svc.setExceptionStatus(c.id, 'resolved', 'Customer called back and confirmed the address.', ctx.mainHub.id));
    void a;
  }
  // Warehouse stock: bins, a receipt, a move, a stock-out and a count with a variance (the "stock ledger").
  const bins = ctx.ds.getRepository(WarehouseBin);
  if (!(await bins.count({ where: { hubId: ctx.mainHub.id, code: 'DEMO-A1' } }))) {
    const m = actor(mgr, 'manager');
    for (const code of ['DEMO-A1', 'DEMO-A2', 'DEMO-B1']) await stock.createBin(m, { hubId: ctx.mainHub.id, code, label: code === 'DEMO-B1' ? 'Demo: cold shelf' : 'Demo shelf' });
    const o = actor(op, 'operator');
    const p = (sku: string) => ctx.products.get(sku)!.id;
    await stock.receive(o, { hubId: ctx.mainHub.id, productId: p('MK-SHB'), qty: 60, binCode: 'DEMO-A1', note: 'Seller delivery (demo)' });
    await stock.receive(o, { hubId: ctx.mainHub.id, productId: p('MK-COF'), qty: 40, binCode: 'DEMO-A1', note: 'Seller delivery (demo)' });
    await stock.receive(o, { hubId: ctx.mainHub.id, productId: p('MK-LMP'), qty: 24, binCode: 'DEMO-A2' });
    await stock.receive(o, { hubId: ctx.mainHub.id, productId: p('MB-PNT'), qty: 50, binCode: 'DEMO-B1' });
    await stock.move(o, { hubId: ctx.mainHub.id, productId: p('MK-COF'), qty: 15, fromBinCode: 'DEMO-A1', toBinCode: 'DEMO-B1', note: 'Moved to the cold shelf' });
    await stock.stockOut(o, { hubId: ctx.mainHub.id, productId: p('MK-LMP'), qty: 2, binCode: 'DEMO-A2', reason: 'damaged', note: 'Cracked lenses found at shelving' });
    const sup = actor(user(ctx, 'warehouse.supervisor'), 'supervisor');
    await stock.count(sup, { hubId: ctx.mainHub.id, binCode: 'DEMO-A1', lines: [{ productId: p('MK-SHB'), counted: 58 }, { productId: p('MK-COF'), counted: 25 }], note: 'Weekly count (demo)' });
  }
  void WarehouseBin;
}

/** Manual stock adjustments by store A (they fill the stock ledger on the inventory page). */
async function stockAdjustments(ctx: DemoCtx): Promise<void> {
  const inv = ctx.app.get(InventoryService);
  const owner = user(ctx, 'seller.a');
  const moved = await ctx.ds.query("SELECT COUNT(*) AS n FROM stock_movements WHERE productId = ? AND reason = 'manual_adjust'", [ctx.products.get('MK-COF')!.id]);
  if (Number(moved[0].n) > 0) return;
  const who = { id: owner.id, role: 'seller' };
  await inv.adjust(who, { productId: ctx.products.get('MK-COF')!.id, delta: 10, reason: 'manual_adjust', note: 'Supplier delivery' });
  await inv.adjust(who, { productId: ctx.products.get('MK-PLM')!.id, delta: -3, reason: 'manual_adjust', note: 'Leaking bottles removed' });
  await inv.adjust(who, { productId: ctx.products.get('MK-SNK')!.id, delta: 3, variant: 'Size: 44', reason: 'manual_adjust', note: 'Recount' });
}

/** Store F is suspended last: its listings and its past orders exist first, then the suspension takes the listings off the shop. */
async function suspendStoreF(ctx: DemoCtx): Promise<void> {
  const f = ctx.stores.get('F');
  if (!f) return;
  const fresh = await ctx.ds.getRepository(Seller).findOneOrFail({ where: { id: f.id } });
  if (fresh.status !== 'approved') return;
  await ctx.app.get(SellersService).setStatus(f.id, 'suspended', 'Several customers reported items that never arrived. The store is suspended while we investigate.');
}
