import { cleanPoint, haversineKm, isGeoPoint, nearestHub } from './geo';

const gombe = { lat: -4.3105, lng: 15.3136 };
const limete = { lat: -4.354, lng: 15.347 };
const paris = { lat: 48.8566, lng: 2.3522 };

describe('haversineKm', () => {
  it('is zero for the same point and symmetric', () => {
    expect(haversineKm(gombe, gombe)).toBe(0);
    expect(haversineKm(gombe, limete)).toBeCloseTo(haversineKm(limete, gombe), 9);
  });
  it('matches known distances', () => {
    expect(haversineKm(gombe, limete)).toBeGreaterThan(5);
    expect(haversineKm(gombe, limete)).toBeLessThan(7);
    // Kinshasa -> Paris is about 5 900 km
    expect(haversineKm(gombe, paris)).toBeGreaterThan(5800);
    expect(haversineKm(gombe, paris)).toBeLessThan(6100);
  });
});

describe('cleanPoint / isGeoPoint', () => {
  it('accepts numbers and numeric strings in range', () => {
    expect(cleanPoint('-4.31', 15.31)).toEqual({ lat: -4.31, lng: 15.31 });
  });
  it('refuses missing or out-of-range values', () => {
    expect(cleanPoint(null, 1)).toBeNull();
    expect(cleanPoint(91, 0)).toBeNull();
    expect(cleanPoint(0, 181)).toBeNull();
    expect(cleanPoint('abc', 0)).toBeNull();
    expect(isGeoPoint({ lat: NaN, lng: 0 })).toBe(false);
  });
});

describe('nearestHub', () => {
  const hubs = [
    { id: 'gombe', lat: gombe.lat, lng: gombe.lng, active: true, activeRiders: 2 },
    { id: 'limete', lat: limete.lat, lng: limete.lng, active: true, activeRiders: 1 },
    { id: 'paris', lat: paris.lat, lng: paris.lng, active: true, activeRiders: 3 },
  ];
  it('picks the closest hub', () => {
    expect(nearestHub({ lat: -4.35, lng: 15.34 }, hubs)?.id).toBe('limete');
    expect(nearestHub({ lat: -4.31, lng: 15.31 }, hubs)?.id).toBe('gombe');
    expect(nearestHub({ lat: 48.85, lng: 2.35 }, hubs)?.id).toBe('paris');
  });
  it('skips inactive hubs and hubs without riders', () => {
    const point = { lat: -4.35, lng: 15.34 };
    expect(nearestHub(point, hubs.map((h) => (h.id === 'limete' ? { ...h, active: false } : h)))?.id).toBe('gombe');
    expect(nearestHub(point, hubs.map((h) => (h.id === 'limete' ? { ...h, activeRiders: 0 } : h)))?.id).toBe('gombe');
  });
  it('can ignore the rider requirement (fallback routing)', () => {
    const noRiders = hubs.map((h) => ({ ...h, activeRiders: 0 }));
    expect(nearestHub({ lat: -4.35, lng: 15.34 }, noRiders)).toBeNull();
    expect(nearestHub({ lat: -4.35, lng: 15.34 }, noRiders, { requireRiders: false })?.id).toBe('limete');
  });
  it('ignores hubs without coordinates and returns null when nothing qualifies', () => {
    expect(nearestHub(gombe, [{ id: 'x', lat: null, lng: null, active: true }])).toBeNull();
    expect(nearestHub(gombe, [])).toBeNull();
  });
  it('breaks exact ties on id so the choice is stable', () => {
    const twin = [
      { id: 'b', lat: 1, lng: 1 },
      { id: 'a', lat: 1, lng: 1 },
    ];
    expect(nearestHub({ lat: 0, lng: 0 }, twin)?.id).toBe('a');
  });
});

import { normPlace, parseAddressPin } from './geo';

describe('normPlace', () => {
  it('folds case, accents and punctuation', () => {
    expect(normPlace('  Kinshasa, Limeté ')).toBe('kinshasa limete');
    expect(normPlace(null)).toBe('');
  });
});

describe('parseAddressPin', () => {
  it('reads the pin from geo or the top level, and the city', () => {
    expect(parseAddressPin(JSON.stringify({ city: 'Kinshasa', geo: { lat: -4.3, lng: 15.3 } }))).toEqual({ point: { lat: -4.3, lng: 15.3 }, city: 'Kinshasa' });
    expect(parseAddressPin(JSON.stringify({ lat: 1, lng: 2 })).point).toEqual({ lat: 1, lng: 2 });
  });
  it('returns nothing for free text, a bad pin or nothing', () => {
    expect(parseAddressPin('12 Rue X')).toEqual({ point: null, city: null });
    expect(parseAddressPin(JSON.stringify({ city: 'Paris', geo: { lat: 'x', lng: 2 } }))).toEqual({ point: null, city: 'Paris' });
    expect(parseAddressPin(null)).toEqual({ point: null, city: null });
  });
});
