import { BadRequestException } from '@nestjs/common';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';
import { AuditLog, DeliveryTask, Hub, Product, WarehouseBin, WarehouseLedger, WarehouseStock } from '../database/entities';
import type { Actor, LogisticsEvent } from '../logistics/logistics.service';
import { WarehouseStockService, binCode, isLockFailure, ledgerId, skuOf, units } from './warehouse-stock.service';

const SIZE_S = 'Size: S';
const SIZE_M = 'Size: M';

let w: World;
let svc: WarehouseStockService;
let listener: ((e: LogisticsEvent) => void | Promise<void>) | null;
let hub: Hub;
let other: Hub;
let phone: Product;

const operator = (): Actor => ({ id: 'op1', role: 'warehouse_staff', name: 'Olga Operator', hubId: hub.id, tier: 'operator' });
const supervisor = (): Actor => ({ id: 'sup1', role: 'warehouse_staff', name: 'Sam Supervisor', hubId: hub.id, tier: 'supervisor' });
const otherStaff = (): Actor => ({ id: 'op2', role: 'warehouse_staff', name: 'Otto Other', hubId: other.id, tier: 'manager' });
const ops = (): Actor => ({ id: 'ad1', role: 'admin_operations', name: 'Ola Ops', hubId: null, tier: null });
const finance = (): Actor => ({ id: 'ad2', role: 'admin_finance', name: 'Fay Finance', hubId: null, tier: null });

beforeEach(async () => {
  w = await commerceWorld();
  listener = null;
  const logistics = { registerListener: (fn: (e: LogisticsEvent) => void | Promise<void>) => void (listener = fn) };
  svc = new WarehouseStockService(
    w.ds.getRepository(WarehouseBin),
    w.ds.getRepository(WarehouseStock),
    w.ds.getRepository(WarehouseLedger),
    w.ds.getRepository(DeliveryTask),
    w.ds.getRepository(Hub),
    w.ds.getRepository(Product),
    w.products,
    logistics as never,
    w.emitter as never,
  );
  svc.onModuleInit();
  hub = await w.ds.getRepository(Hub).save(w.ds.getRepository(Hub).create({ name: 'Kinshasa', city: 'Kinshasa' }));
  other = await w.ds.getRepository(Hub).save(w.ds.getRepository(Hub).create({ name: 'Goma', city: 'Goma' }));
  const shop = await w.store('Kinshasa Traders', 'u-kt');
  phone = await w.product(shop, { name: 'Phone case', stock: 5 });
});
afterEach(async () => w.ds.destroy());

const bin = async (code: string, who: Actor = supervisor()) => svc.createBin(who, { code });
const rows = () => w.ds.getRepository(WarehouseStock).find({ order: { binId: 'ASC' } });
const lines = () => w.ds.getRepository(WarehouseLedger).find({ order: { createdAt: 'ASC', id: 'ASC' } });
const inBin = async (b: WarehouseBin, p: Product = phone, variant = 'Default') =>
  (await w.ds.getRepository(WarehouseStock).findOne({ where: { binId: b.id, productId: p.id, variant } }))?.qty ?? 0;
const refused = async (p: Promise<unknown>, text: string | RegExp) => {
  const err = await p.then(() => null, (e: Error) => e);
  expect(err).toBeInstanceOf(Error);
  expect(err?.message).toMatch(text);
};

/** Rebuild what every bin should hold by replaying the ledger. This is the definition of "the stock is the sum of the ledger". */
async function replay(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const add = (binId: string | null, p: string, v: string, n: number) => {
    if (!binId) return;
    const k = `${binId}|${p}|${v}`;
    out.set(k, (out.get(k) ?? 0) + n);
  };
  for (const l of await lines()) {
    if (l.kind === 'receive') add(l.toBinId, l.productId, l.variant, l.qty);
    else if (l.kind === 'stock_out') add(l.fromBinId, l.productId, l.variant, -l.qty);
    else if (l.kind === 'move') {
      add(l.fromBinId, l.productId, l.variant, -l.qty);
      add(l.toBinId, l.productId, l.variant, l.qty);
    } else add(l.toBinId, l.productId, l.variant, l.delta);
  }
  return out;
}
async function expectStockEqualsLedger() {
  const want = await replay();
  const have = new Map((await rows()).map((r) => [`${r.binId}|${r.productId}|${r.variant}`, r.qty]));
  for (const [k, n] of want) expect([k, have.get(k) ?? 0]).toEqual([k, n]);
  for (const [k, n] of have) expect([k, want.get(k) ?? 0]).toEqual([k, n]);
}

describe('input rules', () => {
  it('units are whole numbers from 1', () => {
    expect(units('5')).toBe(5);
    for (const bad of [0, -1, 1.5, 'x', null, 2_000_000]) expect(() => units(bad)).toThrow(BadRequestException);
  });
  it('a bin code is upper-cased and limited to label characters', () => {
    expect(binCode(' a-01/3 ')).toBe('A-01/3');
    for (const bad of ['', ' ', 'A B', 'A;DROP', '-A', 'x'.repeat(41)]) expect(() => binCode(bad)).toThrow(BadRequestException);
  });
  it('the SKU label is the one the desk already shows', () => {
    expect(skuOf('abcdef12-0000')).toBe('SKU-abcdef');
  });
});

describe('ledger arithmetic', () => {
  it('receive, move, stock out and count keep stock = the sum of the ledger, line by line', async () => {
    const a = await bin('A-01');
    const b = await bin('B-02');
    const r = await svc.receive(operator(), { productId: phone.id, qty: 10, binCode: 'a-01' });
    expect(r).toMatchObject({ kind: 'receive', reason: 'manual_receipt', qty: 10, delta: 10, onHandAfter: 10, toBinCode: 'A-01', actorId: 'op1', actorName: 'Olga Operator' });
    const m = await svc.move(operator(), { productId: phone.id, qty: 4, fromBinId: a.id, toBinId: b.id });
    expect(m).toMatchObject({ kind: 'move', delta: 0, qty: 4, onHandAfter: 10, fromBinCode: 'A-01', toBinCode: 'B-02' });
    const o = await svc.stockOut(operator(), { productId: phone.id, qty: 3, binId: a.id, reason: 'damaged', note: 'dropped' });
    expect(o).toMatchObject({ kind: 'stock_out', delta: -3, onHandAfter: 7, reason: 'damaged', fromBinCode: 'A-01' });
    expect([await inBin(a), await inBin(b)]).toEqual([3, 4]);
    const c = await svc.count(supervisor(), { binId: b.id, lines: [{ productId: phone.id, counted: 6, expected: 4 }] });
    expect(c.totalVariance).toBe(2);
    expect(c.lines[0]).toMatchObject({ expected: 4, counted: 6, variance: 2 });
    expect([await inBin(a), await inBin(b)]).toEqual([3, 6]);
    expect((await lines()).map((l) => [l.kind, l.delta, l.onHandAfter])).toEqual([['receive', 10, 10], ['move', 0, 10], ['stock_out', -3, 7], ['count', 2, 9]]);
    await expectStockEqualsLedger();
  });

  it('holds over a long random run of operations (the stock never drifts from the ledger and never goes negative)', async () => {
    const bins = [await bin('A-1'), await bin('A-2'), await bin('A-3')];
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let i = 0; i < 80; i++) {
      const x = bins[rnd(3)];
      const y = bins[rnd(3)];
      const n = 1 + rnd(6);
      const pick = rnd(4);
      try {
        if (pick === 0) await svc.receive(operator(), { productId: phone.id, qty: n, binId: x.id });
        else if (pick === 1) await svc.move(operator(), { productId: phone.id, qty: n, fromBinId: x.id, toBinId: y.id });
        else if (pick === 2) await svc.stockOut(operator(), { productId: phone.id, qty: n, binId: x.id, reason: 'lost' });
        else await svc.count(supervisor(), { binId: x.id, lines: [{ productId: phone.id, counted: rnd(9) }] });
      } catch (e) {
        expect(e).toBeInstanceOf(BadRequestException); // a refusal, never a crash
      }
    }
    expect((await rows()).every((r) => r.qty >= 0)).toBe(true);
    await expectStockEqualsLedger();
    const last = (await lines()).filter((l) => l.productId === phone.id).pop()!;
    const total = (await rows()).reduce((s, r) => s + r.qty, 0);
    expect(last.onHandAfter).toBe(total);
  });
});

describe('negative stock is refused', () => {
  it('a stock-out, a move and a negative count never take a bin below zero, and write nothing when refused', async () => {
    const a = await bin('A-01');
    const b = await bin('B-02');
    await svc.receive(operator(), { productId: phone.id, qty: 5, binId: a.id });
    const before = (await lines()).length;
    await refused(svc.stockOut(operator(), { productId: phone.id, qty: 6, binId: a.id, reason: 'lost' }), 'Bin A-01 holds only 5 of Phone case: you cannot take 6.');
    await refused(svc.stockOut(operator(), { productId: phone.id, qty: 1, binId: b.id, reason: 'lost' }), 'Bin B-02 holds no Phone case.');
    await refused(svc.move(operator(), { productId: phone.id, qty: 9, fromBinId: a.id, toBinId: b.id }), /only 5/);
    await refused(svc.count(supervisor(), { binId: a.id, lines: [{ productId: phone.id, counted: -1 }] }), /Enter the counted number/);
    expect(await inBin(a)).toBe(5);
    expect(await inBin(b)).toBe(0);
    expect((await lines()).length).toBe(before);
  });

  it('a refused line in a multi-line operation rolls back the lines before it', async () => {
    const shop = await w.store('Second Shop', 'u-2');
    const cable = await w.product(shop, { name: 'Cable', stock: 5 });
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 5, binId: a.id });
    await refused(
      svc.count(supervisor(), { binId: a.id, lines: [{ productId: phone.id, counted: 9, expected: 5 }, { productId: cable.id, counted: 2, expected: 4 }] }),
      /changed while you were counting/,
    );
    expect(await inBin(a)).toBe(5); // the first line was rolled back with the second
    expect((await lines()).length).toBe(1);
  });

  it('the database itself refuses a negative quantity (CHECK), even if the service were bypassed', async () => {
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 2, binId: a.id });
    await expect(w.ds.query(`UPDATE warehouse_stock SET qty = qty - 3`)).rejects.toThrow(/CHECK|constraint/i);
    expect(await inBin(a)).toBe(2);
  });
});

describe('ledger ids', () => {
  it('sort in the order they were made, even inside one millisecond, and look like UUIDs', () => {
    const ids = Array.from({ length: 50 }, () => ledgerId(1_800_000_000_000));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(ledgerId(1_800_000_000_001) > ids[49]).toBe(true);
  });
});

describe('concurrency', () => {
  it('the decrease itself is one conditional UPDATE: twelve takers racing with no transaction around them still cannot overdraw a bin', async () => {
    // This is the guard that keeps MySQL correct when many transactions run at once (SQLite serialises them above it).
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 10, binId: a.id });
    const take = (n: number) => (svc as unknown as { takeFrom: (m: unknown, h: string, b: WarehouseBin, p: string, v: string, n: number, name: string) => Promise<void> }).takeFrom(w.ds.manager, hub.id, a, phone.id, 'Default', n, 'Phone case');
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => take(3)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    expect(await inBin(a)).toBe(1);
  });

  it('ten people taking 3 units each from a bin of 10: exactly three succeed, the bin ends at 1, never negative', async () => {
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 10, binId: a.id });
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => svc.stockOut(operator(), { productId: phone.id, qty: 3, binId: a.id, reason: 'sample' })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(3);
    for (const r of results.filter((x) => x.status === 'rejected')) expect((r as PromiseRejectedResult).reason.message).toMatch(/holds only|holds no/);
    expect(await inBin(a)).toBe(1);
    expect((await lines()).filter((l) => l.kind === 'stock_out')).toHaveLength(3);
    await expectStockEqualsLedger();
  });

  it('a move racing a stock-out for the same last units: one wins, the other is refused, nothing is lost or invented', async () => {
    const a = await bin('A-01');
    const b = await bin('B-02');
    await svc.receive(operator(), { productId: phone.id, qty: 5, binId: a.id });
    const results = await Promise.allSettled([
      svc.move(operator(), { productId: phone.id, qty: 5, fromBinId: a.id, toBinId: b.id }),
      svc.stockOut(operator(), { productId: phone.id, qty: 5, binId: a.id, reason: 'lost' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await rows()).reduce((s, r) => s + r.qty, 0)).toBe((await lines()).pop()!.onHandAfter);
    await expectStockEqualsLedger();
  });

  it('many receipts into a bin that has no row yet all land (no lost update, no duplicate row)', async () => {
    const a = await bin('A-01');
    await Promise.all(Array.from({ length: 12 }, () => svc.receive(operator(), { productId: phone.id, qty: 2, binId: a.id })));
    expect(await inBin(a)).toBe(24);
    expect(await w.ds.getRepository(WarehouseStock).count()).toBe(1);
    await expectStockEqualsLedger();
  });

  it('the same request sent five times at once is recorded once', async () => {
    const a = await bin('A-01');
    const out = await Promise.all(Array.from({ length: 5 }, () => svc.receive(operator(), { productId: phone.id, qty: 7, binId: a.id, clientRef: 'tap-1' })));
    expect(new Set(out.map((l) => l.id)).size).toBe(1);
    expect(await inBin(a)).toBe(7);
    expect(await lines()).toHaveLength(1);
  });
});

describe('deadlock retry (MySQL)', () => {
  const retry = <T>(fn: () => Promise<T>) => (svc as unknown as { withDeadlockRetry: (f: () => Promise<T>) => Promise<T> }).withDeadlockRetry(fn);
  it('runs a rolled-back transaction again until it goes through', async () => {
    let calls = 0;
    const out = await retry(async () => {
      calls += 1;
      if (calls < 3) throw Object.assign(new Error('Deadlock found when trying to get lock'), { code: 'ER_LOCK_DEADLOCK', errno: 1213 });
      return 'done';
    });
    expect([out, calls]).toEqual(['done', 3]);
  });
  it('reads the error code from the driver error too, and gives up after four tries', async () => {
    let calls = 0;
    await expect(retry(async () => { calls += 1; throw Object.assign(new Error('QueryFailed'), { driverError: { errno: 1205 } }); })).rejects.toThrow('QueryFailed');
    expect(calls).toBe(4);
  });
  it('never repeats a real failure', async () => {
    let calls = 0;
    await expect(retry(async () => { calls += 1; throw new BadRequestException('Bin A-01 holds no Phone case.'); })).rejects.toThrow('holds no');
    expect(calls).toBe(1);
  });
});

describe('idempotent requests', () => {
  it('a retried receive, move and stock-out with the same reference change nothing the second time', async () => {
    const a = await bin('A-01');
    const b = await bin('B-02');
    await svc.receive(operator(), { productId: phone.id, qty: 10, binId: a.id, clientRef: 'r1' });
    await svc.receive(operator(), { productId: phone.id, qty: 10, binId: a.id, clientRef: 'r1' });
    await svc.move(operator(), { productId: phone.id, qty: 2, fromBinId: a.id, toBinId: b.id, clientRef: 'm1' });
    await svc.move(operator(), { productId: phone.id, qty: 2, fromBinId: a.id, toBinId: b.id, clientRef: 'm1' });
    await svc.stockOut(operator(), { productId: phone.id, qty: 1, binId: a.id, reason: 'lost', clientRef: 'o1' });
    await svc.stockOut(operator(), { productId: phone.id, qty: 1, binId: a.id, reason: 'lost', clientRef: 'o1' });
    expect([await inBin(a), await inBin(b)]).toEqual([7, 2]);
    expect(await lines()).toHaveLength(3);
  });

  it('a reference from another warehouse cannot be replayed here', async () => {
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 1, binId: a.id, clientRef: 'shared' });
    await refused(svc.receive(otherStaff(), { productId: phone.id, qty: 1, clientRef: 'shared' }), 'This request reference was already used.');
  });
});

describe('bins', () => {
  it('codes are unique per warehouse whatever the case, but another warehouse may reuse them', async () => {
    await bin('A-01');
    await refused(bin('a-01'), 'Bin A-01 already exists in this warehouse.');
    await expect(svc.createBin(otherStaff(), { code: 'A-01' })).resolves.toMatchObject({ hubId: other.id, code: 'A-01' });
  });

  it('receiving with no bin goes to the receiving area, created on first use', async () => {
    const r = await svc.receive(operator(), { productId: phone.id, qty: 3 });
    expect(r.toBinCode).toBe('RECV');
    expect((await svc.listBins(operator())).map((x) => [x.code, x.units, x.skus])).toEqual([['RECV', 3, 1]]);
  });

  it('an unknown bin code is refused with a way forward, and a switched-off bin takes no stock', async () => {
    await refused(svc.receive(operator(), { productId: phone.id, qty: 1, binCode: 'NOPE' }), 'That bin does not exist in this warehouse. Ask a supervisor to create it.');
    const a = await bin('A-01');
    await svc.updateBin(supervisor(), { binId: a.id, active: false });
    await refused(svc.receive(operator(), { productId: phone.id, qty: 1, binId: a.id }), 'Bin A-01 is switched off. Choose another bin.');
  });

  it('a bin that holds stock cannot be switched off, and the receiving area never can', async () => {
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 2, binId: a.id });
    await refused(svc.updateBin(supervisor(), { binId: a.id, active: false }), 'Bin A-01 still holds stock. Move it or count it out first.');
    const recv = await svc.receive(operator(), { productId: phone.id, qty: 1 });
    await refused(svc.updateBin(supervisor(), { binId: recv.toBinId, active: false }), 'The receiving area cannot be switched off.');
  });

  it('a bin of another warehouse is not found', async () => {
    const mine = await bin('A-01');
    await expect(svc.receive(otherStaff(), { productId: phone.id, qty: 1, binId: mine.id })).rejects.toThrow('That bin does not exist in this warehouse.');
  });
});

describe('who may do what', () => {
  it('an operator receives, moves and stocks out but cannot count or create bins; a supervisor can', async () => {
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 5, binId: a.id });
    await refused(svc.count(operator(), { binId: a.id, lines: [{ productId: phone.id, counted: 1 }] }), 'Only supervisors and managers can do this.');
    await refused(svc.createBin(operator(), { code: 'Z-9' }), 'Only supervisors and managers can do this.');
    await expect(svc.count(supervisor(), { binId: a.id, lines: [{ productId: phone.id, counted: 5 }] })).resolves.toMatchObject({ totalVariance: 0 });
  });

  it('staff work in their own warehouse whatever hubId they send', async () => {
    await svc.receive(operator(), { productId: phone.id, qty: 5, hubId: other.id });
    expect((await lines())[0].hubId).toBe(hub.id);
    expect((await svc.onHand(otherStaff(), { hubId: hub.id })).rows).toEqual([]);
    expect((await svc.onHand(operator(), {})).rows).toHaveLength(1);
  });

  it('an admin must name the warehouse to change stock; only admin and operations admin may; others read', async () => {
    await refused(svc.receive(ops(), { productId: phone.id, qty: 1 }), 'Choose a warehouse first.');
    await expect(svc.receive(ops(), { productId: phone.id, qty: 1, hubId: other.id })).resolves.toMatchObject({ hubId: other.id });
    await expect(svc.receive({ ...ops(), role: 'admin' }, { productId: phone.id, qty: 1, hubId: other.id })).resolves.toBeDefined();
    await refused(svc.receive(finance(), { productId: phone.id, qty: 1, hubId: other.id }), 'Only operations administrators and warehouse staff can change warehouse stock.');
    // Reading stock is the warehouse desk's too (super admin, operations): finance and the other departments are refused.
    for (const who of [finance(), { ...finance(), role: 'admin_marketing' }, { ...finance(), role: 'admin_support' }, { ...finance(), role: 'admin_moderation' }]) {
      await refused(svc.onHand(who, {}), 'Only operations admins and warehouse staff can work the warehouse desk.');
      await refused(svc.listBins(who, {}), 'Only operations admins and warehouse staff can work the warehouse desk.');
    }
    await expect(svc.onHand(ops(), {})).resolves.toMatchObject({ units: 2 });
    await expect(svc.onHand({ ...ops(), role: 'admin' }, {})).resolves.toMatchObject({ units: 2 });
    await refused(svc.receive(ops(), { productId: phone.id, qty: 1, hubId: 'nope' }), 'Warehouse not found.');
  });

  it('stock:updated is pushed to the warehouse and the desk admins only, not to every admin department', async () => {
    await svc.receive(ops(), { productId: phone.id, qty: 1, hubId: hub.id });
    const sent = w.emitter.sent.filter((e) => e.event === 'stock:updated').map((e) => e.to);
    expect(sent).toEqual([`hub:${hub.id}`, 'admin,admin_operations']);
  });

  it('riders, customers and sellers have no access', async () => {
    for (const role of ['rider', 'customer', 'seller']) {
      const a: Actor = { id: 'x', role, name: 'X', hubId: hub.id, tier: 'manager' };
      await refused(svc.receive(a, { productId: phone.id, qty: 1 }), 'Staff only.');
      await refused(svc.onHand(a, {}), 'Staff only.');
    }
  });

  it('a staff account with no warehouse is refused', async () => {
    await refused(svc.onHand({ ...operator(), hubId: null }, {}), 'Your account is not linked to a warehouse.');
  });
});

describe('products and options', () => {
  it('an unknown or removed product is refused', async () => {
    await refused(svc.receive(operator(), { productId: 'nope', qty: 1 }), 'Product not found.');
  });

  it('a product with options must name a real option, and each option is its own SKU line', async () => {
    const shop = await w.store('Tees', 'u-t');
    const tee = await w.product(shop, { name: 'T-shirt', stock: undefined, variants: [{ name: 'Size', options: ['S', 'M'] }], variantStock: { [SIZE_S]: 5, [SIZE_M]: 5 } });
    await refused(svc.receive(operator(), { productId: tee.id, qty: 1 }), /Choose a size/);
    await refused(svc.receive(operator(), { productId: tee.id, qty: 1, variant: 'Size: XL' }), /Choose a size/);
    await svc.receive(operator(), { productId: tee.id, qty: 4, variant: 'size: s' });
    await svc.receive(operator(), { productId: tee.id, qty: 2, variant: SIZE_M });
    const res = await svc.onHand(operator(), { productId: tee.id });
    expect(res.rows.map((r) => [r.variant, r.onHand])).toEqual([[SIZE_M, 2], [SIZE_S, 4]]);
  });
});

describe('cycle count', () => {
  it('writes the variance, a line even when nothing differs, and an audit line when stock changed', async () => {
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 10, binId: a.id });
    const none = await svc.count(supervisor(), { binId: a.id, lines: [{ productId: phone.id, counted: 10 }] });
    expect(none.totalVariance).toBe(0);
    expect(await w.ds.getRepository(AuditLog).count({ where: { action: 'stock.count' } })).toBe(0);
    const short = await svc.count(supervisor(), { binId: a.id, note: 'two broken', lines: [{ productId: phone.id, counted: 8 }] });
    expect(short.lines[0]).toMatchObject({ expected: 10, counted: 8, variance: -2 });
    expect(await inBin(a)).toBe(8);
    const logged = await w.ds.getRepository(AuditLog).find({ where: { action: 'stock.count' } });
    expect(logged).toHaveLength(1);
    expect(logged[0].detail).toContain('variance -2');
    const hist = await svc.history(supervisor(), { kind: 'count' });
    expect(hist.map((h) => [h.delta, h.expectedQty, h.countedQty])).toEqual([[-2, 10, 8], [0, 10, 10]]);
  });

  it('counting stock that the system did not know about adds it; counting 0 empties the line', async () => {
    const a = await bin('A-01');
    await svc.count(supervisor(), { binId: a.id, lines: [{ productId: phone.id, counted: 4 }] });
    expect(await inBin(a)).toBe(4);
    await svc.count(supervisor(), { binId: a.id, lines: [{ productId: phone.id, counted: 0 }] });
    expect(await inBin(a)).toBe(0);
    await expectStockEqualsLedger();
  });

  it('is refused when the bin changed since the counter looked, instead of overwriting the movement', async () => {
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 10, binId: a.id });
    await svc.stockOut(operator(), { productId: phone.id, qty: 1, binId: a.id, reason: 'sample' });
    await refused(svc.count(supervisor(), { binId: a.id, lines: [{ productId: phone.id, counted: 10, expected: 10 }] }), 'Phone case in bin A-01 changed while you were counting (now 9). Refresh and count again.');
    expect(await inBin(a)).toBe(9);
  });

  it('rejects an empty sheet, a missing number and a product listed twice', async () => {
    const a = await bin('A-01');
    await refused(svc.count(supervisor(), { binId: a.id, lines: [] }), 'Count between 1 and 200 lines.');
    await refused(svc.count(supervisor(), { binId: a.id, lines: [{ productId: phone.id }] }), 'Enter the counted number of Phone case');
    await refused(svc.count(supervisor(), { binId: a.id, lines: [{ productId: phone.id, counted: 1 }, { productId: phone.id, counted: 2 }] }), 'Phone case is on the sheet twice.');
  });

  it('a retried count with the same reference is recorded once', async () => {
    const a = await bin('A-01');
    await svc.count(supervisor(), { binId: a.id, clientRef: 'c1', lines: [{ productId: phone.id, counted: 3 }] });
    const again = await svc.count(supervisor(), { binId: a.id, clientRef: 'c1', lines: [{ productId: phone.id, counted: 3 }] });
    expect(again.totalVariance).toBe(3);
    expect(await inBin(a)).toBe(3);
    expect(await lines()).toHaveLength(1);
  });
});

describe('stock out by hand', () => {
  it('needs one of the listed reasons, and a note for "other"', async () => {
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 5, binId: a.id });
    await refused(svc.stockOut(operator(), { productId: phone.id, qty: 1, binId: a.id, reason: 'sale' }), /Reason must be one of/);
    await refused(svc.stockOut(operator(), { productId: phone.id, qty: 1, binId: a.id, reason: 'other' }), 'Say why the stock is leaving in the note.');
    await expect(svc.stockOut(operator(), { productId: phone.id, qty: 1, binId: a.id, reason: 'other', note: 'given to the ministry' })).resolves.toBeDefined();
  });
});

// ── parcels (custody) ─────────────────────────────────────────────────────────
const parcel = (over: Partial<DeliveryTask> = {}) =>
  w.ds.getRepository(DeliveryTask).save(
    w.ds.getRepository(DeliveryTask).create({
      orderId: 'order-1',
      orderReference: 'ORD-1',
      kind: 'pickup',
      status: 'delivered',
      toHubId: hub.id,
      hubId: hub.id,
      itemsJson: JSON.stringify([{ productId: phone.id, name: 'Phone case', qty: 6 }]),
      ...over,
    }),
  );

describe('receiving from a scanned parcel', () => {
  it('locks the parcel row inside the transaction before reading what is already stocked (two people cannot double the stock)', async () => {
    const a = await bin('A-lock');
    const t = await parcel();
    const order: string[] = [];
    const priv = svc as unknown as { lockTask: (m: unknown, id: string) => Promise<void>; stockedOf: (...a: unknown[]) => Promise<unknown> };
    const realStocked = priv.stockedOf.bind(svc);
    const lock = jest.spyOn(priv, 'lockTask').mockImplementation(async () => void order.push('lock'));
    jest.spyOn(priv, 'stockedOf').mockImplementation((...args: unknown[]) => (order.push('read'), realStocked(...args)));
    await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id });
    expect(lock).toHaveBeenCalledWith(expect.anything(), t.id);
    expect(order.slice(0, 2)).toEqual(['lock', 'read']);
  });

  it('shows what the parcel carries and puts it away, once, with the parcel and the order on every line', async () => {
    const a = await bin('A-01');
    const t = await parcel();
    const view = await svc.parcel(operator(), { taskId: t.id });
    expect(view).toMatchObject({ canReceive: true, atHub: true, lines: [{ productId: phone.id, qty: 6, stocked: 0, remaining: 6, sku: skuOf(phone.id) }] });
    const res = await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id });
    expect(res.lines).toHaveLength(1);
    expect(res.lines[0]).toMatchObject({ reason: 'parcel', qty: 6, taskId: t.id, orderId: 'order-1', toBinCode: 'A-01' });
    expect(await inBin(a)).toBe(6);
    expect((await svc.parcel(operator(), { taskId: t.id })).lines[0]).toMatchObject({ stocked: 6, remaining: 0 });
    await refused(svc.receiveParcel(operator(), { taskId: t.id, binId: a.id }), 'Everything on this parcel is already in stock.');
    expect(await inBin(a)).toBe(6);
  });

  it('can be put away in parts, never more than the parcel carries', async () => {
    const a = await bin('A-01');
    const t = await parcel();
    await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id, lines: [{ productId: phone.id, qty: 4 }] });
    await refused(svc.receiveParcel(operator(), { taskId: t.id, binId: a.id, lines: [{ productId: phone.id, qty: 3 }] }), 'This parcel carries 2 more of Phone case: you cannot put away 3.');
    await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id, lines: [{ productId: phone.id, qty: 2 }] });
    expect(await inBin(a)).toBe(6);
  });

  it('two people putting the same parcel away at the same moment cannot double-count it', async () => {
    const a = await bin('A-01');
    const t = await parcel();
    const results = await Promise.allSettled([svc.receiveParcel(operator(), { taskId: t.id, binId: a.id }), svc.receiveParcel(supervisor(), { taskId: t.id, binId: a.id })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await inBin(a)).toBe(6);
  });

  it('is refused before the parcel is scanned in, for a parcel at another warehouse, and for a leg a rider finishes', async () => {
    const t = await parcel({ status: 'in_transit' });
    expect(await svc.parcel(operator(), { taskId: t.id })).toMatchObject({ canReceive: false });
    await refused(svc.receiveParcel(operator(), { taskId: t.id }), 'Scan the parcel in before putting it away.');
    const away = await parcel({ toHubId: other.id });
    await refused(svc.receiveParcel(operator(), { taskId: away.id }), 'This parcel is not at your warehouse.');
    await refused(svc.parcel(operator(), { taskId: away.id }), 'This parcel is not at your warehouse.');
    const delivery = await parcel({ kind: 'delivery', status: 'delivered' });
    await refused(svc.receiveParcel(operator(), { taskId: delivery.id }), 'This parcel is not at your warehouse.');
  });

  it('a line that is not on the parcel is refused; a parcel with no product lines points to a manual receipt', async () => {
    const t = await parcel();
    await refused(svc.receiveParcel(operator(), { taskId: t.id, lines: [{ productId: 'other', qty: 1 }] }), 'One of those lines is not on this parcel.');
    const bare = await parcel({ itemsJson: JSON.stringify([{ name: 'Mystery', qty: 2 }]) });
    await refused(svc.receiveParcel(operator(), { taskId: bare.id }), /Use a manual receipt/);
  });

  it('custody itself is untouched: the task row is exactly what it was', async () => {
    const t = await parcel();
    const before = JSON.stringify(await w.ds.getRepository(DeliveryTask).findOneBy({ id: t.id }));
    await svc.receiveParcel(operator(), { taskId: t.id });
    expect(JSON.stringify(await w.ds.getRepository(DeliveryTask).findOneBy({ id: t.id }))).toBe(before);
  });
});

describe('stock out on dispatch', () => {
  const leaving = (over: Partial<DeliveryTask> = {}) => parcel({ kind: 'delivery', status: 'picked_up', fromHubId: hub.id, toHubId: null, ...over });

  it('takes what the order put away from the bins that hold it, once, however often it is told', async () => {
    const a = await bin('A-01');
    const b = await bin('B-02');
    const t = await parcel();
    await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id });
    await svc.move(operator(), { productId: phone.id, qty: 2, fromBinId: a.id, toBinId: b.id });
    const d = await leaving();
    const out = await svc.dispatched(d);
    expect(out.reduce((s, l) => s + l.qty, 0)).toBe(6);
    expect(out.every((l) => l.kind === 'stock_out' && l.reason === 'dispatch' && l.taskId === d.id && l.orderId === 'order-1')).toBe(true);
    expect([await inBin(a), await inBin(b)]).toEqual([0, 0]);
    expect(await svc.dispatched(d)).toEqual([]); // told again: nothing more
    expect((await lines()).filter((l) => l.reason === 'dispatch').reduce((s, l) => s + l.qty, 0)).toBe(6);
    await expectStockEqualsLedger();
  });

  it('listens to the logistics events: a picked_up delivery stocks out, other events and kinds do not', async () => {
    const a = await bin('A-01');
    const t = await parcel();
    await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id });
    const d = await leaving();
    await listener!({ type: 'assigned', task: d });
    await listener!({ type: 'delivered', task: d });
    await listener!({ type: 'picked_up', task: await leaving({ kind: 'pickup', fromHubId: null }) });
    expect(await inBin(a)).toBe(6);
    await listener!({ type: 'picked_up', task: d });
    expect(await inBin(a)).toBe(0);
  });

  it('never takes stock that belongs to another order or another SKU', async () => {
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 20, binId: a.id }); // loose stock, no order
    const t = await parcel();
    await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id });
    await svc.dispatched(await leaving());
    expect(await inBin(a)).toBe(20);
    const mine = await leaving({ orderId: 'order-2', orderReference: 'ORD-2' });
    expect(await svc.dispatched(mine)).toEqual([]);
  });

  it('takes only what is on the shelves and never fails the dispatch', async () => {
    const a = await bin('A-01');
    const t = await parcel();
    await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id });
    await svc.count(supervisor(), { binId: a.id, lines: [{ productId: phone.id, counted: 2 }] }); // four went missing
    const out = await svc.dispatched(await leaving());
    expect(out.reduce((s, l) => s + l.qty, 0)).toBe(2);
    expect(await inBin(a)).toBe(0);
    expect((await rows()).every((r) => r.qty >= 0)).toBe(true);
  });

  it('a warehouse that tracks no stock is not affected, and a database error is swallowed (custody first)', async () => {
    expect(await svc.dispatched(await leaving())).toEqual([]);
    const broken = Object.create(svc) as WarehouseStockService;
    (broken as unknown as { ledgerRepo: unknown }).ledgerRepo = { exist: async () => { throw new Error('db down'); } };
    await expect(broken.dispatched(await leaving())).resolves.toEqual([]);
  });

  it('a transfer takes only the products it carries', async () => {
    const shop = await w.store('Cables', 'u-c');
    const cable = await w.product(shop, { name: 'Cable', stock: 5 });
    const a = await bin('A-01');
    const t = await parcel({ itemsJson: JSON.stringify([{ productId: phone.id, name: 'Phone case', qty: 2 }, { productId: cable.id, name: 'Cable', qty: 3 }]) });
    await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id });
    const transfer = await parcel({ kind: 'transfer', status: 'picked_up', fromHubId: hub.id, toHubId: other.id, itemsJson: JSON.stringify([{ productId: cable.id, name: 'Cable', qty: 3 }]) });
    await svc.dispatched(transfer);
    expect(await inBin(a, cable)).toBe(0);
    expect(await inBin(a, phone)).toBe(2);
  });
});

describe('stock out on dispatch: a split order\'s partial customer leg', () => {
  const leaving = (over: Partial<DeliveryTask> = {}) => parcel({ kind: 'delivery', status: 'picked_up', fromHubId: hub.id, toHubId: null, ...over });

  it('takes only the products the leg carries; the parcel still waiting stays on the shelves', async () => {
    const shop = await w.store('Cables', 'u-c');
    const cable = await w.product(shop, { name: 'Cable', stock: 5 });
    const a = await bin('A-01');
    const t = await parcel({ itemsJson: JSON.stringify([{ productId: phone.id, name: 'Phone case', qty: 2 }, { productId: cable.id, name: 'Cable', qty: 3 }]) });
    await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id });
    // the leg carries the cable seller's parcel only (`sellerIds` set): the phone cases are still waiting for the rest of the order
    const partial = await leaving({ sellerIds: ['u-c'], itemsJson: JSON.stringify([{ productId: cable.id, name: 'Cable', qty: 3 }]) });
    const out = await svc.dispatched(partial);
    expect(out.map((l) => [l.productId, l.qty])).toEqual([[cable.id, 3]]);
    expect(await inBin(a, cable)).toBe(0);
    expect(await inBin(a, phone)).toBe(2);
  });

  it('a leg with no sellerIds (the whole order) still takes everything the order put away here', async () => {
    const a = await bin('A-01');
    const t = await parcel();
    await svc.receiveParcel(operator(), { taskId: t.id, binId: a.id });
    await svc.dispatched(await leaving({ sellerIds: null }));
    expect(await inBin(a)).toBe(0);
  });
});

describe('reading', () => {
  it('on hand by SKU and bin, with search by name or SKU label, and totals', async () => {
    const shop = await w.store('Cables', 'u-c');
    const cable = await w.product(shop, { name: 'USB Cable', stock: 5 });
    const a = await bin('A-01');
    const b = await bin('B-02');
    await svc.receive(operator(), { productId: phone.id, qty: 6, binId: a.id });
    await svc.move(operator(), { productId: phone.id, qty: 2, fromBinId: a.id, toBinId: b.id });
    await svc.receive(operator(), { productId: cable.id, qty: 9, binId: b.id });
    const all = await svc.onHand(operator(), {});
    expect(all).toMatchObject({ total: 2, units: 15 });
    const row = all.rows.find((r) => r.productId === phone.id)!;
    expect(row).toMatchObject({ sku: skuOf(phone.id), name: 'Phone case', onHand: 6, variant: 'Default' });
    expect(row.bins).toEqual([{ binId: a.id, code: 'A-01', qty: 4 }, { binId: b.id, code: 'B-02', qty: 2 }]);
    expect((await svc.onHand(operator(), { search: 'cable' })).rows.map((r) => r.name)).toEqual(['USB Cable']);
    expect((await svc.onHand(operator(), { search: skuOf(phone.id) })).rows.map((r) => r.name)).toEqual(['Phone case']);
    expect((await svc.onHand(operator(), { binId: b.id })).rows).toHaveLength(2);
    expect((await svc.onHand(operator(), { search: 'zzz' })).rows).toEqual([]);
    expect((await svc.onHand(operator(), { limit: 1 })).rows).toHaveLength(1);
  });

  it('the history of one SKU is its ledger, newest first, with names and who did it', async () => {
    const a = await bin('A-01');
    await svc.receive(operator(), { productId: phone.id, qty: 6, binId: a.id });
    await svc.stockOut(supervisor(), { productId: phone.id, qty: 1, binId: a.id, reason: 'damaged' });
    const h = await svc.history(operator(), { productId: phone.id });
    expect(h.map((x) => [x.kind, x.actorName, x.name, x.sku])).toEqual([['stock_out', 'Sam Supervisor', 'Phone case', skuOf(phone.id)], ['receive', 'Olga Operator', 'Phone case', skuOf(phone.id)]]);
    expect(await svc.history(operator(), { productId: phone.id, kind: 'receive' })).toHaveLength(1);
    expect(await svc.history(otherStaff(), { productId: phone.id })).toEqual([]);
  });

  it('lookup finds a bin by its scanned code and a product by name, SKU label or id prefix', async () => {
    await bin('A-01');
    const byCode = await svc.lookup(operator(), { code: 'a-01' });
    expect(byCode.bin).toMatchObject({ code: 'A-01' });
    expect((await svc.lookup(operator(), { code: 'phone' })).products[0]).toMatchObject({ productId: phone.id, variants: ['Default'] });
    expect((await svc.lookup(operator(), { code: skuOf(phone.id) })).products.map((p) => p.productId)).toContain(phone.id);
    expect(await svc.lookup(operator(), { code: '' })).toEqual({ bin: null, products: [] });
    expect((await svc.lookup(operator(), { code: '%' })).products).toEqual([]);
  });

  it('tells the warehouse and the admins when stock changes', async () => {
    await svc.receive(operator(), { productId: phone.id, qty: 1 });
    const sent = w.emitter.sent.filter((s) => s.event === 'stock:updated');
    expect(sent.map((s) => s.to)).toEqual(expect.arrayContaining([`hub:${hub.id}`]));
    expect(sent[0].payload).toMatchObject({ hubId: hub.id, productIds: [phone.id] });
  });
});


describe('a deadlock while creating a stock row', () => {
  it('is rethrown (so the transaction is run again), not turned into "this bin was just updated"', async () => {
    const deadlock = Object.assign(new Error('Deadlock found'), { code: 'ER_LOCK_DEADLOCK', errno: 1213 });
    const m = {
      createQueryBuilder: () => ({ update: () => ({ set: () => ({ where: () => ({ execute: async () => ({ affected: 0 }) }) }) }) }),
      getRepository: () => ({ insert: async () => { throw deadlock; } }),
    };
    const addTo = (svc as unknown as { addTo: (...a: unknown[]) => Promise<void> }).addTo.bind(svc);
    await expect(addTo(m, 'h', 'b', 'p', '', 1)).rejects.toBe(deadlock);
    expect(isLockFailure(deadlock)).toBe(true);
    expect(isLockFailure({ driverError: { errno: 1205 } })).toBe(true);
    expect(isLockFailure(new Error('Duplicate entry'))).toBe(false);
  });
});
