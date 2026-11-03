import { SettingsService } from './settings.service';

/** The Help screen's contact details: public, validated, blank = not offered. */
describe('support contact settings', () => {
  const rows: Record<string, string> = {};
  const repo = {
    find: async () => Object.entries(rows).map(([key, value]) => ({ key, value })),
    findOne: async ({ where }: { where: { key: string } }) => (rows[where.key] !== undefined ? { key: where.key, value: rows[where.key] } : null),
    create: (r: { key: string; value: string }) => r,
    save: async (r: { key: string; value: string }) => {
      rows[r.key] = r.value;
      return r;
    },
  };
  const pushed: { roles: string[]; event: string; payload: Record<string, string> }[] = [];
  const svc = new SettingsService(repo as never, { toRoles: (roles: string[], event: string, payload: Record<string, string>) => void pushed.push({ roles, event, payload }) } as never);
  beforeEach(() => {
    Object.keys(rows).forEach((k) => delete rows[k]);
    pushed.length = 0;
  });

  it('stores the phone, e-mail and WhatsApp number trimmed, and shows them to shoppers and guests', async () => {
    await svc.set('supportPhone', ' +243 970 000 000 ');
    await svc.set('supportEmail', 'help@somba.example');
    await svc.set('supportWhatsapp', '+243970000111');
    await svc.set('commissionPct', 12);
    expect(rows).toMatchObject({ supportPhone: '+243 970 000 000', supportEmail: 'help@somba.example', supportWhatsapp: '+243970000111' });
    expect(await svc.publicView()).toEqual({ supportPhone: '+243 970 000 000', supportEmail: 'help@somba.example', supportWhatsapp: '+243970000111' });
    // The live push reaches the apps with the new value.
    expect(pushed.filter((p) => p.roles.includes('customer')).pop()!.payload).toMatchObject({ supportEmail: 'help@somba.example' });
  });

  it('a blank value switches the option off', async () => {
    await svc.set('supportWhatsapp', '+243970000111');
    await svc.set('supportWhatsapp', '   ');
    expect((await svc.publicView()).supportWhatsapp).toBe('');
  });

  it('refuses what is not a phone number or an e-mail address', async () => {
    await expect(svc.set('supportPhone', 'call me')).rejects.toThrow('phone number');
    await expect(svc.set('supportWhatsapp', 'https://wa.me/1')).rejects.toThrow('phone number');
    await expect(svc.set('supportPhone', '12')).rejects.toThrow('phone number');
    await expect(svc.set('supportEmail', 'not an email')).rejects.toThrow('e-mail');
    await expect(svc.set('supportEmail', `${'a'.repeat(120)}@x.io`)).rejects.toThrow('e-mail');
    expect(rows).toEqual({});
  });
});
