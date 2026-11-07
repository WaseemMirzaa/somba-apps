import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AuditLog, Hub, PrivateFile, RiderDocument, RiderVehicle, User } from '../database/entities';
import { localizeNotice } from '../notifications/localize';
import { AuditService } from '../ops/audit.service';
import { testDb, recordingEmitter } from '../testing/test-db';

// The private folders are read when the module loads: point them at a scratch directory first.
const root = mkdtempSync(join(tmpdir(), 'somba-rider-docs-'));
process.env.UPLOAD_DIR = join(root, 'public');
process.env.PRIVATE_UPLOAD_DIR = join(root, 'private');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrivateFilesService } = require('../sellers/private-files.service') as typeof import('../sellers/private-files.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { RiderComplianceService, RIDER_DOC_KIND } = require('./rider-compliance.service') as typeof import('./rider-compliance.service');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0]);
const PDF = Buffer.from('%PDF-1.4\n%fake\n');
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)]);
const NOW = new Date('2026-06-15T09:00:00Z');

let ds: DataSource;
let files: InstanceType<typeof PrivateFilesService>;
let svc: InstanceType<typeof RiderComplianceService>;
let emitter: ReturnType<typeof recordingEmitter>;
let notices: { to: string; data: { title: string; body: string } }[];
let seq = 0;

const mkHub = (name: string) => ds.getRepository(Hub).save(ds.getRepository(Hub).create({ name, city: 'Kinshasa' }));
const mkUser = (role: User['role'], hubId: string | null, extra: Partial<User> = {}) => {
  const n = ++seq;
  return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `e${n}`, email: `u${n}@t.test`, passwordHash: 'x', name: `User ${n}`, role, hubId, ...extra }));
};
const actor = (u: User, tier: string | null = null) => ({ id: u.id, role: u.role, name: u.name, hubId: u.hubId ?? null, tier });
const upload = async (rider: User, buf: Buffer = PNG) => (await files.save(rider.id, buf)).id;
const send = async (rider: User, over: Record<string, unknown> = {}, buf: Buffer = PNG) => svc.upload(rider.id, { type: 'driver_licence', fileId: await upload(rider, buf), ...over }, NOW);
const audits = () => ds.getRepository(AuditLog).find({ order: { createdAt: 'ASC' } });

beforeEach(async () => {
  ds = await testDb();
  files = new PrivateFilesService(ds.getRepository(PrivateFile), null as never, { get: () => 'jwt-secret' } as never);
  emitter = recordingEmitter();
  notices = [];
  const audit = new AuditService(ds.getRepository(AuditLog), emitter as never);
  svc = new RiderComplianceService(
    ds.getRepository(RiderVehicle),
    ds.getRepository(RiderDocument),
    ds.getRepository(User),
    ds.getRepository(PrivateFile),
    audit,
    emitter as never,
    files,
    { toUser: async (to: string, data: never) => void notices.push({ to, data }) } as never,
  );
  svc.onModuleInit();
});
afterEach(() => ds.destroy());

describe('a rider reads their own vehicle and documents', () => {
  it('sees an empty vehicle until staff fill it in, and never anyone else’s', async () => {
    const h = await mkHub('H1');
    const [me, other] = [await mkUser('rider', h.id), await mkUser('rider', h.id)];
    await svc.updateVehicle(actor(await mkUser('admin_operations', null)), other.id, { model: 'Yamaha', plate: 'ab 1' }, NOW);
    const mine = await svc.mineVehicle(me.id, NOW);
    expect(mine).toMatchObject({ riderId: me.id, exists: false, model: null, plate: null });
    expect((await svc.mineVehicle(other.id, NOW)).model).toBe('Yamaha');
  });

  it('lists only their documents, newest first, each with its status and expiry', async () => {
    const h = await mkHub('H1');
    const [me, other] = [await mkUser('rider', h.id), await mkUser('rider', h.id)];
    await send(other);
    const a = await send(me, { type: 'id_card', expiresOn: '2020-01-01' });
    const b = await send(me, { type: 'vehicle_insurance', expiresOn: '2026-07-01' });
    const c = await send(me, { type: 'driver_licence', expiresOn: '2031-01-01' });
    const list = await svc.mineDocuments(me.id, NOW);
    expect(list.map((d) => d.riderId)).toEqual([me.id, me.id, me.id]);
    expect(list.map((d) => d.id).sort()).toEqual([a.id, b.id, c.id].sort());
    const byType = Object.fromEntries(list.map((d) => [d.type, d.expiry.state]));
    expect(byType).toEqual({ id_card: 'expired', vehicle_insurance: 'expiring', driver_licence: 'valid' });
  });

  it('a rider who works with an expired document is not blocked: it is a warning on the view', async () => {
    const h = await mkHub('H1');
    const me = await mkUser('rider', h.id);
    const d = await send(me, { expiresOn: '2020-01-01' });
    expect(d.expiry).toEqual({ state: 'expired', daysLeft: expect.any(Number) });
    expect(d.status).toBe('pending'); // nothing else changed: no suspension, no status flip
    expect((await ds.getRepository(User).findOneByOrFail({ id: me.id })).active).toBe(true);
  });
});

describe('uploading a document', () => {
  it('starts pending, keeps the number encrypted at rest and hands the scan to the private store', async () => {
    const h = await mkHub('H1');
    const me = await mkUser('rider', h.id);
    const fileId = await upload(me, JPG);
    const d = await svc.upload(me.id, { type: 'driver_licence', number: ' KN-123456 ', expiresOn: '2030-02-01', fileId }, NOW);
    expect(d).toMatchObject({ status: 'pending', type: 'driver_licence', number: 'KN-123456', expiresOn: '2030-02-01', mime: 'image/jpeg', reviewedByName: null, rejectionReason: null });
    const [raw] = await ds.query(`SELECT "number" FROM "rider_documents" WHERE id = ?`, [d.id]);
    expect(raw.number).toMatch(/^enc::/);
    expect(raw.number).not.toContain('KN-123456');
    expect((await ds.getRepository(PrivateFile).findOneByOrFail({ id: fileId })).kind).toBe(RIDER_DOC_KIND);
    expect(emitter.sent.some((e) => e.to === `user:${me.id}` && e.event === 'rider:document:updated')).toBe(true);
    expect(emitter.sent.some((e) => e.to === `hub:${h.id}` && e.event === 'riderCompliance:updated' && JSON.stringify(e.payload) === JSON.stringify({ riderId: me.id }))).toBe(true);
  });

  it('accepts JPEG, PNG and PDF', async () => {
    const me = await mkUser('rider', null);
    for (const [buf, mime] of [[JPG, 'image/jpeg'], [PNG, 'image/png'], [PDF, 'application/pdf']] as const) expect((await send(me, {}, buf)).mime).toBe(mime);
  });

  it('refuses a WebP scan, a missing file, another rider’s file and a file that was already sent', async () => {
    const [me, other] = [await mkUser('rider', null), await mkUser('rider', null)];
    await expect(send(me, {}, WEBP)).rejects.toThrow('Only JPEG, PNG or PDF files are accepted.');
    await expect(svc.upload(me.id, { type: 'other', fileId: '11111111-2222-3333-4444-555555555555' }, NOW)).rejects.toThrow('Upload the file again and retry.');
    const theirs = await upload(other);
    await expect(svc.upload(me.id, { type: 'other', fileId: theirs }, NOW)).rejects.toThrow('Upload the file again and retry.');
    const mine = await upload(me);
    await svc.upload(me.id, { type: 'other', fileId: mine }, NOW);
    await expect(svc.upload(me.id, { type: 'id_card', fileId: mine }, NOW)).rejects.toThrow('This file was already sent.');
  });

  it('refuses a file over 5 MB even if it slipped into the store', async () => {
    const me = await mkUser('rider', null);
    const id = await upload(me);
    await ds.getRepository(PrivateFile).update({ id }, { size: 6 * 1024 * 1024 });
    await expect(svc.upload(me.id, { type: 'other', fileId: id }, NOW)).rejects.toThrow('too large');
  });

  it('refuses a bad type, a bad date and a missing file id', async () => {
    const me = await mkUser('rider', null);
    const fileId = await upload(me);
    await expect(svc.upload(me.id, { type: 'passport', fileId }, NOW)).rejects.toThrow(/Document type/);
    await expect(svc.upload(me.id, { type: 'other', fileId, expiresOn: '31/12/2030' }, NOW)).rejects.toThrow(/Expiry date/);
    await expect(svc.upload(me.id, { type: 'other' }, NOW)).rejects.toThrow(/file id/);
    expect(await ds.getRepository(RiderDocument).count()).toBe(0);
  });

  it('is for riders only and capped', async () => {
    const customer = await mkUser('customer', null);
    await expect(svc.upload(customer.id, { type: 'other', fileId: await upload(customer) }, NOW)).rejects.toThrow('Rider not found.');
    const me = await mkUser('rider', null);
    for (let i = 0; i < 30; i++) await ds.getRepository(RiderDocument).insert({ riderId: me.id, type: 'other', fileId: `f-${i}`.padEnd(36, 'x'), mime: 'image/png', size: 1, status: 'pending' });
    await expect(send(me)).rejects.toThrow('limit of documents');
  });
});

describe('who may read and edit a rider’s vehicle', () => {
  it('operations admins any rider; supervisors and managers their own warehouse; nobody else', async () => {
    const [h1, h2] = [await mkHub('H1'), await mkHub('H2')];
    const [r1, r2] = [await mkRider(h1.id), await mkRider(h2.id)];
    const ops = await mkUser('admin_operations', null);
    const root = await mkUser('admin', null);
    const sup = await mkUser('warehouse_staff', h1.id, { warehouseTier: 'supervisor' });
    const mgr = await mkUser('warehouse_staff', h1.id, { warehouseTier: 'manager' });
    for (const who of [actor(ops), actor(root), actor(sup, 'supervisor'), actor(mgr, 'manager')]) {
      await expect(svc.staffView(who, r1.id, NOW)).resolves.toMatchObject({ canEdit: true, rider: { id: r1.id } });
    }
    await expect(svc.staffView(actor(ops), r2.id, NOW)).resolves.toBeDefined();
    // another warehouse: the rider simply is not there
    await expect(svc.staffView(actor(sup, 'supervisor'), r2.id, NOW)).rejects.toThrow('Rider not found.');
    await expect(svc.updateVehicle(actor(mgr, 'manager'), r2.id, { model: 'x' }, NOW)).rejects.toThrow('Rider not found.');
  });

  it('an operator of the warehouse (lowest tier) and the other staff roles are refused', async () => {
    const h1 = await mkHub('H1');
    const r1 = await mkRider(h1.id);
    const op = await mkUser('warehouse_staff', h1.id, { warehouseTier: 'operator' });
    await expect(svc.staffView(actor(op, 'operator'), r1.id, NOW)).rejects.toThrow('Only supervisors and managers');
    await expect(svc.updateVehicle(actor(op, 'operator'), r1.id, { model: 'x' }, NOW)).rejects.toThrow('Only supervisors and managers');
    for (const role of ['admin_finance', 'admin_support', 'admin_marketing', 'admin_moderation', 'customer', 'seller', 'rider'] as const) {
      const u = await mkUser(role, null);
      await expect(svc.staffView(actor(u), r1.id, NOW)).rejects.toThrow('Not allowed.');
      await expect(svc.updateVehicle(actor(u), r1.id, { model: 'x' }, NOW)).rejects.toThrow('Not allowed.');
    }
    expect(await ds.getRepository(RiderVehicle).count()).toBe(0);
    // a warehouse account with no warehouse can never match a rider with no warehouse
    const lost = await mkRider(null);
    const ghost = await mkUser('warehouse_staff', null, { warehouseTier: 'manager' });
    await expect(svc.staffView(actor(ghost, 'manager'), lost.id, NOW)).rejects.toThrow('Rider not found.');
  });

  it('only a rider can be the subject', async () => {
    const ops = actor(await mkUser('admin_operations', null));
    const customer = await mkUser('customer', null);
    await expect(svc.staffView(ops, customer.id, NOW)).rejects.toThrow('Rider not found.');
    await expect(svc.staffView(ops, 'nope', NOW)).rejects.toThrow('Rider not found.');
    await expect(svc.staffView(ops, undefined, NOW)).rejects.toThrow('Rider not found.');
  });

  const mkRider = (hubId: string | null) => mkUser('rider', hubId);
});

describe('editing the vehicle', () => {
  const ops = async () => actor(await mkUser('admin_operations', null));

  it('saves, returns the warnings and tells the rider', async () => {
    const h = await mkHub('H1');
    const rider = await mkUser('rider', h.id);
    const v = await svc.updateVehicle(await ops(), rider.id, {
      model: 'Honda CG 125', type: 'motorbike', plate: 'kn 4821 a', colour: 'Black', odometerKm: 18240, fuel: 'petrol',
      insuranceValidUntil: '2026-07-01', lastServiceOn: '2026-05-12', nextServiceOn: '2026-06-01',
    }, NOW);
    expect(v).toMatchObject({ exists: true, model: 'Honda CG 125', plate: 'KN 4821 A', odometerKm: 18240, insurance: { state: 'expiring', daysLeft: 16 }, service: { state: 'expired', daysLeft: -14 } });
    expect(await svc.mineVehicle(rider.id, NOW)).toMatchObject({ plate: 'KN 4821 A', fuel: 'petrol' }); // what the rider reads is what staff saved
    expect(emitter.sent.filter((e) => e.event === 'rider:vehicle:updated' && e.to === `user:${rider.id}`)).toHaveLength(1);
  });

  it('changes only what was sent, and null or empty clears a field', async () => {
    const rider = await mkUser('rider', null);
    const who = await ops();
    await svc.updateVehicle(who, rider.id, { model: 'A', colour: 'Red', odometerKm: 5 }, NOW);
    const v = await svc.updateVehicle(who, rider.id, { colour: '', odometerKm: 9 }, NOW);
    expect(v).toMatchObject({ model: 'A', colour: null, odometerKm: 9 });
    expect(await ds.getRepository(RiderVehicle).count()).toBe(1); // one row per rider
  });

  it('refuses bad input and writes nothing', async () => {
    const rider = await mkUser('rider', null);
    const who = await ops();
    await expect(svc.updateVehicle(who, rider.id, { type: 'jet' }, NOW)).rejects.toThrow(/Type must be one of/);
    await expect(svc.updateVehicle(who, rider.id, { insuranceValidUntil: '2026-02-30' }, NOW)).rejects.toThrow(/Insurance valid until/);
    await expect(svc.updateVehicle(who, rider.id, { odometerKm: -5 }, NOW)).rejects.toThrow(/Odometer/);
    expect(await ds.getRepository(RiderVehicle).count()).toBe(0);
    expect(await audits()).toHaveLength(0);
  });

  it('audits every write with the field names and not their values', async () => {
    const h = await mkHub('H1');
    const rider = await mkUser('rider', h.id);
    const sup = await mkUser('warehouse_staff', h.id, { warehouseTier: 'supervisor' });
    await svc.updateVehicle(actor(sup, 'supervisor'), rider.id, { plate: 'SECRET-PLATE-1', colour: 'Blue' }, NOW);
    await svc.updateVehicle(actor(sup, 'supervisor'), rider.id, { plate: 'SECRET-PLATE-1', colour: 'Blue' }, NOW); // nothing changed: no second entry
    await svc.updateVehicle(actor(sup, 'supervisor'), rider.id, { colour: 'Green' }, NOW);
    const log = await audits();
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ actor: sup.name, role: 'warehouse_staff', action: 'rider.vehicle.updated', entity: 'rider_vehicle' });
    expect(log[0].detail).toBe(`rider ${rider.id}: plate, colour`);
    expect(log[1].detail).toMatch(/: colour$/);
    expect(JSON.stringify(log)).not.toContain('SECRET-PLATE-1');
    expect(emitter.sent.some((e) => e.event === 'audit:created')).toBe(true);
  });
});

describe('approving and rejecting documents', () => {
  it('approve: records who and when, audits, tells the rider (the French comes from localize.ts)', async () => {
    const h = await mkHub('H1');
    const rider = await mkUser('rider', h.id);
    const sup = await mkUser('warehouse_staff', h.id, { warehouseTier: 'supervisor' });
    const d = await send(rider, { type: 'vehicle_insurance' });
    const out = await svc.review(actor(sup, 'supervisor'), d.id, 'approve', undefined, NOW);
    expect(out).toMatchObject({ status: 'approved', reviewedByName: sup.name, reviewedAt: NOW, rejectionReason: null });
    expect(await audits()).toEqual([expect.objectContaining({ action: 'rider.document.approved', entity: 'rider_document', entityId: d.id, actor: sup.name, role: 'warehouse_staff' })]);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ to: rider.id, data: { title: 'Document approved', body: 'Your vehicle insurance was approved.' } });
    const fr = localizeNotice(notices[0].data.title, notices[0].data.body, 'fr');
    expect(fr).toEqual({ title: 'Document approuvé', body: 'Votre document « assurance du véhicule » a été approuvé.' });
    expect((await svc.mineDocuments(rider.id, NOW))[0].status).toBe('approved');
  });

  it('reject needs a reason, stores it, audits it and lets the rider read it', async () => {
    const rider = await mkUser('rider', null);
    const ops = actor(await mkUser('admin_operations', null));
    const d = await send(rider);
    await expect(svc.review(ops, d.id, 'reject', '', NOW)).rejects.toThrow('Give a reason');
    await expect(svc.review(ops, d.id, 'reject', undefined, NOW)).rejects.toThrow('Give a reason');
    expect((await svc.mineDocuments(rider.id, NOW))[0].status).toBe('pending');
    const out = await svc.review(ops, d.id, 'reject', 'Photo is blurry, retake it', NOW);
    expect(out).toMatchObject({ status: 'rejected', rejectionReason: 'Photo is blurry, retake it' });
    const log = await audits();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ action: 'rider.document.rejected', entityId: d.id });
    expect(log[0].detail).toContain('Photo is blurry');
    expect(notices[0].data).toMatchObject({ title: 'Document rejected', body: 'Your driver licence was rejected: Photo is blurry, retake it' });
    expect(localizeNotice(notices[0].data.title, notices[0].data.body, 'fr')).toEqual({ title: 'Document refusé', body: 'Votre document « permis de conduire » a été refusé : Photo is blurry, retake it' });
    // approving later clears the reason
    const again = await svc.review(ops, d.id, 'approve', undefined, NOW);
    expect(again).toMatchObject({ status: 'approved', rejectionReason: null });
    await expect(svc.review(ops, d.id, 'approve', undefined, NOW)).rejects.toThrow('already approved');
  });

  it('refuses an unknown decision, an unknown document and someone out of scope', async () => {
    const [h1, h2] = [await mkHub('H1'), await mkHub('H2')];
    const rider = await mkUser('rider', h1.id);
    const d = await send(rider);
    const ops = actor(await mkUser('admin_operations', null));
    await expect(svc.review(ops, d.id, 'maybe', undefined, NOW)).rejects.toThrow('approve or reject');
    await expect(svc.review(ops, '11111111-2222-3333-4444-555555555555', 'approve', undefined, NOW)).rejects.toThrow('Document not found.');
    await expect(svc.review(ops, undefined, 'approve', undefined, NOW)).rejects.toThrow('Document not found.');
    const elsewhere = await mkUser('warehouse_staff', h2.id, { warehouseTier: 'manager' });
    await expect(svc.review(actor(elsewhere, 'manager'), d.id, 'approve', undefined, NOW)).rejects.toThrow('Rider not found.');
    const operator = await mkUser('warehouse_staff', h1.id, { warehouseTier: 'operator' });
    await expect(svc.review(actor(operator, 'operator'), d.id, 'approve', undefined, NOW)).rejects.toThrow('Only supervisors and managers');
    const finance = await mkUser('admin_finance', null);
    await expect(svc.review(actor(finance), d.id, 'approve', undefined, NOW)).rejects.toThrow('Not allowed.');
    const self = actor(rider);
    await expect(svc.review(self, d.id, 'approve', undefined, NOW)).rejects.toThrow('Not allowed.'); // a rider cannot approve their own
    expect((await svc.mineDocuments(rider.id, NOW))[0].status).toBe('pending');
    expect(await audits()).toHaveLength(0);
  });
});

describe('opening a document scan (private:link / download)', () => {
  it('the rider, staff of the rider’s warehouse (supervisor and above) and operations admins; nobody else', async () => {
    const [h1, h2] = [await mkHub('H1'), await mkHub('H2')];
    const rider = await mkUser('rider', h1.id);
    const d = await send(rider);
    const can = async (u: User) => files.open({ id: u.id, role: u.role }, d.fileId).then(() => true, () => false);
    expect(await can(rider)).toBe(true);
    expect(await can(await mkUser('admin_operations', null))).toBe(true);
    expect(await can(await mkUser('admin', null))).toBe(true);
    expect(await can(await mkUser('warehouse_staff', h1.id, { warehouseTier: 'supervisor' }))).toBe(true);
    expect(await can(await mkUser('warehouse_staff', h1.id, { warehouseTier: 'manager' }))).toBe(true);
    expect(await can(await mkUser('warehouse_staff', h1.id, { warehouseTier: 'operator' }))).toBe(false);
    expect(await can(await mkUser('warehouse_staff', h2.id, { warehouseTier: 'manager' }))).toBe(false);
    expect(await can(await mkUser('warehouse_staff', h1.id, { warehouseTier: 'manager', active: false }))).toBe(false);
    expect(await can(await mkUser('rider', h1.id))).toBe(false);
    expect(await can(await mkUser('customer', null))).toBe(false);
    expect(await can(await mkUser('admin_finance', null))).toBe(false);
    // the store-application reviewers lose their blanket access to this kind of file
    expect(await can(await mkUser('admin_moderation', null))).toBe(false);
  });

  it('store KYC files keep their old rule', async () => {
    const owner = await mkUser('seller', null);
    const f = await files.save(owner.id, PNG);
    const mod = await mkUser('admin_moderation', null);
    await expect(files.open({ id: mod.id, role: mod.role }, f.id)).resolves.toBeDefined();
  });
});
