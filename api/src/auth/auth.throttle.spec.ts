import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { UsersService } from '../users/users.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GLOBAL_THROTTLE_LIMIT, REFRESH_THROTTLE_LIMIT, THROTTLE_WINDOW_MS } from './throttle';
import { VerificationService } from './verification.service';

/**
 * The real AuthController behind the real ThrottlerGuard, configured as app.module.ts does (30 / minute / IP).
 * Page reloads call /auth/refresh, so it has its own, higher limit; sign-in, sign-up and the one-time-code
 * endpoints keep the strict ones.
 */
describe('auth rate limits', () => {
  let app: INestApplication;
  const auth = {
    login: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    register: jest.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    refresh: jest.fn(async () => ({ accessToken: 'a2', refreshToken: 'r2' })),
  };
  const verification = { sendLoginCode: jest.fn(async () => ({ sent: true })) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: THROTTLE_WINDOW_MS, limit: GLOBAL_THROTTLE_LIMIT }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: UsersService, useValue: {} },
        { provide: VerificationService, useValue: verification },
      ],
    }).compile();
    app = mod.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.listen(0); // one listening server for the ~300 calls below (supertest would otherwise open one per call)
  });
  afterEach(async () => app.close());

  const post = (path: string, body: object) => request(app.getHttpServer()).post(`/api/v1/auth/${path}`).send(body);
  const refresh = () => post('refresh', { refreshToken: 'some-refresh-token' });
  const login = () => post('login', { email: 'a@b.co', password: 'Somba@2026' });
  const statuses = async (n: number, call: () => request.Test) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push((await call()).status);
    return out;
  };

  it('has the documented numbers', () => {
    expect(GLOBAL_THROTTLE_LIMIT).toBe(30);
    expect(REFRESH_THROTTLE_LIMIT).toBeGreaterThanOrEqual(300);
  });

  it('refresh is NOT limited at 31 calls a minute (page reloads must not sign people out)', async () => {
    const codes = await statuses(GLOBAL_THROTTLE_LIMIT + 1, refresh);
    expect(codes).toHaveLength(31);
    expect(codes.every((c) => c === 200)).toBe(true);
    expect(auth.refresh).toHaveBeenCalledTimes(31);
  });

  it('login is still limited at 30 a minute: the 31st call is refused', async () => {
    const codes = await statuses(GLOBAL_THROTTLE_LIMIT + 1, login);
    expect(codes.slice(0, GLOBAL_THROTTLE_LIMIT).every((c) => c === 200)).toBe(true);
    expect(codes[GLOBAL_THROTTLE_LIMIT]).toBe(429);
    expect(auth.login).toHaveBeenCalledTimes(GLOBAL_THROTTLE_LIMIT);
  });

  it('refresh has a limit of its own: it is refused past the higher limit, and does not use up login attempts', async () => {
    const codes = await statuses(REFRESH_THROTTLE_LIMIT + 1, refresh);
    expect(codes.slice(0, REFRESH_THROTTLE_LIMIT).every((c) => c === 200)).toBe(true);
    expect(codes[REFRESH_THROTTLE_LIMIT]).toBe(429);
    expect((await login()).status).toBe(200); // login's own counter is untouched
  });

  it('register and the one-time-code endpoints keep their strict limits', async () => {
    const signUp = () => post('register', { email: 'new@b.co', password: 'Somba@2026', name: 'New One' });
    const registerCodes = await statuses(GLOBAL_THROTTLE_LIMIT + 1, signUp);
    expect(registerCodes[GLOBAL_THROTTLE_LIMIT - 1]).toBe(201);
    expect(registerCodes[GLOBAL_THROTTLE_LIMIT]).toBe(429);

    const sendCode = () => post('phone/login/send', { phone: '+243812345678' });
    const codeStatuses = await statuses(7, sendCode);
    expect(codeStatuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(codeStatuses.slice(5)).toEqual([429, 429]);
  });
});
