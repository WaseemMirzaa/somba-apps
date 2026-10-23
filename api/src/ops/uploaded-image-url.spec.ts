import { BadRequestException } from '@nestjs/common';
import { uploadedImageUrl } from './sellers.service';

const OK = 'http://localhost:3001/uploads/b5a32395-887e-47f3-9030-2c3b07e3115f.png';

describe('uploadedImageUrl', () => {
  it('accepts a platform upload (any host, since the API URL differs per environment)', () => {
    expect(uploadedImageUrl(OK, 'Logo')).toBe(OK);
    expect(uploadedImageUrl('https://api.example.com/uploads/b5a32395-887e-47f3-9030-2c3b07e3115f.webp', 'Logo')).toContain('.webp');
  });
  it('clears with null or empty', () => {
    expect(uploadedImageUrl(null, 'Logo')).toBeNull();
    expect(uploadedImageUrl('', 'Logo')).toBeNull();
  });
  it.each([
    'https://evil.example/tracker.png',
    'http://localhost:3001/uploads/../secret.png',
    'http://localhost:3001/uploads/notauuid.png',
    'http://localhost:3001/uploads/b5a32395-887e-47f3-9030-2c3b07e3115f.svg',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (v) => {
    expect(() => uploadedImageUrl(v, 'Logo')).toThrow(BadRequestException);
  });
  it('rejects absurdly long values', () => {
    expect(() => uploadedImageUrl(OK + 'a'.repeat(500), 'Logo')).toThrow(BadRequestException);
  });
});
