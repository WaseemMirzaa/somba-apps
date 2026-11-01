import { cleanAttachments, firstName, isUploadUrl, parseAttachments, redactForSeller, storeAttachments } from './attachments';

const UP = 'https://api.example.com/uploads/0b9c3b3a-1c5e-4d34-9d6b-0a1b2c3d4e5f.jpg';

describe('attachments', () => {
  it('accepts only files this platform stored', () => {
    expect(isUploadUrl(UP)).toBe(true);
    expect(isUploadUrl('http://localhost:3001/uploads/0b9c3b3a-1c5e-4d34-9d6b-0a1b2c3d4e5f.webp')).toBe(true);
    for (const bad of ['https://evil.example/a.png', 'https://api.example.com/uploads/../../etc/passwd', 'https://api.example.com/uploads/x.png', 'javascript:alert(1)', '', 5, null, `${UP}?x=1#`]) {
      expect(isUploadUrl(bad)).toBe(bad === `${UP}?x=1#`);
    }
  });

  it('cleans a list: nothing means none, duplicates drop, too many or foreign ones are refused', () => {
    expect(cleanAttachments(undefined)).toEqual([]);
    expect(cleanAttachments(null)).toEqual([]);
    expect(cleanAttachments([UP, UP])).toEqual([UP]);
    expect(() => cleanAttachments('x')).toThrow('list of uploaded images');
    expect(() => cleanAttachments([UP, 'https://evil.example/a.png'])).toThrow('uploaded through the app');
    const many = Array.from({ length: 7 }, (_, i) => UP.replace('0b9c', `0b9${i}`));
    expect(() => cleanAttachments(many)).toThrow('up to 6');
  });

  it('stores and reads the JSON column without ever throwing', () => {
    expect(storeAttachments([])).toBeNull();
    expect(parseAttachments(storeAttachments([UP]))).toEqual([UP]);
    expect(parseAttachments('not json')).toEqual([]);
    expect(parseAttachments('{"a":1}')).toEqual([]);
    expect(parseAttachments(null)).toEqual([]);
  });

  it('shows sellers a first name and no customer id, but leaves their own purchases whole', () => {
    expect(firstName('  Marie   Dubois ')).toBe('Marie');
    expect(firstName(null)).toBe('');
    const row = { id: 'd1', customerId: 'c1', customerName: 'Marie Dubois' };
    expect(redactForSeller(row)).toEqual({ id: 'd1', customerName: 'Marie' });
    expect(redactForSeller(row, 'someone')).toEqual({ id: 'd1', customerName: 'Marie' });
    expect(redactForSeller(row, 'c1')).toBe(row);
    expect(row.customerId).toBe('c1'); // the original is untouched
  });
});
