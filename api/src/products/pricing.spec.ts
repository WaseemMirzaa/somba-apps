import { bestPrice, campaignCovers, campaignRunning, campaignWindow, type CampaignLike } from './pricing';

const camp = (over: Partial<CampaignLike> = {}): CampaignLike => ({
  id: 'c1', sellerId: 's1', discount: 20, status: 'active', startDate: null, endDate: null, productIds: [], ...over,
});
const NOW = Date.parse('2026-08-02T12:00:00Z');

describe('campaign pricing rules', () => {
  it('an approved campaign inside its dates is running; dates are inclusive', () => {
    expect(campaignRunning(camp({ startDate: '2026-08-01', endDate: '2026-08-03' }), NOW)).toBe(true);
    expect(campaignRunning(camp({ startDate: '2026-08-01', endDate: '2026-08-02' }), NOW)).toBe(true); // end day counts fully
    expect(campaignRunning(camp({ startDate: '2026-08-01', endDate: '2026-08-02' }), Date.parse('2026-08-03T00:00:00Z'))).toBe(false);
  });
  it('an expired or not-yet-started campaign gives nothing', () => {
    expect(campaignRunning(camp({ endDate: '2026-07-30' }), NOW)).toBe(false);
    expect(campaignRunning(camp({ startDate: '2026-08-05' }), NOW)).toBe(false);
  });
  it('pending / draft / rejected / ended never discount', () => {
    for (const status of ['pending', 'draft', 'rejected', 'ended'] as const) expect(campaignRunning(camp({ status }), NOW)).toBe(false);
  });
  it('scheduled only runs once its start date has passed', () => {
    expect(campaignRunning(camp({ status: 'scheduled', startDate: '2026-08-01' }), NOW)).toBe(true);
    expect(campaignRunning(camp({ status: 'scheduled', startDate: '2026-08-09' }), NOW)).toBe(false);
    expect(campaignRunning(camp({ status: 'scheduled' }), NOW)).toBe(false); // no start date = not started
  });
  it('a 0% campaign does nothing', () => {
    expect(campaignRunning(camp({ discount: 0 }), NOW)).toBe(false);
  });
  it('parses full ISO dates as given', () => {
    expect(campaignWindow({ startDate: '2026-08-01T10:00:00Z', endDate: '2026-08-01T11:00:00Z' })).toEqual({
      from: Date.parse('2026-08-01T10:00:00Z'), to: Date.parse('2026-08-01T11:00:00Z'),
    });
    expect(campaignWindow({ startDate: 'garbage', endDate: null })).toEqual({ from: null, to: null });
  });
  it('covers listed products, or the whole store when none are listed', () => {
    expect(campaignCovers(camp({ productIds: ['p1'] }), { id: 'p1', sellerId: 'other' })).toBe(true);
    expect(campaignCovers(camp({ productIds: ['p1'] }), { id: 'p2', sellerId: 's1' })).toBe(false);
    expect(campaignCovers(camp(), { id: 'p2', sellerId: 's1' })).toBe(true);
    expect(campaignCovers(camp(), { id: 'p2', sellerId: 's2' })).toBe(false);
    expect(campaignCovers(camp({ sellerId: null }), { id: 'p2', sellerId: null })).toBe(false);
  });
});

describe('bestPrice (never stacks flash and campaign)', () => {
  it('no promotion -> base', () => {
    expect(bestPrice(100, undefined, undefined)).toEqual({ price: 100, source: 'base', campaignPct: 0 });
  });
  it('campaign only', () => {
    expect(bestPrice(100, undefined, 20)).toEqual({ price: 80, source: 'campaign', campaignPct: 20 });
  });
  it('flash only', () => {
    expect(bestPrice(100, 70, undefined)).toEqual({ price: 70, source: 'flash', campaignPct: 0 });
  });
  it('the lower of the two wins, they are not combined', () => {
    expect(bestPrice(100, 70, 20)).toEqual({ price: 70, source: 'flash', campaignPct: 0 });
    expect(bestPrice(100, 90, 20)).toEqual({ price: 80, source: 'campaign', campaignPct: 20 });
  });
  it('a tie goes to the flash sale', () => {
    expect(bestPrice(100, 80, 20).source).toBe('flash');
  });
  it('ignores a flash price that is not a discount, rounds to cents, caps at 90%', () => {
    expect(bestPrice(100, 120, undefined).source).toBe('base');
    expect(bestPrice(9.99, undefined, 33).price).toBe(6.69);
    expect(bestPrice(100, undefined, 99).price).toBe(10);
  });
});
