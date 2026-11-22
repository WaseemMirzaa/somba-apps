import { Campaign, FlashSale, Product, ProductView, Seller, Setting, StockMovement } from '../database/entities';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { ProductsService } from './products.service';

/** Every listing served to a shopper says the VAT % it is charged (0 while VAT is off); the order stays authoritative. */
let w: World;
let svc: ProductsService;
beforeEach(async () => {
  w = await commerceWorld();
  svc = new ProductsService(
    w.ds.getRepository(Product),
    w.ds.getRepository(FlashSale),
    w.ds.getRepository(Seller),
    w.ds.getRepository(Campaign),
    w.ds.getRepository(ProductView),
    w.emitter as never,
    w.categories,
    w.translations,
    w.ds.getRepository(StockMovement),
    w.ds.getRepository(Setting),
  );
});
afterEach(async () => w.ds.destroy());

const setting = (key: string, value: string) => w.ds.getRepository(Setting).save(w.ds.getRepository(Setting).create({ key, value }));

describe('product vatPct', () => {
  it('is 0 while the VAT switch is off (the default), whatever the category says', async () => {
    const shop = await w.store();
    const p = await w.product(shop, { name: 'Shoes' });
    await w.ds.getRepository('Category').update({ id: w.electronics }, { vatPct: 8 });
    expect((await svc.get(p.id))!.vatPct).toBe(0);
  });

  it('is the category rate (0 is real), else the default rate, once VAT is on', async () => {
    const shop = await w.store();
    const p = await w.product(shop, { name: 'Shoes' });
    await setting('vatEnabled', 'true');
    await setting('vatPct', '18');
    expect((await svc.get(p.id))!.vatPct).toBe(18);
    await w.ds.getRepository('Category').update({ id: w.electronics }, { vatPct: 8 });
    expect((await svc.get(p.id))!.vatPct).toBe(8);
    await w.ds.getRepository('Category').update({ id: w.electronics }, { vatPct: 0 });
    expect((await svc.get(p.id))!.vatPct).toBe(0);
  });
});
