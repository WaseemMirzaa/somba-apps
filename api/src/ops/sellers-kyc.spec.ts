import { SellersService } from './sellers.service';

const UP = (n: number) => `http://localhost:3001/uploads/b5a32395-887e-47f3-9030-2c3b07e3115${n}.png`;
const goodKyc = (over: Record<string, unknown> = {}) => ({
  name: 'Mama Store',
  legalName: 'Mama Store SARL',
  phone: '+243 81 234 5678',
  idNumber: 'ID-123456',
  rccm: 'CD/KIN/RCCM/12345',
  taxNumber: 'A1234567K',
  documentUrls: [UP(0)],
  acceptTerms: true,
  ...over,
});

/** In-memory repositories + recording notifier/emitter: just enough for SellersService moderation flows. */
function setup(seed: { sellers?: Record<string, unknown>[]; products?: Record<string, unknown>[] } = {}) {
  const sellers: Record<string, any>[] = (seed.sellers ?? []).map((s) => ({ ...s }));
  const products: Record<string, any>[] = (seed.products ?? []).map((p) => ({ ...p }));
  let n = 0;
  const matches = (row: Record<string, any>, where: Record<string, any>) =>
    Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && '_value' in v ? (v._value as unknown[]).includes(row[k]) : row[k] === v));
  const sellerRepo = {
    findOne: async ({ where }: any) => sellers.find((s) => matches(s, where)) ?? null,
    create: (x: any) => ({ id: `s${++n}`, ...x }),
    save: async (x: any) => {
      const i = sellers.findIndex((s) => s.id === x.id);
      if (i >= 0) sellers[i] = x;
      else sellers.push(x);
      return x;
    },
    find: async () => sellers,
  };
  const productRepo = {
    find: async ({ where }: any) => products.filter((p) => matches(p, where)),
    save: async (x: any) => x,
    // `productCount` is counted from live listings (grouped by seller id).
    createQueryBuilder: () => {
      const qb: any = { select: () => qb, addSelect: () => qb, where: () => qb, groupBy: () => qb, getRawMany: async () => [] };
      return qb;
    },
  };
  const emitted: [string, string][] = [];
  const notified: any[] = [];
  const emitter = {
    toRoles: (_r: unknown, ev: string, payload: any) => emitted.push([ev, payload?.id]),
    toUser: (_u: unknown, ev: string, payload: any) => emitted.push([ev, payload?.id]),
  };
  // Listings are re-published composed by ProductsService; here we only record that they were.
  const productsSvc = { publishUpdated: async (rows: any[]) => rows.forEach((p) => emitted.push(['product:updated', p.id])) };
  const notifications = {
    toRole: async (role: string, n: any) => notified.push({ role, ...n }),
    toUser: async (userId: string, n: any) => notified.push({ userId, ...n }),
  };
  const svc = new SellersService(
    sellerRepo as never,
    productRepo as never,
    {} as never,
    {} as never,
    {} as never,
    notifications as never,
    emitter as never,
    { registerPlanSettledHandler: () => undefined } as never,
    {} as never,
    productsSvc as never,
  );
  return { svc, sellers, products, emitted, notified };
}

// `In(...)` builds a FindOperator; the fake repo only needs its value list.
jest.mock('typeorm', () => {
  const actual = jest.requireActual('typeorm');
  return { ...actual, In: (v: unknown[]) => ({ _value: v }) };
});

describe('SellersService.register (KYC)', () => {
  const user = { id: 'u1', name: 'Mama' };

  it('creates a pending store with the KYC on file and notifies moderation', async () => {
    const { svc, sellers, notified } = setup();
    const s = await svc.register(user, goodKyc());
    expect(s.status).toBe('pending');
    expect(s.documentUrls).toEqual([UP(0)]);
    expect(sellers[0].phone).toBe('+243812345678');
    expect(sellers[0].kycSubmittedAt).toBeInstanceOf(Date);
    expect(sellers[0].termsAcceptedAt).toBeInstanceOf(Date);
    expect(sellers[0].documentUrls).toBe(JSON.stringify([UP(0)]));
    expect(notified.some((n) => n.role === 'admin_moderation')).toBe(true);
  });

  it('returns the existing store untouched (idempotent)', async () => {
    const { svc, sellers } = setup({ sellers: [{ id: 's9', userId: 'u1', name: 'Old', status: 'approved' }] });
    const s = await svc.register(user, { name: 'x' });
    expect(s.id).toBe('s9');
    expect(sellers).toHaveLength(1);
  });

  it.each([
    [{ name: 'A' }, /Store name must be 2-100/],
    [{ legalName: '' }, /Legal name must be 2-150/],
    [{ phone: '12ab' }, /valid phone number/],
    [{ phone: '123' }, /valid phone number/],
    [{ idNumber: 'abc' }, /ID number must be 4-40/],
    [{ rccm: 'x'.repeat(61) }, /RCCM number must be at most 60/],
    [{ taxNumber: 'x'.repeat(61) }, /Tax number must be at most 60/],
    [{ documentUrls: [] }, /between 1 and 5/],
    [{ documentUrls: [UP(0), UP(1), UP(2), UP(3), UP(4), UP(5)] }, /between 1 and 5/],
    [{ documentUrls: ['https://evil.example/x.png'] }, /Document must be an image uploaded/],
    [{ documentUrls: 'nope' }, /between 1 and 5/],
    [{ acceptTerms: false }, /You must accept the seller terms\./],
    [{ acceptTerms: undefined }, /You must accept the seller terms\./],
  ])('rejects invalid payload %j', async (over, message) => {
    const { svc, sellers } = setup();
    await expect(svc.register(user, goodKyc(over))).rejects.toThrow(message);
    expect(sellers).toHaveLength(0);
  });

  it('treats RCCM and tax number as optional', async () => {
    const { svc, sellers } = setup();
    await svc.register(user, goodKyc({ rccm: '', taxNumber: undefined }));
    expect(sellers[0].rccm).toBeNull();
    expect(sellers[0].taxNumber).toBeNull();
  });
});

describe('SellersService.resubmit', () => {
  it('lets a rejected store resubmit: pending again, reason cleared', async () => {
    const { svc, sellers, notified } = setup({
      sellers: [{ id: 's1', userId: 'u1', name: 'M', status: 'rejected', statusReason: 'Blurry ID', kycSubmittedAt: new Date() }],
    });
    const s = await svc.resubmit('u1', goodKyc());
    expect(s.status).toBe('pending');
    expect(sellers[0].statusReason).toBeNull();
    expect(sellers[0].legalName).toBe('Mama Store SARL');
    expect(notified.some((n) => n.title === 'Seller resubmitted')).toBe(true);
  });

  it('lets a legacy pending store (no KYC yet) file one', async () => {
    const { svc, sellers } = setup({ sellers: [{ id: 's1', userId: 'u1', name: 'M', status: 'pending' }] });
    await svc.resubmit('u1', goodKyc());
    expect(sellers[0].kycSubmittedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['suspended', { status: 'suspended' }, /suspended store cannot resubmit/],
    ['approved', { status: 'approved' }, /already approved/],
    ['pending with KYC', { status: 'pending', kycSubmittedAt: new Date() }, /already under review/],
  ])('refuses a %s store', async (_label, row, message) => {
    const { svc } = setup({ sellers: [{ id: 's1', userId: 'u1', name: 'M', ...row }] });
    await expect(svc.resubmit('u1', goodKyc())).rejects.toThrow(message);
  });

  it('validates the payload like register', async () => {
    const { svc } = setup({ sellers: [{ id: 's1', userId: 'u1', name: 'M', status: 'rejected' }] });
    await expect(svc.resubmit('u1', goodKyc({ acceptTerms: false }))).rejects.toThrow(/accept the seller terms/);
  });
});

describe('SellersService.setStatus', () => {
  const store = (over: Record<string, unknown> = {}) => ({ id: 's1', userId: 'u1', name: 'M', status: 'approved', kycSubmittedAt: new Date(), ...over });

  it.each(['rejected', 'suspended'] as const)('refuses %s without a reason (or a too-short one)', async (status) => {
    const { svc, sellers } = setup({ sellers: [store()] });
    await expect(svc.setStatus('s1', status)).rejects.toThrow(/Enter the reason the seller will see/);
    await expect(svc.setStatus('s1', status, '   ')).rejects.toThrow(/Enter the reason/);
    await expect(svc.setStatus('s1', status, 'bad')).rejects.toThrow(/Enter the reason/);
    await expect(svc.setStatus('s1', status, 'x'.repeat(501))).rejects.toThrow(/at most 500/);
    expect(sellers[0].status).toBe('approved');
  });

  it('stores the reason and tells the seller', async () => {
    const { svc, sellers, notified } = setup({ sellers: [store({ status: 'pending' })] });
    await svc.setStatus('s1', 'rejected', '  ID photo is unreadable  ');
    expect(sellers[0]).toMatchObject({ status: 'rejected', statusReason: 'ID photo is unreadable' });
    expect(sellers[0].statusChangedAt).toBeInstanceOf(Date);
    expect(notified.find((n) => n.userId === 'u1').body).toContain('ID photo is unreadable');
  });

  it('refuses to approve a store that never filed KYC', async () => {
    const { svc, sellers } = setup({ sellers: [store({ status: 'pending', kycSubmittedAt: null, termsAcceptedAt: null })] });
    await expect(svc.setStatus('s1', 'approved')).rejects.toThrow('This store has not submitted its KYC yet.');
    expect(sellers[0].status).toBe('pending');
  });

  it('lets a suspended legacy store (no KYC) be reinstated, and approval needs no reason', async () => {
    const { svc, sellers } = setup({ sellers: [store({ status: 'suspended', kycSubmittedAt: null, statusReason: 'old' })] });
    await svc.setStatus('s1', 'approved');
    expect(sellers[0]).toMatchObject({ status: 'approved', statusReason: null });
  });

  it('suspension drafts live listings and records exactly those ids (deduped with earlier ones)', async () => {
    const { svc, sellers, products, emitted } = setup({
      sellers: [store({ suspendedListingIds: JSON.stringify(['p1']) })],
      products: [
        { id: 'p1', sellerId: 's1', status: 'live' },
        { id: 'p2', sellerId: 'u1', status: 'live' }, // demo products keyed by the owner's user id
        { id: 'p3', sellerId: 's1', status: 'draft' },
        { id: 'p4', sellerId: 'other', status: 'live' },
      ],
    });
    await svc.setStatus('s1', 'suspended', 'Counterfeit complaints');
    expect(products.map((p) => [p.id, p.status])).toEqual([
      ['p1', 'draft'],
      ['p2', 'draft'],
      ['p3', 'draft'],
      ['p4', 'live'],
    ]);
    // `save` on the fake repo returns the same object we mutate, so the product rows are updated in place.
    expect(JSON.parse(sellers[0].suspendedListingIds).sort()).toEqual(['p1', 'p2']);
    expect(emitted.filter(([ev]) => ev === 'product:updated').map(([, id]) => id)).toEqual(['p1', 'p2']);
  });

  it('reinstating restores only listings that are still draft and still owned, then clears the record', async () => {
    const { svc, sellers, products } = setup({
      sellers: [store({ status: 'suspended', suspendedListingIds: JSON.stringify(['p1', 'p2', 'p3', 'p4', 'p5']) })],
      products: [
        { id: 'p1', sellerId: 's1', status: 'draft' }, // restored
        { id: 'p2', sellerId: 'u1', status: 'draft' }, // restored (owner-keyed)
        { id: 'p3', sellerId: 's1', status: 'removed' }, // seller removed it meanwhile
        { id: 'p4', sellerId: 'other', status: 'draft' }, // not theirs
        { id: 'p5', sellerId: 's1', status: 'live' }, // already live again
        { id: 'p6', sellerId: 's1', status: 'draft' }, // never recorded
      ],
    });
    await svc.setStatus('s1', 'approved', 'Documents verified');
    expect(Object.fromEntries(products.map((p) => [p.id, p.status]))).toEqual({
      p1: 'live',
      p2: 'live',
      p3: 'removed',
      p4: 'draft',
      p5: 'live',
      p6: 'draft',
    });
    expect(sellers[0]).toMatchObject({ status: 'approved', suspendedListingIds: null, statusReason: 'Documents verified' });
  });
});
