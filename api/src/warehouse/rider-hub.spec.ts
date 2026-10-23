import { parsePreferredZones, sameHub, tasksOfHub } from '../common/zones/hub-scope';
import { RiderService } from './rider.service';

type Task = { id: string; riderId: string | null; status: string; zoneId: string | null; hubId: string | null; orderId: string; createdAt: Date };
type Rider = { id: string; role: string; active: boolean; hubId: string | null; preferredZones: string | null; name: string; phone: string | null };

/** TypeORM-like matching for the shapes the service builds: equality, IsNull() and In([...]), OR-ed arrays. */
function matches(row: Record<string, unknown>, where: Record<string, unknown> | Record<string, unknown>[]): boolean {
  if (Array.isArray(where)) return where.some((w) => matches(row, w));
  return Object.entries(where).every(([k, v]) => {
    const op = v as { _type?: string; _value?: unknown } | null;
    if (op && typeof op === 'object' && op._type === 'isNull') return row[k] == null;
    if (op && typeof op === 'object' && op._type === 'in') return (op._value as unknown[]).includes(row[k]);
    return row[k] === v;
  });
}

function make(tasks: Task[], riders: Rider[], zones: unknown[] = []) {
  const repo = <T extends Record<string, unknown>>(rows: T[]) => ({
    find: async ({ where }: { where?: Record<string, unknown> | Record<string, unknown>[] } = {}) => rows.filter((r) => !where || matches(r, where)),
    findOne: async ({ where }: { where: Record<string, unknown> }) => rows.find((r) => matches(r, where)) ?? null,
  });
  const settings = { findOne: async () => ({ key: 'deliveryZones', value: JSON.stringify(zones) }) };
  const hubs = repo([{ id: 'H1', name: 'Kinshasa Hub', city: 'Kinshasa' }, { id: 'H2', name: 'Paris Hub', city: 'Paris' }]);
  return new RiderService(repo(tasks) as never, repo([]) as never, repo(riders) as never, hubs as never, settings as never);
}

const t = (id: string, hubId: string | null, zoneId: string | null, extra: Partial<Task> = {}): Task => ({
  id,
  riderId: null,
  status: 'unassigned',
  zoneId,
  hubId,
  orderId: `o-${id}`,
  createdAt: new Date(),
  ...extra,
});
const rider = (id: string, hubId: string | null, preferredZones: string[] = []): Rider => ({
  id,
  role: 'rider',
  active: true,
  hubId,
  preferredZones: JSON.stringify(preferredZones),
  name: id,
  phone: null,
});

describe('hub scope helpers', () => {
  it('limits a bound user to their hub plus unbound tasks, and leaves unbound users alone', () => {
    expect(tasksOfHub({ status: 'unassigned' }, null)).toEqual({ status: 'unassigned' });
    const scoped = tasksOfHub({ status: 'unassigned' }, 'H1') as Record<string, unknown>[];
    expect(scoped).toHaveLength(2);
    expect(scoped[0]).toEqual({ status: 'unassigned', hubId: 'H1' });
  });

  it('only refuses when both sides name different hubs', () => {
    expect(sameHub('H1', 'H1')).toBe(true);
    expect(sameHub('H1', null)).toBe(true);
    expect(sameHub(null, 'H2')).toBe(true);
    expect(sameHub('H1', 'H2')).toBe(false);
  });

  it('reads preferred zones defensively', () => {
    expect(parsePreferredZones('["gombe",3,"limete"]')).toEqual(['gombe', 'limete']);
    expect(parsePreferredZones('not json')).toEqual([]);
    expect(parsePreferredZones(null)).toEqual([]);
  });
});

describe('RiderService warehouse scoping', () => {
  const tasks = [t('a', 'H1', 'limete'), t('b', 'H2', 'zone-a'), t('c', null, null), t('d', 'H1', 'gombe'), t('e', 'H2', 'zone-b', { riderId: 'r1', status: 'assigned' })];
  const zones = [
    { id: 'gombe', name: 'Gombe', city: 'Kinshasa', feeUsd: 3, hubId: 'H1' },
    { id: 'limete', name: 'Limete', city: 'Kinshasa', feeUsd: 5, hubId: 'H1' },
  ];

  it("shows a bound rider their warehouse's open tasks, unbound ones and their own, preferred zones first", async () => {
    const svc = make(tasks, [rider('r1', 'H1', ['gombe'])], zones);
    const q = await svc.queue('r1');
    expect(q.map((x) => x.id).sort()).toEqual(['a', 'c', 'd', 'e']);
    expect(q[0].id).toBe('d');
    expect(q[0]).toMatchObject({ preferred: true, zoneName: 'Gombe', hubId: 'H1' });
  });

  it('shows an unbound rider every open task', async () => {
    const svc = make(tasks, [rider('r2', null)], zones);
    expect((await svc.queue('r2')).map((x) => x.id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it("lists a warehouse's riders plus riders not tied to one", async () => {
    const svc = make([], [rider('r1', 'H1'), rider('r2', 'H2'), rider('r3', null)], zones);
    expect((await svc.activeRiders('H1')).map((r) => r.id).sort()).toEqual(['r1', 'r3']);
    expect((await svc.activeRiders()).map((r) => r.id).sort()).toEqual(['r1', 'r2', 'r3']);
  });

  it("tells a rider their warehouse, its zones and their preferred zones by name", async () => {
    const svc = make([], [rider('r1', 'H1', ['gombe'])], zones);
    const a = await svc.assignment('r1');
    expect(a.hub).toMatchObject({ id: 'H1', name: 'Kinshasa Hub' });
    expect(a.hubZones.map((z) => z.id)).toEqual(['gombe', 'limete']);
    expect(a.preferredZones).toEqual([{ id: 'gombe', name: 'Gombe' }]);
  });
});
