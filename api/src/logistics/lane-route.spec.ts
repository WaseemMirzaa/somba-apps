import { LaneEdge, hubsOnRoute, planRoute, reverseOverLanes } from './lane-route';

const lane = (a: string, b: string, h: number, cost: number | null = null): LaneEdge => ({ fromHubId: a, toHubId: b, transitHours: h, costUsd: cost });
const both = (a: string, b: string, h: number, cost: number | null = null) => [lane(a, b, h, cost), lane(b, a, h, cost)];

describe('planRoute', () => {
  it('is empty when the parcel is already there', () => {
    expect(planRoute(both('L', 'K', 4), 'K', 'K')).toMatchObject({ hops: [], totalHours: 0, direct: true, connected: true });
  });

  it('is a direct transfer when no lane is configured at all', () => {
    const r = planRoute([], 'L', 'K');
    expect(r).toMatchObject({ direct: true, lanesConfigured: false, connected: true, totalHours: 0 });
    expect(r.hops).toEqual([{ fromHubId: 'L', toHubId: 'K', transitHours: 0, costUsd: null }]);
  });

  it('follows a single lane', () => {
    const r = planRoute(both('L', 'K', 4, 2), 'L', 'K');
    expect(r.hops).toEqual([{ fromHubId: 'L', toHubId: 'K', transitHours: 4, costUsd: 2 }]);
    expect(r).toMatchObject({ direct: true, connected: true, totalHours: 4 });
  });

  it('chains lanes: Limete -> Kinshasa -> Kikwit', () => {
    const edges = [...both('L', 'K', 4), ...both('K', 'W', 24), ...both('K', 'B', 72)];
    const r = planRoute(edges, 'L', 'W');
    expect(hubsOnRoute(r.hops)).toEqual(['L', 'K', 'W']);
    expect(r).toMatchObject({ totalHours: 28, direct: false, connected: true, lanesConfigured: true });
    expect(hubsOnRoute(planRoute(edges, 'W', 'L').hops)).toEqual(['W', 'K', 'L']);
    expect(hubsOnRoute(planRoute(edges, 'L', 'B').hops)).toEqual(['L', 'K', 'B']);
  });

  it('takes the shortest transit, not the fewest hops, and breaks ties on fewer hops', () => {
    // direct lane takes 100h; going round takes 10 + 10
    expect(hubsOnRoute(planRoute([...both('A', 'B', 100), ...both('A', 'C', 10), ...both('C', 'B', 10)], 'A', 'B').hops)).toEqual(['A', 'C', 'B']);
    // equal time: the direct lane wins over the detour
    expect(hubsOnRoute(planRoute([...both('A', 'B', 20), ...both('A', 'C', 10), ...both('C', 'B', 10)], 'A', 'B').hops)).toEqual(['A', 'B']);
  });

  it('respects the direction of a one-way lane', () => {
    const edges = [lane('A', 'B', 5)];
    expect(planRoute(edges, 'A', 'B').connected).toBe(true);
    const back = planRoute(edges, 'B', 'A');
    expect(back).toMatchObject({ connected: false, direct: true, lanesConfigured: true });
    expect(back.hops).toEqual([{ fromHubId: 'B', toHubId: 'A', transitHours: 0, costUsd: null }]); // direct anyway: admins are told
  });

  it('lanes that exist but do not connect the two warehouses are "not connected"', () => {
    const r = planRoute(both('A', 'B', 3), 'A', 'Z');
    expect(r).toMatchObject({ connected: false, direct: true, lanesConfigured: true });
  });

  it('reverses a recorded route over lanes that still exist', () => {
    const edges = [...both('L', 'K', 4), ...both('K', 'W', 24)];
    expect(reverseOverLanes(edges, ['L', 'K', 'W'])?.map((h) => `${h.fromHubId}>${h.toHubId}`)).toEqual(['W>K', 'K>L']);
    expect(reverseOverLanes([lane('L', 'K', 4), lane('K', 'W', 24)], ['L', 'K', 'W'])).toBeNull(); // one-way lanes cannot be walked back
    expect(reverseOverLanes(edges, ['L'])).toBeNull();
  });
});
