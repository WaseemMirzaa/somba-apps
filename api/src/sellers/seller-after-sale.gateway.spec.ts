import { SellerAfterSaleGateway } from './seller-after-sale.gateway';
import { DisputesGateway } from '../disputes/disputes.gateway';
import { AfterSaleGateway } from '../flows/after-sale.gateway';
import { StaffTierService } from '../logistics/staff-tier.service';

const client = (role: string, id = 'u1') => ({ data: { user: { id, role, name: role } } }) as never;
const echo = () => jest.fn(async (...a: unknown[]) => ({ args: a }));

function make() {
  const access = { defaults: jest.fn(async () => ({ returns: true })), setDefaults: jest.fn(async () => ({ defaults: { returns: true }, changed: ['returns'] })), setStoreAccess: jest.fn(async () => ({ store: { id: 's1' }, seller: { id: 's1', name: 'Shop' }, before: { returns: false, exchanges: false, replacements: false, express: false }, after: { returns: true, exchanges: false, replacements: false, express: false } })) };
  const threads = { list: echo(), send: echo(), markRead: echo(), unread: echo() };
  const audit = { record: jest.fn(async () => undefined) };
  return { access, threads, audit, gw: new SellerAfterSaleGateway(access as never, threads as never, audit as never) };
}

describe('SellerAfterSaleGateway: who switches the sections', () => {
  it('admin, operations and support manage the defaults and the per-store override; everyone else is refused', async () => {
    for (const role of ['admin', 'admin_operations', 'admin_support']) {
      const { gw, access, audit } = make();
      expect(await gw.getDefaults(client(role))).toMatchObject({ ok: true });
      expect(await gw.setDefaults(client(role), { returns: true })).toMatchObject({ ok: true });
      expect(await gw.setStoreAccess(client(role), { sellerId: 's1', returns: true })).toMatchObject({ ok: true });
      expect(access.setDefaults).toHaveBeenCalledTimes(1);
      expect(audit.record).toHaveBeenCalledTimes(2);
      expect(audit.record.mock.calls[0]).toEqual([expect.objectContaining({ action: 'seller.after_sale_defaults', role })]);
    }
    for (const role of ['admin_finance', 'admin_marketing', 'admin_moderation', 'seller', 'customer', 'warehouse_staff', 'rider']) {
      const { gw, access } = make();
      expect(await gw.getDefaults(client(role))).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.setDefaults(client(role), { returns: true })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.setStoreAccess(client(role), { sellerId: 's1', returns: true })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(access.setDefaults).not.toHaveBeenCalled();
      expect(access.setStoreAccess).not.toHaveBeenCalled();
    }
  });

  it('a change that changes nothing is not audited', async () => {
    const { gw, access, audit } = make();
    access.setDefaults.mockResolvedValueOnce({ defaults: { returns: true }, changed: [] } as never);
    await gw.setDefaults(client('admin'), { returns: true });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('thread events pass the caller to the service and answer its errors', async () => {
    const { gw, threads } = make();
    expect(await gw.send(client('seller'), { kind: 'return', caseId: 'r1', text: 'hi' })).toMatchObject({ ok: true });
    expect(threads.send).toHaveBeenCalledWith(expect.objectContaining({ role: 'seller' }), { kind: 'return', caseId: 'r1', text: 'hi' });
    threads.list.mockRejectedValueOnce(new Error('This section is turned off for your store.') as never);
    expect(await gw.list(client('seller'), { kind: 'return', caseId: 'r1' })).toEqual({ ok: false, error: 'This section is turned off for your store.' });
  });
});

describe('the existing case events keep a store with a section off to its own purchases', () => {
  const tiers = () => new StaffTierService({ findOne: jest.fn(async () => ({ warehouseTier: null, hubId: 'h' })) } as never);
  it('a store reader gets the redacted store cases first; a non-reader only its own purchases', async () => {
    const svc = { list: jest.fn(async () => [{ id: 'own' }]), listForStore: jest.fn(async () => [{ id: 'store-case', sellerView: true }]), get: jest.fn(async () => ({ id: 'own' })), getForStore: jest.fn(async () => null) };
    const reader = { readerOf: jest.fn(async () => null) };
    const gw = new DisputesGateway(svc as never, { record: jest.fn() } as never, tiers(), reader as never);
    expect(await gw.returnsList(client('seller'), {})).toEqual({ ok: true, data: [{ id: 'own' }] });
    expect(svc.listForStore).not.toHaveBeenCalled();
    reader.readerOf.mockResolvedValue({ seller: { id: 's1' } } as never);
    expect(await gw.returnsList(client('seller'), {})).toEqual({ ok: true, data: [{ id: 'store-case', sellerView: true }, { id: 'own' }] });
    expect(svc.listForStore).toHaveBeenCalledWith('s1', expect.objectContaining({ type: 'return' }));
    // a case that is not the store's falls back to the account's own purchases (and so to "Dispute not found.")
    expect(await gw.get(client('seller'), { id: 'x' })).toEqual({ ok: true, data: { id: 'own' } });
  });

  it('exchanges and replacements follow the same rule', async () => {
    const mk = () => ({ list: jest.fn(async () => [{ id: 'own' }]), listForStore: jest.fn(async () => [{ id: 'store' }]), get: jest.fn(async () => ({ id: 'own' })), getForStore: jest.fn(async () => ({ id: 'store-one' })), mine: echo(), create: echo(), respond: echo(), setStatus: echo() });
    const rep = mk();
    const exc = mk();
    const reader = { readerOf: jest.fn(async (_u: unknown, kind: string) => (kind === 'exchange' ? { seller: { id: 's1' } } : null)) };
    const gw = new AfterSaleGateway(rep as never, exc as never, tiers(), { record: jest.fn() } as never, reader as never);
    expect(await gw.exchangesList(client('seller'), {})).toEqual({ ok: true, data: [{ id: 'store' }, { id: 'own' }] });
    expect(await gw.exchangesGet(client('seller'), { id: 'e1' })).toEqual({ ok: true, data: { id: 'store-one' } });
    expect(await gw.replacementsList(client('seller'), {})).toEqual({ ok: true, data: [{ id: 'own' }] });
    expect(await gw.replacementsGet(client('seller'), { id: 'r1' })).toEqual({ ok: true, data: { id: 'own' } });
    // no write is ever reachable for a store
    expect(await gw.exchangesRespond(client('seller'), { id: 'e1', approve: true })).toEqual({ ok: false, error: 'Not allowed.' });
    expect(await gw.replacementsRespond(client('seller'), { id: 'r1', approve: true })).toEqual({ ok: false, error: 'Not allowed.' });
    expect(await gw.exchangesSetStatus(client('seller'), { id: 'e1', status: 'approved' })).toMatchObject({ ok: false });
  });
});
