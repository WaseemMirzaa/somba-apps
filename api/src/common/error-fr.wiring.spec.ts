import { BadRequestException, Controller, Get, INestApplication, NotFoundException, UnauthorizedException, ValidationPipe, HttpException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { WsThrottleInterceptor } from '../realtime/ws-throttle.interceptor';
import { Test } from '@nestjs/testing';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { Body, Post, UseInterceptors } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { ErrorFrFilter } from './error-fr.filter';
import { StaffTwoFaPolicy } from '../auth/staff-twofa';
import { SocketIoAdapter } from '../realtime/socket-io.adapter';

/**
 * The delivery of the French text, end to end: a real Nest app with the project's `SocketIoAdapter` and the global
 * `APP_FILTER` that `AppModule` registers, a gateway and a controller of the kinds the API has. Proves that every ack
 * of a gateway leaves with its `errorFr` and that the HTTP error body keeps its shape.
 */

class LoginBody {
  @IsEmail() email!: string;
  @IsString() @MinLength(8, { message: 'Password must be at least 8 characters.' }) password!: string;
}

@WebSocketGateway({ cors: true })
@UseInterceptors(WsThrottleInterceptor)
class FakeGateway {
  @SubscribeMessage('refuse')
  refuse() {
    return { ok: false as const, error: 'Sign in to continue.' };
  }
  @SubscribeMessage('refuse:dynamic')
  dynamic(@MessageBody() b: { n: number }) {
    return { ok: false as const, error: `Only ${b.n} of "Tote bag" left in stock.`, code: 'x' };
  }
  @SubscribeMessage('refuse:unknown')
  unknown() {
    return { ok: false as const, error: 'A sentence nobody translated.' };
  }
  @SubscribeMessage('refuse:already')
  already() {
    return { ok: false as const, error: 'Sign in to continue.', errorFr: 'déjà là' };
  }
  @SubscribeMessage('fine')
  fine() {
    return { ok: true as const, data: { id: 1, items: [{ ok: false, reason: 'This code has expired.' }, { ok: true }] } };
  }
  @SubscribeMessage('throws')
  throws(@ConnectedSocket() _c: unknown) {
    throw new BadRequestException('Sign in to continue.');
  }
}

@Controller('t')
class FakeController {
  @Get('string') one() {
    throw new BadRequestException('Sign in to continue.');
  }
  @Get('unknown') two() {
    throw new NotFoundException('Nobody wrote this one');
  }
  @Get('default') three() {
    throw new UnauthorizedException();
  }
  @Get('object') four() {
    throw new HttpException({ statusCode: 409, message: 'Order not found', error: 'Conflict', code: 'extra' }, 409);
  }
  @Post('login') login(@Body() body: LoginBody) {
    return { ok: true, email: body.email };
  }
}

describe('the French error text, wired like the app wires it', () => {
  jest.setTimeout(60_000); // compiling the adapter pulls in the entities: slow on a cold cache
  let app: INestApplication;
  let client: Socket;
  let url: string;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ corsOrigins: [] })] })],
      controllers: [FakeController],
      providers: [FakeGateway, { provide: StaffTwoFaPolicy, useValue: {} }, { provide: APP_FILTER, useClass: ErrorFrFilter }],
    }).compile();
    app = mod.createNestApplication();
    app.useWebSocketAdapter(new SocketIoAdapter(app));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    client = io(url, { transports: ['websocket'], forceNew: true });
    await new Promise<void>((res, rej) => {
      client.on('connect', () => res());
      client.on('connect_error', rej);
    });
  });
  afterAll(async () => {
    client.close();
    await app.close();
  });

  const ask = (event: string, body?: unknown): Promise<any> => new Promise((res) => client.emit(event, body ?? {}, res));

  describe('socket acks', () => {
    it('adds errorFr next to error, and leaves everything else as it was', async () => {
      expect(await ask('refuse')).toEqual({ ok: false, error: 'Sign in to continue.', errorFr: 'Connectez-vous pour continuer.' });
    });
    it('translates a sentence with a variable part', async () => {
      expect(await ask('refuse:dynamic', { n: 3 })).toEqual({ ok: false, error: 'Only 3 of "Tote bag" left in stock.', code: 'x', errorFr: 'Il ne reste que 3 × « Tote bag » en stock.' });
    });
    it('sends no errorFr for a message the dictionary does not know', async () => {
      expect(await ask('refuse:unknown')).toEqual({ ok: false, error: 'A sentence nobody translated.' });
    });
    it('does not overwrite an errorFr a handler set itself', async () => {
      expect((await ask('refuse:already')).errorFr).toBe('déjà là');
    });
    it('puts reasonFr on a refusal nested in a successful ack, and touches nothing else', async () => {
      expect(await ask('fine')).toEqual({
        ok: true,
        data: { id: 1, items: [{ ok: false, reason: 'This code has expired.', reasonFr: 'Ce code a expiré.' }, { ok: true }] },
      });
    });
    it('covers the throttle interceptor’s own refusal', async () => {
      const first = await ask('refuse'); // sanity: the throttle lets a normal call through
      expect(first.ok).toBe(false);
      const answers: any[] = await Promise.all(Array.from({ length: 120 }, () => ask('refuse')));
      const throttled = answers.find((a) => a.error === 'Too many requests — slow down.');
      expect(throttled).toEqual({ ok: false, error: 'Too many requests — slow down.', errorFr: 'Trop de requêtes. Ralentissez un instant.' });
    });
  });

  describe('HTTP error bodies', () => {
    it('keeps the Nest shape and adds messageFr', async () => {
      const res = await request(app.getHttpServer()).get('/t/string').expect(400);
      expect(res.body).toEqual({ statusCode: 400, message: 'Sign in to continue.', error: 'Bad Request', messageFr: 'Connectez-vous pour continuer.' });
    });
    it('adds nothing for an unknown message', async () => {
      const res = await request(app.getHttpServer()).get('/t/unknown').expect(404);
      expect(res.body).toEqual({ statusCode: 404, message: 'Nobody wrote this one', error: 'Not Found' });
    });
    it('covers the default text of a bare exception', async () => {
      const res = await request(app.getHttpServer()).get('/t/default').expect(401);
      expect(res.body).toEqual({ statusCode: 401, message: 'Unauthorized', messageFr: 'Connectez-vous pour continuer.' });
    });
    it('keeps the extra fields of a custom body', async () => {
      const res = await request(app.getHttpServer()).get('/t/object').expect(409);
      expect(res.body).toEqual({ statusCode: 409, message: 'Order not found', error: 'Conflict', code: 'extra', messageFr: 'Commande introuvable' });
    });
    it('translates the class-validator list of a form, all or nothing', async () => {
      const bad = await request(app.getHttpServer()).post('/t/login').send({ email: 'nope', password: 'short' }).expect(400);
      expect(bad.body.message).toEqual(['email must be an email', 'Password must be at least 8 characters.']);
      expect(bad.body.messageFr).toEqual(['Saisissez un e-mail valide.', 'Le mot de passe doit contenir au moins 8 caractères.']);
      expect(bad.body.statusCode).toBe(400);
      const ok = await request(app.getHttpServer()).post('/t/login').send({ email: 'a@b.cd', password: 'longenough' }).expect(201);
      expect(ok.body).toEqual({ ok: true, email: 'a@b.cd' });
    });
  });
});
