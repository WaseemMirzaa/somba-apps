import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { assertProductionConfig } from './config/assert-production';
import { SocketIoAdapter } from './realtime/socket-io.adapter';
import { UPLOAD_DIR } from './uploads/uploads.controller';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // payment webhooks are signed over the exact bytes received
  });
  const config = app.get(ConfigService);

  // Refuse to boot in production with insecure defaults.
  assertProductionConfig(config);

  // Behind nginx: trust X-Forwarded-Proto/Host so generated URLs (uploaded image
  // links) use https and the real domain instead of http://127.0.0.1.
  app.set('trust proxy', 1);

  // Security headers on the REST surface (P2 hardening).
  // Cross-origin resource policy relaxed so the web/mobile apps can render /uploads images.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  // Uploaded images are served read-only; nosniff stops them being treated as HTML.
  app.useStaticAssets(UPLOAD_DIR, {
    prefix: '/uploads/',
    index: false,
    setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
  });
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
