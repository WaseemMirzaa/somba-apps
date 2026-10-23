import { cleanGeo } from './addresses.service';

describe('cleanGeo', () => {
  it('keeps a valid pin and rounds to 6 decimals', () => {
    expect(cleanGeo({ lat: -4.3224981234, lng: 15.3070009876, placeId: 'abc', formatted: 'Gombe' })).toEqual({
      lat: -4.322498,
      lng: 15.307001,
      placeId: 'abc',
      formatted: 'Gombe',
    });
  });
  it('accepts numeric strings', () => {
    expect(cleanGeo({ lat: '-4.3', lng: '15.3' })).toEqual({ lat: -4.3, lng: 15.3 });
  });
  it.each([
    null,
    undefined,
    'x',
    {},
    { lat: 91, lng: 0 },
    { lat: 0, lng: 181 },
    { lat: 'a', lng: 1 },
    { lat: NaN, lng: 1 },
  ])('rejects %p', (v) => {
    expect(cleanGeo(v)).toBeNull();
  });
  it('drops oversized place ids', () => {
    expect(cleanGeo({ lat: 1, lng: 1, placeId: 'x'.repeat(301) })).toEqual({ lat: 1, lng: 1 });
  });
});
