import { RealtimeGateway } from './realtime.gateway';

/**
 * `translate:text` on private text (chat, support, disputes, exchanges, replacements): the socket hands the request to the
 * service that owns the record, with the caller; a guest never gets that far; a public kind keeps the old path.
 */
const as = (role: string, id = 'u1') => ({ data: { user: { id, role, name: `${role} name` } } }) as never;
const guest = { data: { user: { id: 'g', role: 'guest', name: 'Guest' } } } as never;
const ID = '00000000-0000-4000-8000-000000000001';

function gateway() {
  const answer = { text: 'x', sourceLang: 'fr', same: false };
  const service = () => ({ translate: jest.fn(async (..._args: unknown[]) => answer) });
  const support = service();
  const disputes = service();
  const exchanges = service();
  const replacements = service();
  const chat = service();
  const translations = { translateStored: jest.fn(async () => answer) };
  const users = { findById: jest.fn(async () => ({ hubId: 'hub-k' })) };
  const gw = Object.assign(Object.create(RealtimeGateway.prototype), { support, disputes, exchanges, replacements, translations, users, kit: { chat } }) as RealtimeGateway;
  return { gw, support, disputes, exchanges, replacements, chat, translations };
}
const body = (kind: string) => ({ kind, id: ID, target: 'en' });

describe('translate:text routes private kinds to the service that checks the reader', () => {
  it.each([
    ['support_ticket', 'support'],
    ['support_message', 'support'],
    ['dispute_message', 'disputes'],
    ['dispute_reason', 'disputes'],
    ['dispute_reply', 'disputes'],
    ['dispute_resolution', 'disputes'],
    ['exchange_reason', 'exchanges'],
    ['exchange_reply', 'exchanges'],
    ['replacement_reason', 'replacements'],
    ['replacement_reply', 'replacements'],
    ['chat_message', 'chat'],
  ] as const)('%s goes to %s, with the caller, and never to the generic translator', async (kind, owner) => {
    const g = gateway();
    const res = await g.gw.translateText(as('customer', 'c1'), body(kind));
    expect(res).toMatchObject({ ok: true });
    const svc = g[owner] as { translate: jest.Mock };
    expect(svc.translate).toHaveBeenCalledTimes(1);
    const args = svc.translate.mock.calls[0] as unknown[];
    expect(args[0]).toMatchObject({ id: 'c1', role: 'customer' });
    expect(args).toContain(ID);
    expect(g.translations.translateStored).not.toHaveBeenCalled();
  });

  it('a guest is refused before any service is asked', async () => {
    const g = gateway();
    for (const kind of ['support_message', 'dispute_message', 'exchange_reason', 'replacement_reason', 'chat_message']) {
      expect(await g.gw.translateText(guest, body(kind))).toMatchObject({ ok: false });
    }
    for (const s of [g.support, g.disputes, g.exchanges, g.replacements, g.chat]) expect(s.translate).not.toHaveBeenCalled();
  });

  it('a refusal from the owning service reaches the client as an ordinary error', async () => {
    const g = gateway();
    g.disputes.translate.mockRejectedValueOnce(new Error('Nothing to translate.'));
    expect(await g.gw.translateText(as('customer', 'c2'), body('dispute_message'))).toEqual({ ok: false, error: 'Nothing to translate.' });
  });

  it('warehouse staff go to the dispute service with their warehouse (they read the returns of that warehouse only)', async () => {
    const g = gateway();
    await g.gw.translateText(as('warehouse_staff', 'w1'), body('dispute_reason'));
    expect(g.disputes.translate.mock.calls[0][0]).toMatchObject({ id: 'w1', hubId: 'hub-k' });
  });

  it('a public kind (a review) still takes the generic path, with no private flag', async () => {
    const g = gateway();
    await g.gw.translateText(as('customer', 'c1'), body('review'));
    expect(g.translations.translateStored).toHaveBeenCalledWith('review', ID, 'en', { staff: false });
  });
});
