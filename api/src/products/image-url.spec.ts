import { BadRequestException } from '@nestjs/common';
import { isPrivateHost, productImageList, productImageUrl } from './image-url';

const UPLOAD = 'http://localhost:3001/uploads/b5a32395-887e-47f3-9030-2c3b07e3115f.png';

describe('productImageUrl', () => {
  it('accepts our own uploads (any host, even http) and a relative upload path', () => {
    expect(productImageUrl(UPLOAD)).toBe(UPLOAD);
    expect(productImageUrl('/uploads/b5a32395-887e-47f3-9030-2c3b07e3115f.webp')).toContain('.webp');
  });

  it('accepts an https URL on a public host', () => {
    expect(productImageUrl('https://images.example.com/a/b.jpg?w=400')).toContain('example.com');
    expect(productImageUrl('  https://cdn.example.org/x  ')).toBe('https://cdn.example.org/x');
  });

  it.each([
    'http://example.com/a.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'ftp://example.com/a.png',
    'https://user:pw@example.com/a.png',
    'https://localhost/a.png',
    'https://127.0.0.1/a.png',
    'https://10.0.0.5/a.png',
    'https://192.168.1.2/a.png',
    'https://169.254.169.254/latest/meta-data',
    'https://[::1]/a.png',
    'https://printer.local/a.png',
    'not a url',
    'http://localhost:3001/uploads/../secret.png',
    'http://localhost:3001/uploads/notauuid.png',
    'http://localhost:3001/uploads/b5a32395-887e-47f3-9030-2c3b07e3115f.svg',
    'https://example.com/a b.png',
    '',
  ])('rejects %s', (v) => {
    expect(() => productImageUrl(v)).toThrow(BadRequestException);
  });

  it('rejects a link that is too long', () => {
    expect(() => productImageUrl(`https://example.com/${'a'.repeat(500)}`)).toThrow('too long');
  });

  it('knows private hosts', () => {
    for (const h of ['localhost', 'a.localhost', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.9.9', '192.168.0.1', '169.254.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1']) expect(isPrivateHost(h)).toBe(true);
    for (const h of ['example.com', '8.8.8.8', '172.32.0.1', '2606:4700:4700::1111']) expect(isPrivateHost(h)).toBe(false);
  });
});

describe('productImageList', () => {
  it('keeps order, drops duplicates, and treats empty as no pictures', () => {
    expect(productImageList([UPLOAD, 'https://a.example.com/1.jpg', UPLOAD])).toEqual([UPLOAD, 'https://a.example.com/1.jpg']);
    expect(productImageList(null)).toEqual([]);
    expect(productImageList('')).toEqual([]);
  });
  it('allows 8 and refuses 9, names the bad picture', () => {
    const many = Array.from({ length: 9 }, (_, i) => `https://a.example.com/${i}.jpg`);
    expect(productImageList(many.slice(0, 8))).toHaveLength(8);
    expect(() => productImageList(many)).toThrow('At most 8');
    expect(() => productImageList(['https://a.example.com/1.jpg', 'http://bad.example.com/2.jpg'])).toThrow('Picture 2');
    expect(() => productImageList('x')).toThrow('list');
  });
});
