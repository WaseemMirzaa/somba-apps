import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that locks CORS to the configured origins (from
 * `CORS_ORIGINS`) instead of the gateway's permissive default. Wired in
 * main.ts so the WebSocket transport honours the same allow-list as REST.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly origins: string[];
  private redisAdapter?: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext) {
    super(app);
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
}
