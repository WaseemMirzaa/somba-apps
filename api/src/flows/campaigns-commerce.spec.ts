import { Campaign } from '../database/entities';
import type { Seller } from '../database/entities';
import { campaignRunning, budgetSpent } from '../products/pricing';
import { TRACK_PER_MINUTE, TRACK_SAME_WINDOW_MS } from './campaigns.service';
import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';

let w: World;
let shop: Seller;
let user: { id: string; name: string; role: string };
beforeEach(async () => {
  w = await commerceWorld();
  shop = await w.store('Kinshasa Traders', 'u-kt');
  user = { id: 'u-kt', name: 'KT', role: 'seller' };
});
afterEach(async () => w.ds.destroy());

const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const make = (over: Record<string, unknown> = {}) => w.campaigns.create(user, { name: 'Spring Sale', discount: 20, ...over });
const row = (id: string) => w.ds.getRepository(Campaign).findOneByOrFail({ id });
const titles = () => w.notes.map((n) => `${n.to}|${n.title}`);

describe('life of a campaign', () => {
  it('a new campaign waits for marketing; a draft does not bother them until it is sent', async () => {
    const a = await make();
    expect(a.status).toBe('pending');
    expect(titles()).toContain('role:admin_marketing|New campaign request');
    w.notes.length = 0;
    const d = await make({ name: 'Later', draft: true });
    expect(d.status).toBe('draft');
    expect(w.notes).toHaveLength(0);
    expect((await w.campaigns.submit(user, d.id)).status).toBe('pending');
    expect(titles()).toEqual(['role:admin_marketing|New campaign request']);
    await expect(w.campaigns.submit(user, d.id)).rejects.toThrow('Only a draft or a rejected');
  });

  it('only the owner can send a draft', async () => {
    const d = await make({ draft: true });
    await expect(w.campaigns.submit({ id: 'someone-else', role: 'seller' }, d.id)).rejects.toThrow('Campaign not found');
  });

  it('approving picks scheduled for a future start and active otherwise', async () => {
    const future = await make({ startDate: day(3), endDate: day(10) });
    const now = await make({ startDate: day(-1), endDate: day(10) });
    expect((await w.campaigns.setStatus(future.id, 'active')).status).toBe('scheduled');
    expect((await w.campaigns.setStatus(now.id, 'scheduled')).status).toBe('active');
  });

  it('refuses to approve a campaign whose end date has passed', async () => {
    const c = await make({ startDate: day(-10), endDate: day(-2) });
    await expect(w.campaigns.setStatus(c.id, 'active')).rejects.toThrow('end date of this campaign has already passed');
  });

  it('rejecting needs a reason, stores it, tells the seller, and the seller can fix and resend', async () => {
    const c = await make();
    await expect(w.campaigns.setStatus(c.id, 'rejected')).rejects.toThrow('reason');
    await expect(w.campaigns.setStatus(c.id, 'rejected', 'no')).rejects.toThrow('reason');
    const r = await w.campaigns.setStatus(c.id, 'rejected', 'Discount too deep for this category');
    expect(r).toMatchObject({ status: 'rejected', rejectReason: 'Discount too deep for this category' });
    const note = w.notes.find((n) => n.to === 'user:u-kt' && n.title === 'Campaign rejected');
    expect(note?.body).toBe('"Spring Sale" was rejected: Discount too deep for this category');
    // The seller edits it: back to pending, reason cleared.
    const edited = await w.campaigns.update(user, c.id, { discount: 10 });
    expect(edited).toMatchObject({ status: 'pending', rejectReason: null, discount: 10 });
  });

  it('refuses moves the machine does not have', async () => {
    const c = await make();
    await w.campaigns.setStatus(c.id, 'active');
    await expect(w.campaigns.setStatus(c.id, 'pending')).rejects.toThrow('cannot become pending');
    await expect(w.campaigns.setStatus(c.id, 'rejected', 'too late now')).rejects.toThrow('cannot become rejected');
    await w.campaigns.setStatus(c.id, 'ended');
    expect((await row(c.id)).endedReason).toBe('admin');
    await expect(w.campaigns.setStatus(c.id, 'active')).rejects.toThrow('cannot become active');
  });

  it('a withdrawal records why it ended', async () => {
    const c = await make();
    await w.campaigns.withdraw(user, c.id);
    expect(await row(c.id)).toMatchObject({ status: 'ended', endedReason: 'withdrawn' });
  });
});

describe('scheduled campaigns go live on their own', () => {
  it('the sweep starts a scheduled campaign at its date, tells the seller and re-prices EVERY covered product (no cap)', async () => {
    const p1 = await w.product(shop, { name: 'One', price: 100 });
    const many: string[] = [];
    for (let i = 0; i < 130; i++) many.push((await w.product(shop, { name: `P${i}`, price: 50 })).id);
    const c = await make({ startDate: day(1), endDate: day(5) });
    await w.campaigns.setStatus(c.id, 'active');
    expect((await row(c.id)).status).toBe('scheduled');
    expect((await w.products.get(p1.id))?.price).toBe(100); // not yet
    // Time passes: the start date is now behind us.
    await w.ds.getRepository(Campaign).update({ id: c.id }, { startDate: day(-1) });
    w.emitter.sent.length = 0;
    const moved = await w.campaigns.sweep();
    expect(moved).toBe(1);
    expect((await row(c.id)).status).toBe('active');
    expect(w.notes.find((n) => n.title === 'Campaign started')).toMatchObject({ to: 'user:u-kt' });
    // The campaign covers the whole store (no product list): all 131 products get a product:updated, priced at -20%.
    await new Promise((r) => setTimeout(r, 400));
    const updates = w.emitter.sent.filter((e) => e.event === 'product:updated');
    const ids = new Set(updates.map((e) => e.payload.id));
    expect(ids.size).toBe(131);
    expect(ids.has(p1.id)).toBe(true);
    expect(updates.find((e) => e.payload.id === p1.id)?.payload).toMatchObject({ price: 80, campaignPct: 20 });
    expect(many.every((id) => ids.has(id))).toBe(true);
  });

  it('an active campaign whose start is still ahead goes back to scheduled; one past its end is ended', async () => {
    const early = await make({ startDate: day(2), endDate: day(9) });
    await w.ds.getRepository(Campaign).update({ id: early.id }, { status: 'active' });
    const over = await make({ name: 'Over', startDate: day(-9), endDate: day(-1) });
    await w.ds.getRepository(Campaign).update({ id: over.id }, { status: 'active' });
    await w.campaigns.sweep();
    expect((await row(early.id)).status).toBe('scheduled');
    expect(await row(over.id)).toMatchObject({ status: 'ended', endedReason: 'dates' });
  });
});

describe('budget', () => {
  it('stops discounting once the budget is spent: prices go back, the campaign ends, the seller is told', async () => {
    const p = await w.product(shop, { price: 100 });
    const c = await make({ budgetUsd: 50, discount: 20 });
    await w.campaigns.setStatus(c.id, 'active');
    expect((await w.products.get(p.id))?.price).toBe(80);
    await w.products.recordCampaignSale(c.id, 80, 20); // spent 20 of 50
    expect((await row(c.id)).status).toBe('active');
    expect((await w.products.get(p.id))?.price).toBe(80);
    w.emitter.sent.length = 0;
    await w.products.recordCampaignSale(c.id, 160, 40); // spent 60 >= 50
    const after = await row(c.id);
    expect(after).toMatchObject({ status: 'ended', endedReason: 'budget', spentUsd: 60, orders: 2 });
    expect((await w.products.get(p.id))?.price).toBe(100);
    expect(w.notes.find((n) => n.title === 'Campaign budget used')?.body).toBe('"Spring Sale" used its $50.00 budget; prices are back to normal.');
    await new Promise((r) => setTimeout(r, 100));
    expect(w.emitter.sent.some((e) => e.event === 'product:updated' && e.payload.id === p.id && e.payload.price === 100)).toBe(true);
  });

  it('even before the status is flipped, a spent budget no longer discounts', () => {
    const c = { id: 'c', sellerId: 's', discount: 20, status: 'active' as const, startDate: null, endDate: null, budgetUsd: 10, spentUsd: 10 };
    expect(budgetSpent(c)).toBe(true);
    expect(campaignRunning(c)).toBe(false);
    expect(campaignRunning({ ...c, spentUsd: 9.99 })).toBe(true);
    expect(campaignRunning({ ...c, budgetUsd: 0, spentUsd: 999 })).toBe(true); // no budget = no limit
  });

  it('every sale tells the owner and marketing the new numbers', async () => {
    const c = await make({ budgetUsd: 500 });
    await w.campaigns.setStatus(c.id, 'active');
    w.emitter.sent.length = 0;
    await w.products.recordCampaignSale(c.id, 80, 20);
    const ev = w.emitter.sent.filter((e) => e.event === 'campaign:updated');
    expect(ev.map((e) => e.to).sort()).toEqual(['admin,admin_operations,admin_finance,admin_support,admin_marketing,admin_moderation', 'user:u-kt'].sort());
    expect(ev[0].payload).toMatchObject({ orders: 1, revenueUsd: 80, spentUsd: 20, budgetRemainingUsd: 480 });
  });
});

describe('campaigns:track (views and clicks)', () => {
  const live = async () => {
    const c = await make();
    await w.campaigns.setStatus(c.id, 'active');
    return c;
  };

  it('counts views and clicks of a running campaign', async () => {
    const c = await live();
    expect(await w.campaigns.track('u1', c.id, 'view')).toEqual({ counted: true });
    expect(await w.campaigns.track('u2', c.id, 'view')).toEqual({ counted: true });
    expect(await w.campaigns.track('u1', c.id, 'click')).toEqual({ counted: true });
    expect(await row(c.id)).toMatchObject({ views: 2, clicks: 1 });
  });

  it('ignores a campaign that is not discounting, an unknown one, and a bad kind', async () => {
    const pending = await make();
    expect(await w.campaigns.track('u1', pending.id, 'view')).toEqual({ counted: false });
    expect(await w.campaigns.track('u1', '00000000-0000-0000-0000-000000000000', 'view')).toEqual({ counted: false });
    expect(await w.campaigns.track('u1', 'junk', 'view')).toEqual({ counted: false });
    await expect(w.campaigns.track('u1', pending.id, 'purchase')).rejects.toThrow('"view" or "click"');
    expect((await row(pending.id)).views).toBe(0);
  });

  it('the same shopper cannot repeat the same event on a campaign inside the window', async () => {
    const c = await live();
    const t = Date.now();
    expect((await w.campaigns.track('u1', c.id, 'view', t)).counted).toBe(true);
    expect((await w.campaigns.track('u1', c.id, 'view', t + 1000)).counted).toBe(false);
    expect((await w.campaigns.track('u1', c.id, 'click', t + 1000)).counted).toBe(true); // another kind is fine
    expect((await w.campaigns.track('u1', c.id, 'view', t + TRACK_SAME_WINDOW_MS + 1)).counted).toBe(true);
    expect((await row(c.id)).views).toBe(2);
  });

  it(`a shopper is limited to ${TRACK_PER_MINUTE} counted events a minute`, async () => {
    const campaigns: Awaited<ReturnType<typeof live>>[] = [];
    for (let i = 0; i < 12; i++) campaigns.push(await live());
    const t = Date.now();
    let counted = 0;
    // 12 campaigns x 2 kinds, three rounds 11 s apart (so the same-event window never applies): 72 events in 33 s.
    for (let round = 0; round < 3; round++) {
      for (const c of campaigns) {
        for (const kind of ['view', 'click'] as const) {
          if ((await w.campaigns.track('spammer', c.id, kind, t + round * 11_000)).counted) counted++;
        }
      }
    }
    expect(counted).toBe(TRACK_PER_MINUTE);
    // A different shopper is not affected, and the limit lifts after a minute.
    expect((await w.campaigns.track('other', campaigns[0].id, 'view', t)).counted).toBe(true);
    expect((await w.campaigns.track('spammer', campaigns[0].id, 'view', t + 120_000)).counted).toBe(true);
  });
});

describe('campaigns:track tells the owning seller (throttled)', () => {
  const live = async () => {
    const c = await make();
    await w.campaigns.setStatus(c.id, 'active');
    return c;
  };
  const pushes = (id: string) => w.emitter.sent.filter((e) => e.event === 'campaign:updated' && e.to === 'user:u-kt' && (e.payload as { id: string }).id === id);

  it('a counted view or click reaches the seller with the new numbers, once per window however many came in', async () => {
    const c = await live();
    w.emitter.sent.length = 0;
    for (let i = 0; i < 5; i++) await w.campaigns.track(`shopper${i}`, c.id, 'view');
    await w.campaigns.track('shopper0', c.id, 'click');
    expect(pushes(c.id)).toHaveLength(0); // held back by the throttle
    await w.campaigns.flushStatsPushes();
    const sent = pushes(c.id);
    expect(sent).toHaveLength(1);
    expect(sent[0].payload).toMatchObject({ views: 5, clicks: 1, name: 'Spring Sale' });
    // Nothing pending: flushing again sends nothing, and an uncounted event does not arm a push.
    await w.campaigns.flushStatsPushes();
    await w.campaigns.track('shopper0', c.id, 'view'); // same event inside the window: not counted
    await w.campaigns.flushStatsPushes();
    expect(pushes(c.id)).toHaveLength(1);
  });

  it('admins are not flooded with every view', async () => {
    const c = await live();
    w.emitter.sent.length = 0;
    await w.campaigns.track('shopper', c.id, 'view');
    await w.campaigns.flushStatsPushes();
    expect(w.emitter.sent.filter((e) => e.event === 'campaign:updated' && e.to !== 'user:u-kt')).toHaveLength(0);
  });

  it('the next burst after a flush is pushed again', async () => {
    const c = await live();
    await w.campaigns.track('a', c.id, 'view');
    await w.campaigns.flushStatsPushes();
    w.emitter.sent.length = 0;
    await w.campaigns.track('b', c.id, 'view');
    await w.campaigns.flushStatsPushes();
    expect(pushes(c.id)).toHaveLength(1);
    expect(pushes(c.id)[0].payload).toMatchObject({ views: 2 });
  });

  it('with the throttle off (CAMPAIGN_STATS_PUSH_MS=0) the push goes out at once', async () => {
    process.env.CAMPAIGN_STATS_PUSH_MS = '0';
    try {
      const c = await live();
      w.emitter.sent.length = 0;
      await w.campaigns.track('a', c.id, 'view');
      await new Promise((r) => setTimeout(r, 50));
      expect(pushes(c.id)).toHaveLength(1);
    } finally {
      delete process.env.CAMPAIGN_STATS_PUSH_MS;
    }
  });
});
