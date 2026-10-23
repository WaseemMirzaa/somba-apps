import { CampaignsService } from './campaigns.service';

type Row = { id: string; name: string; status: string; startDate: string | null; endDate: string | null; sellerId: string | null; discount: number; sellerName: string | null };

function make(rows: Row[]) {
  const notices: { userId: string; title: string }[] = [];
  const roleNotices: string[] = [];
  const repo = {
    find: async () => rows.filter((r) => ['active', 'scheduled'].includes(r.status)),
    findOne: async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null,
    createQueryBuilder: () => {
      let patch: Partial<Row> = {};
      let cond: { id: string; from: string } = { id: '', from: '' };
      const qb = {
        update: () => qb,
        set: (p: Partial<Row>) => ((patch = p), qb),
        where: (_: string, c: { id: string; from: string }) => ((cond = c), qb),
        execute: async () => {
          const row = rows.find((r) => r.id === cond.id && r.status === cond.from);
          if (row) Object.assign(row, patch);
          return { affected: row ? 1 : 0 };
        },
      };
      return qb;
    },
  };
  const sellers = {
    findOne: async ({ where }: { where: { id?: string; userId?: string } }) =>
      where.id === 's1' || where.userId === 'u1' ? { id: 's1', userId: 'u1' } : null,
  };
  const notifications = {
    toUser: async (userId: string, n: { title: string }) => void notices.push({ userId, title: n.title }),
    toRole: async (_role: string, n: { title: string }) => void roleNotices.push(n.title),
  };
  const emitter = { toRoles: () => undefined, toUser: () => undefined };
  const products = { broadcastCampaignPrices: jest.fn(async () => undefined) };
  const svc = new CampaignsService(repo as never, sellers as never, {} as never, notifications as never, emitter as never, products as never);
  return { svc, notices, roleNotices, products };
}

const base = { name: 'Promo', sellerId: 's1', discount: 10, sellerName: 'Shop' };

describe('CampaignsService dates and withdraw', () => {
  it('ends campaigns past their end date and starts scheduled ones', async () => {
    const rows: Row[] = [
      { ...base, id: 'a', status: 'active', startDate: '2026-10-01', endDate: '2026-10-10' },
      { ...base, id: 'b', status: 'scheduled', startDate: '2026-10-20', endDate: '2026-10-30' },
      { ...base, id: 'c', status: 'active', startDate: '2026-10-01', endDate: '2026-10-30' },
    ];
    const { svc, notices, products } = make(rows);
    expect(await svc.sweep(Date.parse('2026-10-22T12:00:00Z'))).toBe(2);
    expect(rows.map((r) => r.status)).toEqual(['ended', 'active', 'active']);
    expect(notices).toEqual([
      { userId: 'u1', title: 'Campaign ended' },
      { userId: 'u1', title: 'Campaign started' },
    ]);
    expect(products.broadcastCampaignPrices).toHaveBeenCalledTimes(2);
  });

  it('keeps the inclusive end day running', async () => {
    const rows: Row[] = [{ ...base, id: 'a', status: 'active', startDate: null, endDate: '2026-10-22' }];
    const { svc } = make(rows);
    expect(await svc.sweep(Date.parse('2026-10-22T23:00:00Z'))).toBe(0);
    expect(await svc.sweep(Date.parse('2026-10-23T00:00:01Z'))).toBe(1);
  });

  it('lets the owning seller withdraw, and tells marketing', async () => {
    const rows: Row[] = [{ ...base, id: 'a', status: 'pending', startDate: null, endDate: null }];
    const { svc, roleNotices } = make(rows);
    const out = await svc.withdraw({ id: 'u1', role: 'seller' }, 'a');
    expect(out.status).toBe('ended');
    expect(roleNotices).toEqual(['Campaign withdrawn']);
    await expect(svc.withdraw({ id: 'u1', role: 'seller' }, 'a')).rejects.toThrow('already ended');
    await expect(svc.withdraw({ id: 'someone-else', role: 'seller' }, 'a')).rejects.toThrow('not found');
  });
});
