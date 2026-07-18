import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  root() {
    return { name: 'Somba&Teka API', realtime: 'socket.io', docs: '/api/v1/health' };
  }

  @Get('api/v1/health')
  health() {
    return {
      status: 'ok',
      db: this.config.get('db.type'),
      transport: 'rest(auth) + websocket(everything else)',
      timestamp: new Date().toISOString(),
    };
  }
}
