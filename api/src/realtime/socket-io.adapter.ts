import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that locks CORS to the configured origins (from
 * `CORS_ORIGINS`) instead of the gateway's permissive default. Wired in
 * main.ts so the WebSocket transport honours the same allow-list as REST.
 */
export class SocketIoAdapter extends IoAdapter {
  private readonly origins: string[];

  constructor(app: INestApplicationContext) {
    super(app);
    const config = app.get(ConfigService);
    this.origins = config.get<string[]>('corsOrigins') ?? [];
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const cors = {
      origin: this.origins.length ? this.origins : true,
      credentials: true,
    };
    return super.createIOServer(port, { ...options, cors });
  }
}
