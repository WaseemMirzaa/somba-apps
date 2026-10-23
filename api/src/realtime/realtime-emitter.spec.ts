import { RealtimeEmitter } from './realtime-emitter';

function make() {
  const sent: { room: string; event: string; payload: unknown }[] = [];
  const emitter = new RealtimeEmitter();
  emitter.register({ to: (room: string) => ({ emit: (event: string, payload: unknown) => sent.push({ room, event, payload }) }) } as never);
  return { emitter, sent };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

describe('RealtimeEmitter user views', () => {
  it('sends plain events untouched', () => {
    const { emitter, sent } = make();
    emitter.toUser('u1', 'x', { a: 1 });
    expect(sent).toEqual([{ room: 'user:u1', event: 'x', payload: { a: 1 } }]);
  });

  it('applies a synchronous view immediately', () => {
    const { emitter, sent } = make();
    emitter.registerUserView(['x'], (uid, p) => ({ ...(p as object), for: uid }));
    emitter.toUser('u1', 'x', { a: 1 });
    expect(sent[0].payload).toEqual({ a: 1, for: 'u1' });
  });

  it('keeps the order of events when a view is asynchronous', async () => {
    const { emitter, sent } = make();
    emitter.registerUserView(['x'], (_u, p) => ((p as { slow?: boolean }).slow ? new Promise((r) => setTimeout(() => r({ ...(p as object), done: true }), 20)) : p));
    emitter.toUser('u1', 'x', { n: 1, slow: true });
    emitter.toUser('u1', 'x', { n: 2 });
    await tick();
    await new Promise((r) => setTimeout(r, 40));
    expect(sent.map((s) => (s.payload as { n: number }).n)).toEqual([1, 2]);
    expect(sent[0].payload).toMatchObject({ done: true });
  });

  it('falls back to the plain payload when the view fails', async () => {
    const { emitter, sent } = make();
    emitter.registerUserView(['x'], () => Promise.reject(new Error('boom')));
    emitter.toUser('u1', 'x', { n: 1 });
    await tick();
    expect(sent[0].payload).toEqual({ n: 1 });
  });
});
