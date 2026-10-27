import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { PrivateFile, Seller } from '../database/entities';
import { testDb } from '../testing/test-db';

// The folders are read when the module loads: point them at a scratch directory first.
const root = mkdtempSync(join(tmpdir(), 'somba-private-'));
process.env.UPLOAD_DIR = join(root, 'public');
process.env.PRIVATE_UPLOAD_DIR = join(root, 'private');
mkdirSync(process.env.UPLOAD_DIR, { recursive: true });
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrivateFilesService, sniffPrivate, privateIdOf, KYC_REVIEWERS } = require('./private-files.service') as typeof import('./private-files.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { validateKyc } = require('../ops/sellers.service') as typeof import('../ops/sellers.service');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.4\n%fake\n');
const ID = '11111111-2222-3333-4444-555555555555';

let ds: DataSource;
let svc: InstanceType<typeof PrivateFilesService>;

beforeEach(async () => {
  ds = await testDb();
  svc = new PrivateFilesService(ds.getRepository(PrivateFile), ds.getRepository(Seller), { get: () => 'jwt-secret' } as never);
});
afterEach(() => ds.destroy());

/** A file in the PUBLIC folder, as an old client left it. */
function publicUpload(name = `${ID}.png`): string {
  writeFileSync(join(process.env.UPLOAD_DIR!, name), PNG);
  return `http://localhost:3024/uploads/${name}`;
}

describe('private files: what is accepted', () => {
  it('detects real file types from the first bytes, whatever the name says', () => {
    expect(sniffPrivate(PNG)).toBe('png');
    expect(sniffPrivate(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('jpg');
    expect(sniffPrivate(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('webp');
    expect(sniffPrivate(PDF)).toBe('pdf');
    expect(sniffPrivate(Buffer.from('<script>alert(1)</script>'))).toBeNull();
    expect(sniffPrivate(Buffer.alloc(0))).toBeNull();
  });

  it('stores an upload outside the public folder and returns its id and URL', async () => {
    const out = await svc.save('owner-1', PNG, 'http://api.test');
    expect(out.url).toBe(`http://api.test/api/v1/private-uploads/${out.id}`);
    expect(out).toMatchObject({ mime: 'image/png', size: PNG.length });
    const row = await ds.getRepository(PrivateFile).findOneByOrFail({ id: out.id });
    expect(row.ownerUserId).toBe('owner-1');
    expect(existsSync(join(process.env.PRIVATE_UPLOAD_DIR!, row.storedName))).toBe(true);
    expect(existsSync(join(process.env.UPLOAD_DIR!, row.storedName))).toBe(false);
    expect(privateIdOf(out.url)).toBe(out.id);
  });

  it('refuses scripts, executables and oversized files', async () => {
    await expect(svc.save('o', Buffer.from('<html></html>'))).rejects.toThrow(/Only JPEG, PNG, WebP or PDF/);
    await expect(svc.save('o', Buffer.concat([PDF, Buffer.alloc(6 * 1024 * 1024)]))).rejects.toThrow(/too large/);
  });

  it('recognises private URLs only in the exact shape', () => {
    expect(privateIdOf(`https://api.somba.app/api/v1/private-uploads/${ID}`)).toBe(ID);
    expect(privateIdOf(`/api/v1/private-uploads/${ID}`)).toBe(ID);
    expect(privateIdOf(`https://x/uploads/${ID}.png`)).toBeNull();
    expect(privateIdOf(`https://x/api/v1/private-uploads/${ID}/../x`)).toBeNull();
    expect(privateIdOf(`https://x/api/v1/private-uploads/not-an-id`)).toBeNull();
    expect(privateIdOf('garbage')).toBeNull();
  });
});

describe('private files: who may read', () => {
  it('the owner and the reviewers only', async () => {
    const f = await svc.save('owner-1', PNG);
    await expect(svc.open({ id: 'owner-1', role: 'seller' }, f.id)).resolves.toMatchObject({ mime: 'image/png' });
    for (const role of KYC_REVIEWERS) await expect(svc.open({ id: 'rev', role }, f.id)).resolves.toBeDefined();
    for (const role of ['admin_finance', 'admin_support', 'admin_marketing', 'warehouse_staff', 'rider', 'customer', 'seller']) {
      await expect(svc.open({ id: 'someone', role }, f.id)).rejects.toThrow('File not found.');
    }
  });
  it('a made-up id and a forbidden id get the same answer', async () => {
    const f = await svc.save('owner-1', PNG);
    await expect(svc.open({ id: 'x', role: 'seller' }, f.id)).rejects.toThrow('File not found.');
    await expect(svc.open({ id: 'owner-1', role: 'seller' }, ID)).rejects.toThrow('File not found.');
    await expect(svc.open({ id: 'owner-1', role: 'seller' }, '../../etc/passwd')).rejects.toThrow('File not found.');
    await expect(svc.open({ id: 'owner-1', role: 'seller' }, '')).rejects.toThrow('File not found.');
  });
  it('the bytes come back intact', async () => {
    const f = await svc.save('owner-1', PDF);
    const opened = await svc.open({ id: 'owner-1', role: 'seller' }, f.id);
    expect(readFileSync(opened.path)).toEqual(PDF);
    expect(opened.mime).toBe('application/pdf');
  });
});

describe('private files: signed links', () => {
  it('opens for the account it was made for, for a few minutes', async () => {
    const f = await svc.save('owner-1', PNG);
    const { url, expiresAt } = await svc.link({ id: 'owner-1', role: 'seller' }, f.id, 'http://api.test');
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now() + 4 * 60_000);
    const q = new URL(url).searchParams;
    expect(svc.verifyLink(f.id, q.get('uid')!, Number(q.get('exp')), q.get('sig')!)).toBe('owner-1');
  });
  it('is bound to the file, the account and the date', async () => {
    const f = await svc.save('owner-1', PNG);
    const g = await svc.save('owner-1', PNG);
    const q = new URL((await svc.link({ id: 'owner-1', role: 'seller' }, f.id, 'http://api.test')).url).searchParams;
    const [uid, exp, sig] = [q.get('uid')!, Number(q.get('exp')), q.get('sig')!];
    expect(svc.verifyLink(g.id, uid, exp, sig)).toBeNull();
    expect(svc.verifyLink(f.id, 'someone-else', exp, sig)).toBeNull();
    expect(svc.verifyLink(f.id, uid, exp + 1, sig)).toBeNull();
    expect(svc.verifyLink(f.id, uid, exp, sig.replace(/^./, sig[0] === 'a' ? 'b' : 'a'))).toBeNull();
    expect(svc.verifyLink(f.id, uid, exp, 'short')).toBeNull();
    expect(svc.verifyLink(f.id, uid, Date.now() - 1000, sig)).toBeNull();
  });
  it('is only handed to an account that may read the file', async () => {
    const f = await svc.save('owner-1', PNG);
    await expect(svc.link({ id: 'thief', role: 'seller' }, f.id)).rejects.toThrow('File not found.');
    await expect(svc.link({ id: 'rev', role: 'admin_moderation' }, f.id)).resolves.toBeDefined();
  });
  it('a link signed with another secret does not verify', async () => {
    const f = await svc.save('owner-1', PNG);
    const q = new URL((await svc.link({ id: 'owner-1', role: 'seller' }, f.id, 'http://api.test')).url).searchParams;
    const other = new PrivateFilesService(ds.getRepository(PrivateFile), ds.getRepository(Seller), { get: () => 'another-secret' } as never);
    expect(other.verifyLink(f.id, q.get('uid')!, Number(q.get('exp')), q.get('sig')!)).toBeNull();
  });
});

describe('moving KYC documents out of the public folder', () => {
  it('a public upload is MOVED behind the login: the public copy is gone, the bytes are kept', async () => {
    const url = publicUpload(`${ID}.png`);
    const [moved] = await svc.adopt([url], 'owner-1');
    expect(moved).not.toBe(url);
    expect(moved.startsWith('http://localhost:3024/api/v1/private-uploads/')).toBe(true);
    expect(existsSync(join(process.env.UPLOAD_DIR!, `${ID}.png`))).toBe(false);
    const opened = await svc.open({ id: 'owner-1', role: 'seller' }, privateIdOf(moved)!);
    expect(readFileSync(opened.path)).toEqual(PNG);
  });

  it('a private URL must be the applicant\'s own file', async () => {
    const mine = await svc.save('owner-1', PNG);
    await expect(svc.adopt([mine.url], 'owner-1')).resolves.toEqual([mine.url]);
    await expect(svc.adopt([mine.url], 'thief')).rejects.toThrow(/not valid/);
    await expect(svc.adopt([`http://x/api/v1/private-uploads/${ID}`], 'owner-1')).rejects.toThrow(/not valid/);
  });

  it('a URL for a file this server does not hold is left as it is (nothing to protect)', async () => {
    const ghost = `http://localhost:3024/uploads/${ID}.png`;
    await expect(svc.adopt([ghost], 'owner-1')).resolves.toEqual([ghost]);
  });

  it('the application check accepts private URLs and still rejects foreign ones', () => {
    const base = { name: 'Shop', legalName: 'Shop SARL', phone: '+243812345678', idNumber: 'ID-12345', acceptTerms: true };
    expect(validateKyc({ ...base, documentUrls: [`http://api.test/api/v1/private-uploads/${ID}`] }).documentUrls).toEqual([`http://api.test/api/v1/private-uploads/${ID}`]);
    expect(validateKyc({ ...base, documentUrls: [`http://api.test/uploads/${ID}.png`] }).documentUrls).toHaveLength(1);
    expect(() => validateKyc({ ...base, documentUrls: ['https://evil.example/x.png'] })).toThrow();
    expect(() => validateKyc({ ...base, documentUrls: ['https://evil.example/api/v1/private-uploads/not-an-id'] })).toThrow();
  });

  it('migrates every existing store at start-up, once', async () => {
    const repo = ds.getRepository(Seller);
    const a = publicUpload(`aaaaaaaa-2222-3333-4444-555555555555.png`);
    const b = publicUpload(`bbbbbbbb-2222-3333-4444-555555555555.png`);
    const s1 = await repo.save(repo.create({ name: 'A', userId: 'o1', status: 'approved', documentUrls: JSON.stringify([a]) }));
    const s2 = await repo.save(repo.create({ name: 'B', userId: 'o2', status: 'approved', documentUrls: JSON.stringify([b, `http://x/uploads/ffffffff-2222-3333-4444-555555555555.png`]) }));
    const s3 = await repo.save(repo.create({ name: 'C', userId: 'o3', status: 'approved', documentUrls: null }));
    expect(await svc.migrateLegacyKyc()).toBe(2);
    const docs = async (id: string) => JSON.parse((await repo.findOneByOrFail({ id })).documentUrls ?? '[]') as string[];
    expect((await docs(s1.id))[0]).toMatch(/private-uploads/);
    const d2 = await docs(s2.id);
    expect(d2[0]).toMatch(/private-uploads/);
    expect(d2[1]).toBe('http://x/uploads/ffffffff-2222-3333-4444-555555555555.png'); // missing file: left as is
    expect(await docs(s3.id)).toEqual([]);
    // the owner of the moved file is the store's owner
    const id = privateIdOf((await docs(s1.id))[0])!;
    await expect(svc.open({ id: 'o1', role: 'seller' }, id)).resolves.toBeDefined();
    await expect(svc.open({ id: 'o2', role: 'seller' }, id)).rejects.toThrow();
    expect(await svc.migrateLegacyKyc()).toBe(0);
  });
});
