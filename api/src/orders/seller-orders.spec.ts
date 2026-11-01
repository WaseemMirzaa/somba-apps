import { DeliveryTask, Order, OrderItem, User } from '../database/entities';
import type { Seller } from '../database/entities';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { SellerOrdersService } from './seller-orders.service';
import { cityOf } from './seller-tracking';

let w: World;
let shop: Seller;
let other: Seller;
let svc: SellerOrdersService;
let lister: ((u: { id: string; role: string }, s: string | undefined, p: unknown) => Promise<unknown[]>) | null;
const owner = { id: 'u-kt' };

beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
  other = await w.store('Other Shop', 'u-other');
  lister = null;
  svc = new SellerOrdersService(w.ds.getRepository(Order), w.ds.getRepository('Product') as never, w.ds.getRepository('Seller') as never, { registerSellerLister: (fn: typeof lister) => (lister = fn) } as never);
});
afterEach(async () => w.ds.destroy());

let n = 0;
async function order(over: Partial<Order> = {}, lines: { seller: Seller; name: string; qty?: number; price?: number; fulfilment?: string }[] = [{ seller: shop, name: 'Phone case' }], at?: Date) {
  const o = await w.ds.getRepository(Order).save(
    w.ds.getRepository(Order).create({ reference: `SOM-${2000 + ++n}`, customerId: 'c1', customerName: 'Jean Mukendi', status: 'confirmed', paymentMethod: 'stripe_card', shippingAddress: JSON.stringify({ line1: '12 Avenue de la Paix', city: 'Lubumbashi', phone: '+243...' }), ...over }),
  );
  for (const l of lines) {
    const p = await w.product(l.seller, { name: l.name, price: l.price ?? 10 });
    await w.ds.getRepository(OrderItem).save(
      w.ds.getRepository(OrderItem).create({ orderId: o.id, productId: p.id, productName: l.name, qty: l.qty ?? 1, priceUsd: l.price ?? 10, sellerId: l.seller.id, fulfilment: (l.fulfilment ?? 'open') as never, commissionPct: 10, commissionUsd: 1 }),
    );
  }
  if (at) await w.ds.getRepository(Order).update({ id: o.id }, { createdAt: at, updatedAt: at });
  return o;
}

describe('cityOf', () => {
  it('is the city and nothing else', () => {
    expect(cityOf(JSON.stringify({ line1: '1 Rue X', city: ' Kinshasa ', phone: '+2438' }))).toBe('Kinshasa');
    expect(cityOf(JSON.stringify({ line1: '1 Rue X' }))).toBeNull();
    expect(cityOf('12 Rue X, Kinshasa')).toBeNull(); // free text: not guessed
    expect(cityOf(null)).toBeNull();
  });
});

describe('seller order list', () => {
  it('shows only the seller’s lines, the customer’s first name and city, never the street or contact', async () => {
    await order({}, [{ seller: shop, name: 'Mine' }, { seller: other, name: 'Theirs', price: 99 }]);
    const r = await svc.page(owner, shop.id);
    expect(r.total).toBe(1);
    const view = r.items[0] as Record<string, any>;
    expect(view.items.map((i: OrderItem) => i.productName)).toEqual(['Mine']);
    expect(view.customerName).toBe('Jean');
    expect(view.city).toBe('Lubumbashi');
    expect(view.subtotalUsd).toBe(10);
    expect(JSON.stringify(view)).not.toMatch(/Avenue de la Paix|\+243|Mukendi|customerId|shippingAddress/);
    expect(view.sellerCount).toBe(2);
  });

  it('does not show orders of other stores', async () => {
    await order({}, [{ seller: other, name: 'Theirs' }]);
    expect((await svc.page(owner, shop.id)).total).toBe(0);
  });

  it('pages newest first and reports the total', async () => {
    for (let i = 0; i < 7; i++) await order({}, [{ seller: shop, name: `P${i}` }], new Date(Date.now() - i * 3_600_000));
    const p1 = await svc.page(owner, shop.id, { limit: 3 });
    const p3 = await svc.page(owner, shop.id, { limit: 3, offset: 6 });
    expect(p1).toMatchObject({ total: 7, limit: 3, offset: 0 });
    expect(p1.items.map((o: any) => o.items[0].productName)).toEqual(['P0', 'P1', 'P2']);
    expect(p3.items.map((o: any) => o.items[0].productName)).toEqual(['P6']);
  });

  it('searches by order reference, product, and a one-word customer first name — never a surname', async () => {
    const a = await order({ customerName: 'Marie Kabila' }, [{ seller: shop, name: 'Blue lamp' }]);
    await order({ customerName: 'Jean Mukendi' }, [{ seller: shop, name: 'Red chair' }]);
    expect((await svc.page(owner, shop.id, { q: 'LAMP' })).total).toBe(1);
    expect((await svc.page(owner, shop.id, { q: a.reference.toLowerCase() })).total).toBe(1);
    expect((await svc.page(owner, shop.id, { q: 'marie' })).total).toBe(1);
    expect((await svc.page(owner, shop.id, { q: 'kabila' })).total).toBe(0); // the surname is not searchable
    expect((await svc.page(owner, shop.id, { q: 'marie kabila' })).total).toBe(0);
    expect((await svc.page(owner, shop.id, { q: 'zzz' })).total).toBe(0);
  });

  it('filters by order status, package step and date range', async () => {
    await order({ status: 'delivered' }, [{ seller: shop, name: 'D', fulfilment: 'received' }], new Date('2026-09-10T10:00:00Z'));
    await order({ status: 'confirmed' }, [{ seller: shop, name: 'ToPack', fulfilment: 'open' }], new Date('2026-10-10T10:00:00Z'));
    await order({ status: 'processing' }, [{ seller: shop, name: 'Ready', fulfilment: 'ready' }], new Date('2026-10-12T10:00:00Z'));
    await order({ status: 'processing' }, [{ seller: shop, name: 'AtHub', fulfilment: 'received' }], new Date('2026-10-14T10:00:00Z'));
    await order({ status: 'cancelled' }, [{ seller: shop, name: 'Cx', fulfilment: 'cancelled' }], new Date('2026-10-16T10:00:00Z'));
    const names = async (input: Record<string, unknown>) => (await svc.page(owner, shop.id, input)).items.map((o: any) => o.items[0].productName);
    expect(await names({ status: 'delivered' })).toEqual(['D']);
    expect(await names({ status: 'cancelled' })).toEqual(['Cx']);
    expect(await names({ status: 'to_pack' })).toEqual(['ToPack']);
    expect(await names({ status: 'ready' })).toEqual(['Ready']);
    expect(await names({ status: 'at_hub' })).toEqual(['AtHub']);
    expect((await names({ status: 'all' })).length).toBe(5);
    expect(await names({ from: '2026-10-11', to: '2026-10-14' })).toEqual(['AtHub', 'Ready']); // 'to' is inclusive of the whole day
    await expect(svc.page(owner, shop.id, { status: 'nonsense' })).rejects.toThrow('Status must be one of');
  });

  it('serves the old plain-array event through the same filters (default 200)', async () => {
    for (let i = 0; i < 3; i++) await order({}, [{ seller: shop, name: `P${i}` }]);
    expect(lister).not.toBeNull();
    expect((await lister!({ id: 'u-kt', role: 'seller' }, shop.id, undefined))).toHaveLength(3);
    expect((await lister!({ id: 'u-kt', role: 'seller' }, shop.id, { limit: 2, q: 'p' }))).toHaveLength(2);
    const csv = (await lister!({ id: 'u-kt', role: 'seller' }, shop.id, { format: 'csv' })) as unknown as { filename: string; csv: string };
    expect(csv.filename).toBe('orders.csv');
    expect(csv.csv.split('\r\n').filter(Boolean)).toHaveLength(4); // header + 3 lines
  });

  it('exports a CSV of the filtered orders, one row per line, with the seller’s numbers only', async () => {
    await order({ customerName: 'Jean Mukendi' }, [{ seller: shop, name: 'Lamp, large', qty: 2, price: 25 }, { seller: other, name: 'Theirs' }]);
    const r = await svc.csv(owner, shop.id, {});
    const lines = r.csv.split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('\uFEFFOrder,Date,Status,Package,Customer,City,Payment,Product,Option,Qty,Unit price USD,Coupon USD,Commission USD,Net USD');
    expect(lines[1]).toMatch(/^SOM-\d+,\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,confirmed,to_pack,Jean,Lubumbashi,stripe_card,"Lamp, large",Default,2,25\.00,0\.00,1\.00,49\.00$/);
    expect(r.csv).not.toContain('Theirs');
    expect(r.csv).not.toContain('Mukendi');
    expect(r.filename).toBe('orders.csv');
  });

  it('writes the headings and the status words in French when the caller speaks French (numbers and names stay)', async () => {
    await order({ customerName: 'Jean Mukendi' }, [{ seller: shop, name: 'Lamp, large', qty: 2, price: 25 }]);
    const r = await svc.csv(owner, shop.id, { locale: 'fr' });
    const lines = r.csv.split('\r\n').filter(Boolean);
    expect(lines[0]).toBe('\uFEFFCommande,Date,Statut,Colis,Client,Ville,Paiement,Produit,Option,Qté,Prix unitaire USD,Coupon USD,Commission USD,Net USD');
    expect(lines[1]).toMatch(/^SOM-\d+,\d{4}-\d\d-\d\d \d\d:\d\d:\d\d,confirmée,à emballer,Jean,Lubumbashi,Carte,"Lamp, large",Default,2,25\.00,0\.00,1\.00,49\.00$/);
    // An unknown language is English, as before.
    expect((await svc.csv(owner, shop.id, { locale: 'de' })).csv.split('\r\n')[0]).toBe('\uFEFFOrder,Date,Status,Package,Customer,City,Payment,Product,Option,Qty,Unit price USD,Coupon USD,Commission USD,Net USD');
    // The old plain-array event takes the same switch.
    const viaList = (await lister!({ id: 'u-kt', role: 'seller' }, shop.id, { format: 'csv', locale: 'fr' })) as unknown as { csv: string };
    expect(viaList.csv.split('\r\n')[0]).toContain('Commande,Date,Statut');
  });
});

describe('tracking from the delivery tasks', () => {
  const task = (orderId: string, over: Partial<DeliveryTask>) =>
    w.ds.getRepository(DeliveryTask).save(w.ds.getRepository(DeliveryTask).create({ orderId, orderReference: 'x', status: 'unassigned', ...over }));
  const rider = (id: string, name: string) => w.ds.getRepository(User).save(w.ds.getRepository(User).create({ id, name, email: `${id}@x.test`, emailHash: id, passwordHash: 'x', role: 'rider', phone: '+243900000000' } as never));

  it('shows the legs, the rider’s FIRST name and the times, and nothing private', async () => {
    const o = await order({ status: 'shipped' });
    await rider('r1', 'Patrick Ilunga');
    const picked = new Date('2026-10-24T09:00:00Z');
    await task(o.id, { kind: 'pickup', sellerId: shop.id, status: 'delivered', riderId: 'r1', pickedUpAt: picked, receivedAt: new Date('2026-10-24T10:00:00Z'), readyAt: new Date('2026-10-24T08:00:00Z'), address: 'secret address', proofCode: '1234' } as never);
    await task(o.id, { kind: 'delivery', status: 'assigned', riderId: 'r1' } as never);
    const view = (await svc.page(owner, shop.id)).items[0] as Record<string, any>;
    expect(view.tracking).toMatchObject({ carrier: 'Somba&Teka', currentLeg: 'delivery', riderFirstName: 'Patrick' });
    expect(view.tracking.legs.map((l: any) => [l.kind, l.status, l.riderFirstName])).toEqual([['pickup', 'delivered', 'Patrick'], ['delivery', 'assigned', 'Patrick']]);
    expect(new Date(view.tracking.legs[0].pickedUpAt)).toEqual(picked);
    expect(JSON.stringify(view)).not.toMatch(/Ilunga|\+2439|secret address|1234|proofCode/);
  });

  it('hides another seller’s pickup leg on a multi-seller order', async () => {
    const o = await order({ status: 'processing' }, [{ seller: shop, name: 'Mine' }, { seller: other, name: 'Theirs' }]);
    await rider('r1', 'Patrick Ilunga');
    await rider('r2', 'Alain Kasongo');
    await task(o.id, { kind: 'pickup', sellerId: shop.id, status: 'picked_up', riderId: 'r1' } as never);
    await task(o.id, { kind: 'pickup', sellerId: other.id, status: 'assigned', riderId: 'r2' } as never);
    const view = (await svc.page(owner, shop.id)).items[0] as Record<string, any>;
    expect(view.tracking.legs.map((l: any) => l.riderFirstName)).toEqual(['Patrick']);
    expect(JSON.stringify(view)).not.toContain('Alain');
  });

  it('is null when no task exists yet, and tolerates tasks that predate legs (treated as the delivery)', async () => {
    const o = await order();
    expect(((await svc.page(owner, shop.id)).items[0] as any).tracking).toBeNull();
    await task(o.id, { status: 'unassigned' });
    const t = ((await svc.page(owner, shop.id)).items[0] as any).tracking;
    expect(t.legs.map((l: any) => l.kind)).toEqual(['delivery']);
    expect(t.riderFirstName).toBeNull();
  });
});
