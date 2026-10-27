import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModulesContainer } from '@nestjs/core';
import { GATEWAY_METADATA } from '@nestjs/websockets/constants';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server, ServerOptions, Socket } from 'socket.io';

/**
 * Socket.IO adapter that locks CORS to the configured origins (from
 * `CORS_ORIGINS`) instead of the gateway's permissive default. Wired in
 * main.ts so the WebSocket transport honours the same allow-list as REST.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly origins: string[];
  private redisAdapter?: ReturnType<typeof createAdapter>;
  private readonly app: INestApplicationContext;
  private limit: number | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
    this.app = app;
    const config = app.get(ConfigService);
    this.origins = config.get<string[]>('corsOrigins') ?? [];
  }

  /**
   * Optional horizontal scaling: with `REDIS_URL` set, rooms and broadcasts are
   * shared through Redis so several API instances can serve the same users.
   * Without it a single instance works exactly as before.
   */
  async connectRedis(url: string): Promise<void> {
    const pub = createClient({ url });
    const sub = pub.duplicate();
    pub.on('error', (e) => console.error('redis pub error', e.message));
    sub.on('error', (e) => console.error('redis sub error', e.message));
    await Promise.all([pub.connect(), sub.connect()]);
    this.redisAdapter = createAdapter(pub, sub);
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const cors = {
      origin: this.origins.length ? this.origins : true,
      credentials: true,
    };
    const server = super.createIOServer(port, { ...options, cors }) as Server;
    if (this.redisAdapter) server.adapter(this.redisAdapter);
    return server;
  }

  /** How many `@WebSocketGateway` classes the app has (every one shares the one Socket.IO server). */
  private gatewayCount(): number {
    try {
      let n = 0;
      for (const module of this.app.get(ModulesContainer, { strict: false }).values()) {
        for (const provider of module.providers.values()) {
          if (provider.metatype && Reflect.getMetadata(GATEWAY_METADATA, provider.metatype)) n++;
        }
      }
      return n;
    } catch {
      return 0;
    }
  }

  /**
   * Every gateway adds ONE `connection` listener to the namespace and, for each client, up to TWO `disconnect` listeners to
   * its socket (Nest's client-disconnect hook, and the stream the Socket.IO adapter ends when the first message handler of
   * that gateway runs). Past Node's default of 10 that prints MaxListenersExceededWarning on connections, so the limits are
   * raised to what the gateways need and no further: still a leak alarm if something else piles up.
   */
  private maxListeners(perGateway: 1 | 2): number {
    this.limit ??= this.gatewayCount();
    return Math.max(10, this.limit * perGateway);
  }

  bindClientConnect(server: Server, callback: Function): void {
    server.sockets.setMaxListeners(this.maxListeners(1));
    super.bindClientConnect(server, callback);
  }

  bindClientDisconnect(client: Socket, callback: Function): void {
    client.setMaxListeners(this.maxListeners(2));
    super.bindClientDisconnect(client, callback);
  }
}
