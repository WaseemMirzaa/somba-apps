import { csvCell, dateInput, lastMonths, lineState, monthRange, toCsv } from './finance.util';

const H = 3_600_000;

describe('lineState', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const delivered = (hoursAgo: number) => new Date(now - hoursAgo * H);

  it('a parcel on its way is in progress and has no clearance date', () => {
    expect(lineState({ orderStatus: 'out_for_delivery', deliveredAt: null, payoutStatus: null }, 48, now)).toEqual({ state: 'in_progress', clearanceEndsAt: null });
  });

  it('delivered money clears `hold` hours after delivery', () => {
    const young = lineState({ orderStatus: 'delivered', deliveredAt: delivered(10), payoutStatus: null }, 48, now);
    expect(young.state).toBe('clearing');
    expect(young.clearanceEndsAt?.getTime()).toBe(now - 10 * H + 48 * H);
    expect(lineState({ orderStatus: 'delivered', deliveredAt: delivered(48), payoutStatus: null }, 48, now).state).toBe('available'); // exactly at the end of the hold
    expect(lineState({ orderStatus: 'delivered', deliveredAt: delivered(100), payoutStatus: null }, 48, now).state).toBe('available');
    expect(lineState({ orderStatus: 'delivered', deliveredAt: delivered(0.1), payoutStatus: null }, 0, now).state).toBe('available'); // no hold
  });

  it('a payout statement wins over the clock', () => {
    expect(lineState({ orderStatus: 'delivered', deliveredAt: delivered(100), payoutStatus: 'requested' }, 48, now).state).toBe('in_payout');
    expect(lineState({ orderStatus: 'delivered', deliveredAt: delivered(100), payoutStatus: 'sending' }, 48, now).state).toBe('in_payout');
    expect(lineState({ orderStatus: 'delivered', deliveredAt: delivered(100), payoutStatus: 'paid' }, 48, now).state).toBe('paid_out');
  });

  it('a returned order is returned, whatever was paid', () => {
    expect(lineState({ orderStatus: 'returned', deliveredAt: delivered(100), payoutStatus: 'paid' }, 48, now)).toEqual({ state: 'returned', clearanceEndsAt: null });
  });
});

describe('months', () => {
  it('parses a month into a half-open UTC range', () => {
    const r = monthRange('2026-10');
    expect(r.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(monthRange('2026-12').end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
  it.each(['2026-13', '2026-00', '26-10', 'oct', '', undefined, '2026-1', '1999-01'])('rejects %s', (v) => {
    expect(() => monthRange(v)).toThrow('Choose a month like 2026-10.');
  });
  it('lists the last months newest first, across a year end', () => {
    expect(lastMonths(4, new Date('2026-02-10T00:00:00Z'))).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });
});

describe('dateInput', () => {
  it('a bare date is the start of that day, or its last millisecond when inclusive', () => {
    expect(dateInput('2026-10-25', false)?.toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(dateInput('2026-10-25', true)?.toISOString()).toBe('2026-10-25T23:59:59.999Z');
    expect(dateInput('2026-10-25T10:00:00Z', true)?.toISOString()).toBe('2026-10-25T10:00:00.000Z');
  });
  it('empty is none, nonsense throws', () => {
    expect(dateInput(undefined, false)).toBeNull();
    expect(dateInput('', true)).toBeNull();
    expect(() => dateInput('yesterday', false)).toThrow('not valid');
  });
});

describe('CSV', () => {
  it('quotes what needs quoting and doubles quotes', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
    expect(csvCell(-3)).toBe('-3');
  });
  it('defuses spreadsheet formulas in text cells', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
  });
  it('starts with a byte-order mark and uses CRLF', () => {
    expect(toCsv([['a', 'b'], [1, 'x,y']])).toBe('﻿a,b\r\n1,"x,y"\r\n');
  });
});
