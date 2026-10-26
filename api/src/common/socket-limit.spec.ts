import { limitSocket } from './socket-limit';

describe('limitSocket', () => {
  it('allows the limit inside a window, refuses the next, and starts over in the next window', () => {
    const s = {};
    for (let i = 0; i < 5; i++) expect(() => limitSocket(s, 5, 1000, 10_000)).not.toThrow();
    expect(() => limitSocket(s, 5, 1000, 10_500)).toThrow('Too many requests');
    expect(() => limitSocket(s, 5, 1000, 11_001)).not.toThrow();
  });
  it('counts each socket on its own', () => {
    const a = {};
    const b = {};
    for (let i = 0; i < 3; i++) limitSocket(a, 3, 1000, 1);
    expect(() => limitSocket(a, 3, 1000, 2)).toThrow();
    expect(() => limitSocket(b, 3, 1000, 2)).not.toThrow();
  });
});
