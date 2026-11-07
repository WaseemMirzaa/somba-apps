import { dateOf, expiryOf, parseDocumentInput, parseVehiclePatch, rejectionReason } from './rules';

const at = (iso: string) => new Date(`${iso}T10:30:00Z`);

describe('expiryOf', () => {
  const now = at('2026-06-15');
  it('has no state without a date', () => {
    expect(expiryOf(null, now)).toEqual({ state: 'none', daysLeft: null });
    expect(expiryOf(undefined, now)).toEqual({ state: 'none', daysLeft: null });
    expect(expiryOf('', now)).toEqual({ state: 'none', daysLeft: null });
    expect(expiryOf('garbage', now)).toEqual({ state: 'none', daysLeft: null });
  });
  it('is valid for a document good for more than 30 days', () => {
    expect(expiryOf('2026-07-16', now)).toEqual({ state: 'valid', daysLeft: 31 });
    expect(expiryOf('2030-01-01', now).state).toBe('valid');
  });
  it('is expiring from 30 days down to its last valid day', () => {
    expect(expiryOf('2026-07-15', now)).toEqual({ state: 'expiring', daysLeft: 30 });
    expect(expiryOf('2026-06-16', now)).toEqual({ state: 'expiring', daysLeft: 1 });
    expect(expiryOf('2026-06-15', now)).toEqual({ state: 'expiring', daysLeft: 0 }); // still valid today
  });
  it('is expired the day after its last valid day', () => {
    expect(expiryOf('2026-06-14', now)).toEqual({ state: 'expired', daysLeft: -1 });
    expect(expiryOf('2025-01-01', now).state).toBe('expired');
  });
  it('counts UTC calendar days whatever the time of day', () => {
    expect(expiryOf('2026-06-15', new Date('2026-06-15T23:59:59Z')).state).toBe('expiring');
    expect(expiryOf('2026-06-15', new Date('2026-06-16T00:00:00Z')).state).toBe('expired');
  });
});

describe('dates', () => {
  it('accepts real calendar dates only', () => {
    expect(dateOf('2027-02-28', 'D')).toBe('2027-02-28');
    for (const bad of ['2027-02-30', '2027-13-01', '27-01-01', '2027/01/01', '1999-12-31', '2101-01-01', '', null, 5, '2027-1-1']) {
      expect(() => dateOf(bad, 'Expiry')).toThrow('Expiry must be a date written YYYY-MM-DD.');
    }
  });
});

describe('parseVehiclePatch', () => {
  it('returns only the fields that were sent', () => {
    expect(parseVehiclePatch({ model: ' Honda CG 125 ', evil: 1 })).toEqual({ model: 'Honda CG 125' });
    expect(parseVehiclePatch(null)).toEqual({});
  });
  it('upper-cases the plate and clears with null or empty text', () => {
    expect(parseVehiclePatch({ plate: 'kn 4821 a', colour: '', fuel: null, odometerKm: '' })).toEqual({ plate: 'KN 4821 A', colour: null, fuel: null, odometerKm: null });
  });
  it('checks every field', () => {
    expect(() => parseVehiclePatch({ type: 'rocket' })).toThrow(/Type must be one of/);
    expect(() => parseVehiclePatch({ fuel: 'water' })).toThrow(/Fuel must be one of/);
    expect(() => parseVehiclePatch({ odometerKm: -1 })).toThrow(/Odometer/);
    expect(() => parseVehiclePatch({ odometerKm: 12.5 })).toThrow(/Odometer/);
    expect(() => parseVehiclePatch({ model: 'x'.repeat(81) })).toThrow(/Model/);
    expect(() => parseVehiclePatch({ plate: 'x'.repeat(21) })).toThrow(/Plate/);
    expect(() => parseVehiclePatch({ insuranceValidUntil: 'soon' })).toThrow(/Insurance valid until must be a date/);
    expect(() => parseVehiclePatch({ nextServiceOn: '2026-02-31' })).toThrow(/Next service/);
  });
});

describe('parseDocumentInput / rejectionReason', () => {
  const file = '11111111-2222-3333-4444-555555555555';
  it('takes a type, an optional number and date, and the file id', () => {
    expect(parseDocumentInput({ type: 'driver_licence', fileId: file })).toEqual({ type: 'driver_licence', number: null, expiresOn: null, fileId: file });
    expect(parseDocumentInput({ type: 'id_card', number: ' AB123 ', expiresOn: '2030-05-01', fileId: file })).toMatchObject({ number: 'AB123', expiresOn: '2030-05-01' });
  });
  it('refuses an unknown type, a bad date and a missing or malformed file id', () => {
    expect(() => parseDocumentInput({ type: 'passport', fileId: file })).toThrow(/Document type must be one of/);
    expect(() => parseDocumentInput({ type: 'other', fileId: file, expiresOn: 'x' })).toThrow(/Expiry date/);
    expect(() => parseDocumentInput({ type: 'other' })).toThrow(/file id/);
    expect(() => parseDocumentInput({ type: 'other', fileId: '../etc' })).toThrow(/file id/);
    expect(() => parseDocumentInput(undefined)).toThrow();
  });
  it('wants a reason of 3 to 300 characters', () => {
    expect(rejectionReason('  Blurry photo ')).toBe('Blurry photo');
    expect(() => rejectionReason('')).toThrow();
    expect(() => rejectionReason('no')).toThrow();
    expect(() => rejectionReason('x'.repeat(301))).toThrow();
    expect(() => rejectionReason(undefined)).toThrow();
  });
});
