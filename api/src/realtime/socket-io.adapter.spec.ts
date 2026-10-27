import { EventEmitter } from 'events';
import { ConfigService } from '@nestjs/config';
import { ModulesContainer } from '@nestjs/core';
import { WebSocketGateway } from '@nestjs/websockets';
import { SocketIoAdapter } from './socket-io.adapter';

function gatewayClasses(n: number) {
  return Array.from({ length: n }, () => {
    @WebSocketGateway()
    class Gw {}
    return Gw;
  });
}

/** A fake app whose modules hold `n` gateways and some ordinary providers. */
function appWith(n: number) {
  class Plain {}
  const modules = new Map([
    ['a', { providers: new Map(gatewayClasses(n).map((c, i) => [i, { metatype: c }])) }],
    ['b', { providers: new Map([[1, { metatype: Plain }], [2, { metatype: undefined }]]) }],
  ]);
  return {
    get: (token: unknown) => {
      if (token === ConfigService) return { get: () => [] };
      if (token === ModulesContainer) return modules;
      throw new Error('unexpected');
    },
  } as never;
}

describe('SocketIoAdapter listener limits', () => {
  it('every client socket may carry one disconnect listener per gateway without a warning', () => {
    const adapter = new SocketIoAdapter(appWith(16));
    const client = new EventEmitter() as never as import('socket.io').Socket;
    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.name);
    process.on('warning', onWarning);
    for (let i = 0; i < 16; i++) adapter.bindClientDisconnect(client, () => undefined);
    return new Promise<void>((resolve) =>
      setImmediate(() => {
        process.off('warning', onWarning);
        expect((client as unknown as EventEmitter).getMaxListeners()).toBe(32); // two per gateway (hook + message stream)
        expect((client as unknown as EventEmitter).listenerCount('disconnect')).toBe(16);
        expect(warnings).toEqual([]);
        resolve();
      }),
    );
  });

  it('the namespace gets the same limit, not an unbounded one', () => {
    const adapter = new SocketIoAdapter(appWith(16));
    const sockets = new EventEmitter();
    adapter.bindClientConnect({ sockets, on: sockets.on.bind(sockets) } as never, () => undefined);
    expect(sockets.getMaxListeners()).toBe(16);
    expect(sockets.listenerCount('connection')).toBe(1);
  });

  it('never goes below Node\'s default for a small app, and survives a container it cannot read', () => {
    const small = new SocketIoAdapter(appWith(3));
    const client = new EventEmitter() as never as import('socket.io').Socket;
    small.bindClientDisconnect(client, () => undefined);
    expect((client as unknown as EventEmitter).getMaxListeners()).toBe(10);
    const broken = new SocketIoAdapter({ get: (t: unknown) => { if (t === ConfigService) return { get: () => [] }; throw new Error('nope'); } } as never);
    const c2 = new EventEmitter() as never as import('socket.io').Socket;
    broken.bindClientDisconnect(c2, () => undefined);
    expect((c2 as unknown as EventEmitter).getMaxListeners()).toBe(10);
  });
});
