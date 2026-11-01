import { commerceWorld } from '../testing/commerce-db';
import type { World } from '../testing/commerce-db';

let w: World;
beforeEach(async () => {
  w = await commerceWorld();
});
afterEach(async () => w.ds.destroy());

describe('products:list for a seller = their own store\'s catalogue', () => {
  it('lists only the given store\'s listings (drafts and pending included), never other stores\' live products', async () => {
    const mine = await w.store('Mine', 'u-mine');
    const theirs = await w.store('Theirs', 'u-theirs');
    const live = await w.product(mine, { name: 'My live' });
    const pending = await w.product(mine, { name: 'My pending' }, 'pending');
    await w.product(theirs, { name: 'Their live' });
    await w.product(theirs, { name: 'Their pending' }, 'pending');

    const own = await w.products.list({ ownerIds: [mine.id, 'u-mine'], ownOnly: true });
    expect(own.map((p) => p.name).sort()).toEqual(['My live', 'My pending']);
    // The shopper view is unchanged: every LIVE listing, no drafts.
    expect((await w.products.list({ liveOnly: true })).map((p) => p.name).sort()).toEqual(['My live', 'Their live']);
    // A status filter narrows within the store.
    expect((await w.products.list({ ownerIds: [mine.id], ownOnly: true, status: 'live' })).map((p) => p.id)).toEqual([live.id]);
    expect((await w.products.list({ ownerIds: [mine.id], ownOnly: true, status: 'pending' })).map((p) => p.id)).toEqual([pending.id]);
  });

  it('an account with no store sees nothing, and removed listings stay out', async () => {
    const mine = await w.store('Mine', 'u-mine');
    const gone = await w.product(mine, { name: 'Gone' });
    await w.ds.getRepository('Product').update({ id: gone.id }, { status: 'removed' });
    await w.product(mine, { name: 'Kept' });
    expect((await w.products.list({ ownerIds: [], ownOnly: true })).length).toBe(0);
    expect((await w.products.list({ ownOnly: true })).length).toBe(0);
    expect((await w.products.list({ ownerIds: [mine.id], ownOnly: true })).map((p) => p.name)).toEqual(['Kept']);
  });

  it('paging and category filters work inside the store', async () => {
    const mine = await w.store('Mine', 'u-mine');
    const other = await w.store('Other', 'u-other');
    for (let i = 0; i < 5; i++) await w.product(mine, { name: `P${i}` });
    await w.product(other, { name: 'Elsewhere' });
    const page1 = await w.products.list({ ownerIds: [mine.id], ownOnly: true, limit: 3 });
    const page2 = await w.products.list({ ownerIds: [mine.id], ownOnly: true, limit: 3, offset: 3 });
    expect(page1).toHaveLength(3);
    expect(page2).toHaveLength(2);
    expect(new Set([...page1, ...page2].map((p) => p.id)).size).toBe(5);
    expect(await w.products.list({ ownerIds: [mine.id], ownOnly: true, categoryId: '00000000-0000-0000-0000-000000000000' })).toEqual([]);
  });
});
