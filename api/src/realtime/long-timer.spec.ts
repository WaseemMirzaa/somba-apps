import { MAX_TIMEOUT_MS, setLongTimeout } from './long-timer';

describe('setLongTimeout', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs a short timer once, on time', () => {
    const fn = jest.fn();
    setLongTimeout(fn, 1000);
    jest.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not fire at once for a delay above the setTimeout limit (a one-year token)', () => {
    const fn = jest.fn();
    const year = 365 * 24 * 3600 * 1000;
    setLongTimeout(fn, year);
    jest.advanceTimersByTime(MAX_TIMEOUT_MS + 5000);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(year - MAX_TIMEOUT_MS - 5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('can be cleared, also between steps', () => {
    const fn = jest.fn();
    const t = setLongTimeout(fn, MAX_TIMEOUT_MS * 3);
    jest.advanceTimersByTime(MAX_TIMEOUT_MS + 10);
    t.clear();
    jest.advanceTimersByTime(MAX_TIMEOUT_MS * 3);
    expect(fn).not.toHaveBeenCalled();
  });

  it('runs at once for a zero or negative delay', () => {
    const fn = jest.fn();
    setLongTimeout(fn, -5);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
