import { isUploadUrl } from '../common/attachments';
import { sniffImage } from './uploads.controller';

const box = (brand: string) => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftyp'), Buffer.from(brand), Buffer.alloc(12)]);

describe('upload type sniffing', () => {
  it('knows png, jpeg, webp and heic by their bytes', () => {
    expect(sniffImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(sniffImage(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]))).toBe('webp');
    for (const brand of ['heic', 'heix', 'mif1', 'msf1']) expect(sniffImage(box(brand))).toBe('heic');
  });

  it('refuses other ISO media (an mp4 is not a photo), text and short buffers', () => {
    expect(sniffImage(box('isom'))).toBeNull();
    expect(sniffImage(box('mp42'))).toBeNull();
    expect(sniffImage(Buffer.from('<html></html>'))).toBeNull();
    expect(sniffImage(Buffer.alloc(3))).toBeNull();
  });
});

describe('upload links', () => {
  const id = '11111111-2222-3333-4444-555555555555';
  it('accepts every extension the endpoint writes (and .jpeg), on any host', () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'heic', 'HEIC']) expect(isUploadUrl(`https://api.somba.test/uploads/${id}.${ext}`)).toBe(true);
  });
  it('refuses everything else', () => {
    for (const bad of [`https://x/uploads/${id}.gif`, `https://x/uploads/${id}.svg`, `https://x/other/${id}.png`, `https://x/uploads/${id}.png/../a`, 'not a url', 7, null]) expect(isUploadUrl(bad as never)).toBe(false);
  });
});
