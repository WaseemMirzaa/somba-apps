import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { DeliveryService } from '../delivery/delivery.service';
import { DeliveryProof, DeliveryTask, Order, User } from '../database/entities';
import { testDb } from '../testing/test-db';
import { UsersService } from '../users/users.service';
import { DeliveryProofController } from './delivery-proof.controller';
import { DeliveryProofGateway } from './delivery-proof.gateway';
import { DeliveryProofService, LATE_PROOF_MS, MAX_PHOTO_BYTES, MAX_SIGNATURE_BYTES, proofDir, sniffProofImage } from './delivery-proof.service';

// The private folder is read at call time: point it at a scratch directory.
process.env.PRIVATE_UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'somba-pod-'));

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const GIF = Buffer.from('GIF89a' + 'x'.repeat(40));
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

let ds: DataSource;
let svc: DeliveryProofService;
let seq = 0;

const mkUser = (role: string, hubId: string | null = null, active = true) => {
  const n = ++seq;
  return ds.getRepository(User).save(ds.getRepository(User).create({ emailHash: `h${n}`, email: `u${n}@t.test`, passwordHash: 'x', name: `User ${n}`, role: role as never, hubId, active }));
};
const mkTask = (o: Partial<DeliveryTask>) =>
  ds.getRepository(DeliveryTask).save(ds.getRepository(DeliveryTask).create({ orderId: `o${++seq}`, orderReference: `SOM-${seq}`, status: 'in_transit', kind: 'delivery', ...o }));
const files = () => (existsSync(proofDir()) ? readdirSync(proofDir()) : []);

beforeEach(async () => {
  ds = await testDb();
  svc = new DeliveryProofService(ds.getRepository(DeliveryProof), ds.getRepository(DeliveryTask), ds.getRepository(User), { get: () => 'jwt-secret' } as never);
});
afterEach(() => ds.destroy());

describe('proof of delivery: what is accepted', () => {
  it('stores a photo and a signature in the PRIVATE folder and records them on the leg', async () => {
    const rider = await mkUser('rider');
    const task = await mkTask({ riderId: rider.id });
    const out = await svc.attach(rider.id, task.id, { photo: JPG, signature: PNG });
    expect(out).toMatchObject({ taskId: task.id, hasPhoto: true, hasSignature: true });
    const row = await ds.getRepository(DeliveryProof).findOneByOrFail({ taskId: task.id });
    expect(row).toMatchObject({ orderId: task.orderId, riderId: rider.id, photoMime: 'image/jpeg', signatureMime: 'image/png' });
    expect(readFileSync(join(proofDir(), row.photoFile!))).toEqual(JPG);
    expect(readFileSync(join(proofDir(), row.signatureFile!))).toEqual(PNG);
    expect(proofDir().startsWith(process.env.PRIVATE_UPLOAD_DIR!)).toBe(true);
    expect(proofDir()).not.toMatch(/[\\/]uploads$/);
  });

  it('accepts a photo alone or a signature alone, and a second upload replaces the first and removes the old file', async () => {
    const rider = await mkUser('rider');
    const task = await mkTask({ riderId: rider.id, status: 'picked_up' });
    await svc.attach(rider.id, task.id, { signature: PNG });
    const before = (await ds.getRepository(DeliveryProof).findOneByOrFail({ taskId: task.id })).signatureFile!;
    const again = await svc.attach(rider.id, task.id, { signature: PNG, photo: PNG });
    expect(again).toMatchObject({ hasPhoto: true, hasSignature: true });
    const row = await ds.getRepository(DeliveryProof).findOneByOrFail({ taskId: task.id });
    expect(row.signatureFile).not.toBe(before);
    expect(existsSync(join(proofDir(), before))).toBe(false);
    expect(await ds.getRepository(DeliveryProof).count({ where: { taskId: task.id } })).toBe(1);
  });

  it('refuses another rider and an unknown task, with the same answer', async () => {
    const [mine, other] = [await mkUser('rider'), await mkUser('rider')];
    const task = await mkTask({ riderId: mine.id });
    const unassigned = await mkTask({ riderId: null });
    const before = files().length;
    await expect(svc.attach(other.id, task.id, { photo: JPG })).rejects.toThrow('Delivery task not found.');
    await expect(svc.attach(other.id, unassigned.id, { photo: JPG })).rejects.toThrow('Delivery task not found.');
    await expect(svc.attach(mine.id, '00000000-0000-0000-0000-000000000000', { photo: JPG })).rejects.toThrow('Delivery task not found.');
    await expect(svc.attach(mine.id, 'not-an-id', { photo: JPG })).rejects.toThrow('Delivery task not found.');
    expect(files().length).toBe(before);
    expect(await ds.getRepository(DeliveryProof).count()).toBe(0);
  });

  it('refuses the wrong type (sniffed from the bytes, not the name) and oversized files, and writes nothing', async () => {
    const rider = await mkUser('rider');
    const task = await mkTask({ riderId: rider.id });
    const before = files().length;
    await expect(svc.attach(rider.id, task.id, { photo: GIF })).rejects.toThrow(/JPEG or PNG/);
    await expect(svc.attach(rider.id, task.id, { photo: HTML })).rejects.toThrow(/JPEG or PNG/);
    await expect(svc.attach(rider.id, task.id, { signature: JPG })).rejects.toThrow(/signature must be a PNG/);
    await expect(svc.attach(rider.id, task.id, { photo: Buffer.concat([JPG, Buffer.alloc(MAX_PHOTO_BYTES)]) })).rejects.toThrow(/too large/);
    await expect(svc.attach(rider.id, task.id, { signature: Buffer.concat([PNG, Buffer.alloc(MAX_SIGNATURE_BYTES)]) })).rejects.toThrow(/too large/);
    // A good photo with a bad signature: neither is kept.
    await expect(svc.attach(rider.id, task.id, { photo: JPG, signature: GIF })).rejects.toThrow(/signature/);
    await expect(svc.attach(rider.id, task.id, {})).rejects.toThrow(/photo or a signature/);
    expect(files().length).toBe(before);
    expect(await ds.getRepository(DeliveryProof).count()).toBe(0);
    expect(sniffProofImage(PNG)).toBe('png');
    expect(sniffProofImage(JPG)).toBe('jpg');
    expect(sniffProofImage(GIF)).toBeNull();
  });

  it('takes proof only on a customer handover that is under way (or just completed)', async () => {
    const rider = await mkUser('rider');
    const transfer = await mkTask({ riderId: rider.id, kind: 'transfer' });
    const assigned = await mkTask({ riderId: rider.id, status: 'assigned' });
    const failed = await mkTask({ riderId: rider.id, status: 'failed' });
    const old = await mkTask({ riderId: rider.id, status: 'delivered', deliveredAt: new Date(Date.now() - LATE_PROOF_MS - 60_000) });
    const fresh = await mkTask({ riderId: rider.id, status: 'delivered', deliveredAt: new Date() });
    const replacement = await mkTask({ riderId: rider.id, kind: 'replacement_delivery' });
    await expect(svc.attach(rider.id, transfer.id, { photo: JPG })).rejects.toThrow(/only taken on a delivery to the customer/);
    await expect(svc.attach(rider.id, assigned.id, { photo: JPG })).rejects.toThrow(/under way/);
    await expect(svc.attach(rider.id, failed.id, { photo: JPG })).rejects.toThrow(/under way/);
    await expect(svc.attach(rider.id, old.id, { photo: JPG })).rejects.toThrow(/under way/);
    await expect(svc.attach(rider.id, fresh.id, { photo: JPG })).resolves.toMatchObject({ hasPhoto: true });
    await expect(svc.attach(rider.id, replacement.id, { photo: JPG })).resolves.toMatchObject({ hasPhoto: true });
  });
});

describe('proof of delivery: who can read it', () => {
  it('lets operations and support admins and the staff of the right warehouse in; everyone else gets "not found"', async () => {
    const rider = await mkUser('rider');
    const [hubA, hubB] = ['hub-a', 'hub-b'];
    const task = await mkTask({ riderId: rider.id, hubId: hubA });
    await svc.attach(rider.id, task.id, { photo: JPG, signature: PNG });
    await ds.getRepository(DeliveryTask).update({ id: task.id }, { status: 'delivered', deliveredAt: new Date() });

    const ok = [await mkUser('admin'), await mkUser('admin_operations'), await mkUser('admin_support'), await mkUser('warehouse_staff', hubA)];
    for (const u of ok) {
      const links = await svc.links({ id: u.id, role: u.role }, task.id, 'https://api.test');
      expect(links?.photoUrl).toMatch(new RegExp(`^https://api.test/api/v1/delivery-proofs/${task.id}/photo\\?uid=${u.id}&exp=\\d+&sig=[0-9a-f]{64}$`));
      expect(links?.signatureUrl).toContain('/signature?');
      expect((await svc.open({ id: u.id, role: u.role }, task.id, 'photo')).mime).toBe('image/jpeg');
    }
    const denied = [await mkUser('admin_marketing'), await mkUser('admin_finance'), await mkUser('customer'), await mkUser('seller'), await mkUser('rider'), await mkUser('warehouse_staff', hubB), await mkUser('warehouse_staff', null), await mkUser('warehouse_staff', hubA, false)];
    for (const u of denied) {
      await expect(svc.links({ id: u.id, role: u.role }, task.id, 'https://api.test')).rejects.toThrow('Delivery task not found.');
      await expect(svc.open({ id: u.id, role: u.role }, task.id, 'photo')).rejects.toThrow('Delivery task not found.');
    }
  });

  it('shows nothing before the leg is delivered, and null for a delivery without proof', async () => {
    const rider = await mkUser('rider');
    const admin = await mkUser('admin');
    const task = await mkTask({ riderId: rider.id });
    await svc.attach(rider.id, task.id, { photo: JPG });
    expect(await svc.links(admin, task.id, 'https://api.test')).toBeNull(); // still in transit: a refused code must not leave a "proof"
    const bare = await mkTask({ riderId: rider.id, status: 'delivered', deliveredAt: new Date() });
    expect(await svc.links(admin, bare.id, 'https://api.test')).toBeNull();
    await expect(svc.open(admin, bare.id, 'photo')).rejects.toThrow('File not found.');
    await expect(svc.open(admin, task.id, '../../etc/passwd')).rejects.toThrow('File not found.');
  });

  it('signed links verify only for the right task, part, person and time', async () => {
    const rider = await mkUser('rider');
    const admin = await mkUser('admin');
    const task = await mkTask({ riderId: rider.id });
    await svc.attach(rider.id, task.id, { photo: JPG });
    await ds.getRepository(DeliveryTask).update({ id: task.id }, { status: 'delivered', deliveredAt: new Date() });
    const url = new URL((await svc.links(admin, task.id, 'https://api.test'))!.photoUrl!);
    const [uid, exp, sig] = ['uid', 'exp', 'sig'].map((k) => url.searchParams.get(k)!);
    expect(svc.verifyLink(task.id, 'photo', uid, Number(exp), sig)).toBe(admin.id);
    expect(svc.verifyLink(task.id, 'signature', uid, Number(exp), sig)).toBeNull();
    expect(svc.verifyLink('other', 'photo', uid, Number(exp), sig)).toBeNull();
    expect(svc.verifyLink(task.id, 'photo', rider.id, Number(exp), sig)).toBeNull();
    expect(svc.verifyLink(task.id, 'photo', uid, Number(exp) + 1, sig)).toBeNull();
    expect(svc.verifyLink(task.id, 'photo', uid, Date.now() - 1000, sig)).toBeNull();
    expect(svc.verifyLink(task.id, 'photo', uid, Number(exp), 'zz')).toBeNull();
  });
});

describe('proof of delivery over HTTP and sockets', () => {
  let app: INestApplication;
  let rider: User;
  let other: User;
  let admin: User;
  let task: DeliveryTask;

  beforeEach(async () => {
    [rider, other, admin] = [await mkUser('rider'), await mkUser('rider'), await mkUser('admin')];
    task = await mkTask({ riderId: rider.id });
    const tokens: Record<string, string> = { [`t-${rider.id}`]: rider.id, [`t-${other.id}`]: other.id, [`t-${admin.id}`]: admin.id };
    const byId = async (id: string) => ds.getRepository(User).findOne({ where: { id } });
    const mod = await Test.createTestingModule({
      controllers: [DeliveryProofController],
      providers: [
        { provide: DeliveryProofService, useValue: svc },
        { provide: UsersService, useValue: { findById: byId } },
        {
          provide: AuthService,
          useValue: {
            verifyAccess: async (t: string) => {
              if (!tokens[t]) throw new Error('bad token');
              return { sub: tokens[t], tokenVersion: 0 };
            },
          },
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterEach(() => app.close());

  const post = (id: string, token: string | null) => {
    const r = request(app.getHttpServer()).post(`/api/v1/delivery-proofs/${id}`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
  };

  it('the assigned rider uploads a photo and a signature (multipart) and the delivery then completes with no extra step', async () => {
    const res = await post(task.id, `t-${rider.id}`).attach('photo', JPG, { filename: 'p.jpg', contentType: 'image/jpeg' }).attach('signature', PNG, { filename: 's.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ taskId: task.id, hasPhoto: true, hasSignature: true });
    await ds.getRepository(DeliveryTask).update({ id: task.id }, { status: 'delivered', deliveredAt: new Date() });
    // Staff read it back through the authorized route.
    const got = await request(app.getHttpServer()).get(`/api/v1/delivery-proofs/${task.id}/photo`).set('Authorization', `Bearer t-${admin.id}`);
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toBe('image/jpeg');
    expect(got.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(got.body)).toEqual(JPG);
  });

  it('refuses another rider, a missing token, a non-rider, a bad type and an oversized photo; nothing is stored', async () => {
    expect((await post(task.id, `t-${other.id}`).attach('photo', JPG, 'p.jpg')).status).toBe(404);
    expect((await post(task.id, null).attach('photo', JPG, 'p.jpg')).status).toBe(401);
    expect((await post(task.id, 'garbage').attach('photo', JPG, 'p.jpg')).status).toBe(401);
    expect((await post(task.id, `t-${admin.id}`).attach('photo', JPG, 'p.jpg')).status).toBe(403);
    expect((await post(task.id, `t-${rider.id}`).attach('photo', GIF, { filename: 'p.jpg', contentType: 'image/jpeg' })).status).toBe(400);
    expect((await post(task.id, `t-${rider.id}`).attach('photo', Buffer.concat([JPG, Buffer.alloc(MAX_PHOTO_BYTES + 10)]), 'big.jpg')).status).toBe(413);
    expect((await post(task.id, `t-${rider.id}`).field('x', 'y')).status).toBe(400);
    expect(await ds.getRepository(DeliveryProof).count()).toBe(0);
  });

  it('downloads need a login or a valid signed link; riders and other staff are refused', async () => {
    await svc.attach(rider.id, task.id, { photo: JPG });
    await ds.getRepository(DeliveryTask).update({ id: task.id }, { status: 'delivered', deliveredAt: new Date() });
    const url = `/api/v1/delivery-proofs/${task.id}/photo`;
    expect((await request(app.getHttpServer()).get(url)).status).toBe(401);
    expect((await request(app.getHttpServer()).get(url).set('Authorization', `Bearer t-${rider.id}`)).status).toBe(404);
    const link = new URL((await svc.links(admin, task.id, 'http://x'))!.photoUrl!);
    expect((await request(app.getHttpServer()).get(link.pathname + link.search)).status).toBe(200);
    expect((await request(app.getHttpServer()).get(link.pathname + link.search.replace(/sig=./, 'sig=0'))).status).toBe(401);
    expect((await request(app.getHttpServer()).get(`/api/v1/delivery-proofs/${task.id}/signature${link.search}`)).status).toBe(401);
  });

  it('the socket event hands staff signed links, audits the opening, and refuses a guest', async () => {
    await svc.attach(rider.id, task.id, { photo: JPG, signature: PNG });
    await ds.getRepository(DeliveryTask).update({ id: task.id }, { status: 'delivered', deliveredAt: new Date() });
    const audits: unknown[] = [];
    const gw = new DeliveryProofGateway(svc, { record: async (e: unknown) => void audits.push(e) } as never);
    const sock = (user?: { id: string; role: string; name: string }) => ({ data: { user }, handshake: { headers: { host: 'api.test' } } }) as never;
    const res = await gw.get(sock({ id: admin.id, role: 'admin', name: 'Ada' }), { taskId: task.id });
    expect(res.ok && res.data?.photoUrl).toContain(`/api/v1/delivery-proofs/${task.id}/photo?`);
    expect(audits).toEqual([expect.objectContaining({ action: 'delivery.proof_viewed', entity: 'delivery', entityId: task.id, actor: 'Ada' })]);
    expect(await gw.get(sock({ id: rider.id, role: 'rider', name: 'R' }), { taskId: task.id })).toEqual({ ok: false, error: 'Delivery task not found.' });
    expect(await gw.get(sock({ id: 'g', role: 'guest', name: '' }), { taskId: task.id })).toEqual({ ok: false, error: 'Sign in to continue.' });
    expect(await gw.get(sock(undefined), { taskId: task.id })).toEqual({ ok: false, error: 'Sign in to continue.' });
    expect(audits).toHaveLength(1);
  });
});

describe('proof of delivery with the delivery code flow (DeliveryService, unchanged)', () => {
  const emitter = { toRoles: () => undefined, toHub: () => undefined, toUser: () => undefined };
  const build = (code: string | null, requireCode = true) => {
    const settings = { get: async (k: string) => (k === 'requireDeliveryCode' ? String(requireCode) : null) };
    const logistics = { proofCodeOf: async () => code, afterRiderStatus: async () => undefined, emitTask: async () => undefined };
    const payments = { markCollected: async () => undefined };
    return new DeliveryService(ds.getRepository(DeliveryTask), ds.getRepository(Order), emitter as never, payments as never, settings as never, logistics as never);
  };

  it('completes with the right code and no proof at all, exactly as before', async () => {
    const rider = await mkUser('rider');
    const task = await mkTask({ riderId: rider.id });
    const done = await build('4321').updateStatus(task.id, 'delivered', rider.id, undefined, '4321');
    expect(done.status).toBe('delivered');
    expect(await ds.getRepository(DeliveryProof).count()).toBe(0);
    expect(await svc.links({ id: 'a', role: 'admin' }, task.id, 'http://x')).toBeNull();
  });

  it('a wrong code still refuses the delivery even when proof was captured, and the proof stays hidden', async () => {
    const rider = await mkUser('rider');
    const admin = await mkUser('admin');
    const task = await mkTask({ riderId: rider.id });
    await svc.attach(rider.id, task.id, { photo: JPG, signature: PNG });
    const delivery = build('4321');
    await expect(delivery.updateStatus(task.id, 'delivered', rider.id, undefined, '0000')).rejects.toThrow(/Wrong delivery code/);
    expect((await ds.getRepository(DeliveryTask).findOneByOrFail({ id: task.id })).status).toBe('in_transit');
    expect(await svc.links(admin, task.id, 'http://x')).toBeNull();
    await delivery.updateStatus(task.id, 'delivered', rider.id, undefined, '4321');
    expect(await svc.links(admin, task.id, 'http://x')).toMatchObject({ photoUrl: expect.any(String), signatureUrl: expect.any(String) });
  });
});
