import { AdminControlsGateway } from './admin-controls.gateway';
import { ChatGateway } from '../chat/chat.gateway';
import { CHAT_CLOSED, ChatService } from '../chat/chat.service';

const client = (role: string, id = 'u1', name = 'User One') => ({ data: { user: { id, role, name } } }) as never;
const guest = { data: { user: { id: 'guest', role: 'guest', name: 'Guest' } } } as never;
const echo = () => jest.fn(async (...a: unknown[]) => ({ args: a, id: 'x', sellerId: 's1', storeName: 'Shop', name: 'Shop' }));

function make() {
  const ctx = { resolve: jest.fn(async () => ({ seller: { id: 's1' } })) };
  const storefront = { setExpress: echo() };
  const policies = { template: echo(), mine: echo(), list: echo(), approve: echo(), reject: echo(), publish: echo() };
  const audit = { record: jest.fn(async (..._a: { action: string }[]) => undefined) };
  return { ctx, storefront, policies, audit, gw: new AdminControlsGateway(ctx as never, storefront as never, policies as never, audit as never) };
}

describe('sellers:setExpress (admin / operations)', () => {
  it('only the super admin and operations; everyone else is refused and nothing is written', async () => {
    const { gw, storefront, audit } = make();
    for (const role of ['seller', 'customer', 'admin_support', 'admin_finance', 'admin_marketing', 'admin_moderation', 'warehouse_staff', 'rider']) {
      expect(await gw.setExpress(client(role), { sellerId: 's1', enabled: true })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    expect(await gw.setExpress(guest, { sellerId: 's1', enabled: true })).toEqual({ ok: false, error: 'Sign in to continue.' });
    expect(storefront.setExpress).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_operations']) {
      expect((await gw.setExpress(client(role), { sellerId: 's1', enabled: true })).ok).toBe(true);
    }
    expect(storefront.setExpress).toHaveBeenCalledWith('s1', true);
    expect(audit.record.mock.calls.map(([e]) => e.action)).toEqual(['seller.express_on', 'seller.express_on']);
    await gw.setExpress(client('admin'), { id: 's2', enabled: false });
    expect(storefront.setExpress).toHaveBeenLastCalledWith('s2', false);
    expect(audit.record.mock.calls.at(-1)![0].action).toBe('seller.express_off');
  });

  it('a service refusal (no pickup pin) comes back as the error', async () => {
    const { gw, storefront } = make();
    storefront.setExpress.mockRejectedValueOnce(new Error('This store has no pinned pickup location.'));
    expect(await gw.setExpress(client('admin'), { sellerId: 's1', enabled: true })).toEqual({ ok: false, error: 'This store has no pinned pickup location.' });
  });
});

describe('store policies', () => {
  it('the queue, approve, reject and publish are for the super admin and moderation only', async () => {
    const { gw, policies, audit } = make();
    for (const role of ['seller', 'customer', 'admin_support', 'admin_finance', 'admin_marketing', 'admin_operations', 'warehouse_staff']) {
      expect(await gw.list(client(role), {})).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.approve(client(role), { id: 'r' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.reject(client(role), { id: 'r', note: 'Not good enough' })).toEqual({ ok: false, error: 'Not allowed.' });
      expect(await gw.publish(client(role), { sellerId: 's1' })).toEqual({ ok: false, error: 'Not allowed.' });
    }
    for (const fn of Object.values(policies)) expect(fn).not.toHaveBeenCalled();
    for (const role of ['admin', 'admin_moderation']) {
      expect((await gw.list(client(role), { status: 'all' })).ok).toBe(true);
      expect((await gw.approve(client(role, 'a1', 'Admin'), { id: 'r', note: 'ok' })).ok).toBe(true);
      expect((await gw.reject(client(role), { id: 'r', note: 'Not good enough' })).ok).toBe(true);
      expect((await gw.publish(client(role), { sellerId: 's1', returnsPolicy: 'x' })).ok).toBe(true);
    }
    expect(policies.approve).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', name: 'Admin' }), 'r', 'ok');
    expect(audit.record.mock.calls.map(([e]) => e.action)).toEqual(['seller.policy_approved', 'seller.policy_rejected', 'seller.policy_published', 'seller.policy_approved', 'seller.policy_rejected', 'seller.policy_published']);
  });

  it('the template and the proposal status are for the store\'s storefront permission, read-only', async () => {
    const { gw, ctx, policies } = make();
    expect((await gw.template(client('seller'))).ok).toBe(true);
    expect((await gw.mine(client('seller'))).ok).toBe(true);
    expect(ctx.resolve).toHaveBeenCalledWith(expect.objectContaining({ role: 'seller' }), 'storefront', { write: false });
    expect(policies.template).toHaveBeenCalled();
    ctx.resolve.mockRejectedValueOnce(new Error('Sellers only.'));
    expect(await gw.template(client('customer'))).toEqual({ ok: false, error: 'Sellers only.' });
  });
});

describe('chat is closed', () => {
  const chat = () => {
    const svc = new (ChatService as unknown as new (...a: unknown[]) => ChatService)(...Array(6).fill({}));
    const spy = { adminList: jest.fn(async () => []), adminMessages: jest.fn(async () => ({ messages: [] })), list: jest.fn(async () => []) };
    return { gw: new ChatGateway(Object.assign(svc, spy) as never) };
  };

  it('chat:start and chat:send answer with the closed message for every role', async () => {
    const { gw } = chat();
    for (const role of ['customer', 'seller', 'admin', 'admin_support']) {
      expect(await gw.start(client(role), { sellerId: 's1', text: 'hello' })).toEqual({ ok: false, error: CHAT_CLOSED });
      expect(await gw.send(client(role), { conversationId: 'c', text: 'hello' })).toEqual({ ok: false, error: CHAT_CLOSED });
    }
  });

  it('chat:adminList and chat:adminMessages reach the service with the caller (it holds the role check)', async () => {
    const { gw } = chat();
    expect((await gw.adminList(client('admin_support'), { q: 'x' })).ok).toBe(true);
    expect((await gw.adminMessages(client('admin_support'), { conversationId: 'c' })).ok).toBe(true);
    expect(await gw.adminList(guest, {})).toEqual({ ok: false, error: 'Sign in to continue.' });
  });
});
