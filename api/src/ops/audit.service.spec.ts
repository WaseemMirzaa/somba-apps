import { DataSource } from 'typeorm';
import { AuditLog } from '../database/entities';
import { recordingEmitter, testDb } from '../testing/test-db';
import { AuditService } from './audit.service';

let ds: DataSource;
let svc: AuditService;

/** Writes an entry and back-dates it (createdAt is set by the database on insert). */
async function add(actor: string, role: string, action: string, entity: string, daysAgo: number, detail?: string, entityId?: string) {
  const row = await svc.record({ actor, role, action, entity, entityId, detail });
  const when = new Date(Date.UTC(2026, 5, 20, 12, 0, 0) - daysAgo * 86_400_000);
  await ds.getRepository(AuditLog).update({ id: row.id }, { createdAt: when });
  return row;
}

beforeEach(async () => {
  ds = await testDb();
  svc = new AuditService(ds.getRepository(AuditLog), recordingEmitter() as never);
  await add('Ada Admin', 'admin', 'user.suspend', 'user', 0, 'fraud', 'u1');
  await add('Fin Ance', 'admin_finance', 'payout.paid', 'payout', 1, 'PO-1 $50', 'p1');
  await add('Fin Ance', 'admin_finance', 'payout.rejected', 'payout', 2, '100% wrong_name', 'p2');
  await add('Mo Derator', 'admin_moderation', 'product.rejected', 'product', 3, 'Phone', 'pr1');
  await add('Ada Admin', 'admin', 'broadcast.sent', 'broadcast', 10, 'customer · 4 recipients', 'b1');
});
afterEach(async () => ds.destroy());

const actionsOf = async (f?: object) => (await svc.list(f)).map((r) => r.action);

describe('audit:list filters and paging (server side)', () => {
  it('with no filter it is the newest first, as before', async () => {
    expect(await actionsOf()).toEqual(['user.suspend', 'payout.paid', 'payout.rejected', 'product.rejected', 'broadcast.sent']);
    expect(await actionsOf(null)).toHaveLength(5);
  });

  it('filters by action (exact), role, entity and actor (part of the name, any case)', async () => {
    expect(await actionsOf({ action: 'payout.paid' })).toEqual(['payout.paid']);
    expect(await actionsOf({ action: 'payout' })).toEqual([]); // exact, not a prefix
    expect(await actionsOf({ role: 'admin_finance' })).toEqual(['payout.paid', 'payout.rejected']);
    expect(await actionsOf({ entity: 'product' })).toEqual(['product.rejected']);
    expect(await actionsOf({ actor: 'ADA' })).toEqual(['user.suspend', 'broadcast.sent']);
  });

  it('filters by date range; a bare "to" date includes that whole day', async () => {
    // Entries are at 2026-06-20 12:00 UTC minus 0, 1, 2, 3 and 10 days.
    expect(await actionsOf({ from: '2026-06-18', to: '2026-06-19' })).toEqual(['payout.paid', 'payout.rejected']);
    expect(await actionsOf({ to: '2026-06-20' })).toHaveLength(5);
    expect(await actionsOf({ from: '2026-06-20' })).toEqual(['user.suspend']);
    expect(await actionsOf({ from: '2026-06-20T12:00:01Z' })).toEqual([]);
    expect(await actionsOf({ from: '2026-06-15', to: '2026-06-30' })).toHaveLength(4);
  });

  it('combines filters and searches actor, action, id and detail; % and _ are plain characters', async () => {
    expect(await actionsOf({ role: 'admin_finance', from: '2026-06-19' })).toEqual(['payout.paid']);
    expect(await actionsOf({ q: 'recipients' })).toEqual(['broadcast.sent']);
    expect(await actionsOf({ q: 'pr1' })).toEqual(['product.rejected']);
    expect(await actionsOf({ q: '100%' })).toEqual(['payout.rejected']);
    expect(await actionsOf({ q: '%' })).toEqual(['payout.rejected']); // not "match everything"
    expect(await actionsOf({ q: 'wrong_name' })).toEqual(['payout.rejected']);
    expect(await actionsOf({ q: 'wrong-name' })).toEqual([]);
  });

  it('pages with limit and offset and never repeats or skips an entry', async () => {
    const all = (await svc.list()).map((r) => r.id);
    const p1 = (await svc.list({ limit: 2 })).map((r) => r.id);
    const p2 = (await svc.list({ limit: 2, offset: 2 })).map((r) => r.id);
    const p3 = (await svc.list({ limit: 2, offset: 4 })).map((r) => r.id);
    expect([...p1, ...p2, ...p3]).toEqual(all);
    expect(p3).toHaveLength(1);
    expect(await svc.list({ limit: 2, offset: 6 })).toEqual([]);
  });

  it('rejects bad input instead of ignoring it', async () => {
    await expect(svc.list({ from: 'yesterday' })).rejects.toThrow('From must be a valid date.');
    await expect(svc.list({ to: '2026-13-45' })).rejects.toThrow('To must be a valid date.');
    await expect(svc.list({ from: '2026-06-20', to: '2026-06-01' })).rejects.toThrow('after the "to" date');
    await expect(svc.list({ action: 5 as never })).rejects.toThrow('Action must be text.');
  });

  it('facets lists the distinct actions and roles for the pickers', async () => {
    expect(await svc.facets()).toEqual({
      actions: ['broadcast.sent', 'payout.paid', 'payout.rejected', 'product.rejected', 'user.suspend'],
      roles: ['admin', 'admin_finance', 'admin_moderation'],
    });
  });
});

describe('audit:created is pushed only to the roles that may read the log', () => {
  it('a new entry goes to the super admin and Operations, not to finance, support, marketing or moderation', async () => {
    const emitter = recordingEmitter();
    const live = new AuditService(ds.getRepository(AuditLog), emitter as never);
    await live.record({ actor: 'Fin Ance', role: 'admin_finance', action: 'payout.paid', entity: 'payout' });
    expect(emitter.sent.filter((e) => e.event === 'audit:created').map((e) => e.to)).toEqual(['admin,admin_operations']);
  });
});
