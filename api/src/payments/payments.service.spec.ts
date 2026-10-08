import { PaymentsService } from './payments.service';

describe('PaymentsService.normalisePhone', () => {
  it('accepts common formats', () => {
    expect(PaymentsService.normalisePhone('+243 81 234 5678')).toBe('+243812345678');
    expect(PaymentsService.normalisePhone('(081) 234-5678')).toBe('0812345678');
  });
  it('rejects junk', () => {
    for (const bad of ['', 'abc', '123', undefined, '+243 81 234 5678 99 99 99 99']) {
      expect(() => PaymentsService.normalisePhone(bad)).toThrow();
    }
  });
});

describe('PaymentsService.assertMethodAllowed', () => {
  const make = (codEnabled: string | null, provider: unknown) =>
    new PaymentsService(
      {} as never, {} as never, {} as never, {} as never, {} as never,
      { get: async () => codEnabled } as never,
      provider as never,
    );
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('COD is refused unless codEnabled is "true"', async () => {
    await expect(make(null, null).assertMethodAllowed('cod')).rejects.toThrow(/not available/);
    await expect(make('false', null).assertMethodAllowed('cod')).rejects.toThrow();
    await expect(make('true', null).assertMethodAllowed('cod')).resolves.toBeUndefined();
  });
  it('mobile money is refused with no provider, allowed with one', async () => {
    await expect(make('false', null).assertMethodAllowed('orange_money')).rejects.toThrow(/not available/);
    await expect(make('false', { name: 'x' }).assertMethodAllowed('orange_money')).resolves.toBeUndefined();
  });
  it('card is refused in production, mocked elsewhere', async () => {
    process.env.NODE_ENV = 'production';
    await expect(make(null, null).assertMethodAllowed('stripe_card')).rejects.toThrow();
    process.env.NODE_ENV = 'development';
    await expect(make(null, null).assertMethodAllowed('stripe_card')).resolves.toBeUndefined();
  });
  it('unknown methods are refused', async () => {
    await expect(make(null, null).assertMethodAllowed('bitcoin')).rejects.toThrow(/Unknown/);
  });
});
