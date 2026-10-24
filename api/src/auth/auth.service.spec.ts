import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/auth.dto';

function make() {
  const stored: Record<string, unknown>[] = [];
  const repo = {
    findOne: async () => null,
    create: (x: Record<string, unknown>) => ({ ...x }),
    save: async (x: Record<string, unknown>) => {
      const row = { id: `u${stored.length + 1}`, walletBalance: 0, active: true, ...x };
      stored.push(row);
      return row;
    },
  };
  const jwt = { signAsync: async () => 'token' };
  const config = { get: () => '15m' };
  const svc = new AuthService(new UsersService(repo as never), jwt as never, config as never);
  return { svc, stored };
}

const dto = (extra: Partial<RegisterDto> = {}): RegisterDto => ({ email: 'a@b.cd', password: 'password123', name: 'Amina', ...extra });

describe('AuthService.register language', () => {
  it('stores the language the sign-up sent', async () => {
    const { svc, stored } = make();
    const res = await svc.register(dto({ locale: 'fr' }));
    expect(stored[0].locale).toBe('fr');
    expect(res.user.locale).toBe('fr');
  });

  it('keeps English for a client that sends no language', async () => {
    const { svc, stored } = make();
    const res = await svc.register(dto());
    expect(stored[0].locale).toBe('en');
    expect(res.user.locale).toBe('en');
  });

  it('stores English when asked for it', async () => {
    const { svc, stored } = make();
    await svc.register(dto({ locale: 'en' }));
    expect(stored[0].locale).toBe('en');
  });
});

describe('RegisterDto locale', () => {
  const errors = (locale: unknown) => validate(plainToInstance(RegisterDto, { ...dto(), locale }));

  it('accepts en, fr and no language', async () => {
    expect(await errors('en')).toHaveLength(0);
    expect(await errors('fr')).toHaveLength(0);
    expect(await errors(undefined)).toHaveLength(0);
  });

  it('refuses any other language', async () => {
    for (const bad of ['de', 'FR', '', 'fr-FR', 5]) {
      const found = await errors(bad);
      expect(found.map((e) => e.property)).toEqual(['locale']);
    }
  });
});
