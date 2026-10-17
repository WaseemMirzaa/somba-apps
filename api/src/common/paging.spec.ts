import { DEFAULT_LIMIT, MAX_LIMIT, pageOf } from './paging';

describe('pageOf', () => {
  it('gives a generous default when nothing is asked', () => {
    expect(pageOf(undefined)).toEqual({ take: DEFAULT_LIMIT, skip: 0 });
    expect(pageOf({})).toEqual({ take: DEFAULT_LIMIT, skip: 0 });
    expect(pageOf('junk')).toEqual({ take: DEFAULT_LIMIT, skip: 0 });
  });
  it('honours limit and offset', () => {
    expect(pageOf({ limit: 20, offset: 40 })).toEqual({ take: 20, skip: 40 });
    expect(pageOf({ limit: '7', offset: '3' })).toEqual({ take: 7, skip: 3 });
  });
  it('caps the limit and ignores nonsense', () => {
    expect(pageOf({ limit: 99999 }).take).toBe(MAX_LIMIT);
    expect(pageOf({ limit: -5, offset: -1 })).toEqual({ take: DEFAULT_LIMIT, skip: 0 });
    expect(pageOf({ limit: 'abc', offset: NaN })).toEqual({ take: DEFAULT_LIMIT, skip: 0 });
  });
  it('lets a caller pick its own default and cap', () => {
    expect(pageOf({}, { def: 50, max: 200 }).take).toBe(50);
    expect(pageOf({ limit: 900 }, { def: 50, max: 200 }).take).toBe(200);
  });
});
