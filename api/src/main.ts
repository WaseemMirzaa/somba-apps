import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertProductionConfig } from './config/assert-production';
import { SocketIoAdapter } from './realtime/socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Refuse to boot in production with insecure defaults.
  assertProductionConfig(config);

  // Security headers on the REST surface (P2 hardening).
  app.use(helmet());
  // Drain in-flight work on SIGTERM/SIGINT instead of dropping connections.
  app.enableShutdownHooks();

  app.enableCors({
    origin: config.get<string[]>('corsOrigins'),
    credentials: true,
  });
  // Lock the WebSocket transport to the same CORS allow-list.
  app.useWebSocketAdapter(new SocketIoAdapter(app));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const port = config.get<number>('port')!;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(
    `Somba&Teka API on http://localhost:${port} · db=${config.get('db.type')} · realtime=socket.io`,
  );
}
void bootstrap();
