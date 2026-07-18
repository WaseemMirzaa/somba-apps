import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SocketIoAdapter } from './realtime/socket-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

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
