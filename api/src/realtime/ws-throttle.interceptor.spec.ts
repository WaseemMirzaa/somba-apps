import { lastValueFrom, of } from 'rxjs';
import { WsThrottleInterceptor } from './ws-throttle.interceptor';

const ctx = (data: unknown, id = 's1') => ({
  getType: () => 'ws',
  switchToWs: () => ({ getClient: () => ({ id, data: {} }), getData: () => data }),
}) as never;
const next = { handle: () => of('HANDLED') };
const run = (i: WsThrottleInterceptor, data: unknown, id?: string) =>
  lastValueFrom(i.intercept(ctx(data, id), next));

describe('WsThrottleInterceptor', () => {
  it('passes normal object payloads through', async () => {
    expect(await run(new WsThrottleInterceptor(), { a: 1 })).toBe('HANDLED');
    expect(await run(new WsThrottleInterceptor(), undefined)).toBe('HANDLED');
  });

  it('rejects non-object payloads with the ack envelope', async () => {
    expect(await run(new WsThrottleInterceptor(), 'str')).toMatchObject({ ok: false });
  });

  it('rejects oversized payloads', async () => {
    const big = { x: 'y'.repeat(70 * 1024) };
    expect(await run(new WsThrottleInterceptor(), big)).toMatchObject({ ok: false, error: 'Payload too large.' });
  });

  it('throttles a flood per socket, but not other sockets', async () => {
    const i = new WsThrottleInterceptor();
    const results = [];
    for (let n = 0; n < 60; n++) results.push(await run(i, {}, 'flooder'));
    expect(results.filter((r) => r !== 'HANDLED').length).toBeGreaterThan(0);
    expect(await run(i, {}, 'someone-else')).toBe('HANDLED');
  });

  it('release() frees the bucket', async () => {
    const i = new WsThrottleInterceptor();
    for (let n = 0; n < 60; n++) await run(i, {}, 'x');
    i.release('x');
    expect(await run(i, {}, 'x')).toBe('HANDLED');
  });
});
