import { csvWords } from './csv-labels';

describe('csv words', () => {
  it('English keeps the codes the files always had', () => {
    const w = csvWords('en');
    expect(w.t('h.order')).toBe('Order');
    expect(w.t('t.paid')).toBe('Payouts paid USD');
    expect(w.orderStatus('out_for_delivery')).toBe('out_for_delivery');
    expect(w.packageStatus('to_pack')).toBe('to_pack');
    expect(w.payoutStatus('requested')).toBe('requested');
    expect(w.kind('refund')).toBe('refund');
    expect(w.method('cod')).toBe('cod');
  });

  it('French has a word for every order status, package step, payout status, kind and common payment method', () => {
    const w = csvWords('fr');
    for (const s of ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned']) expect(w.orderStatus(s)).not.toBe(s);
    for (const s of ['to_pack', 'ready', 'at_hub']) expect(w.packageStatus(s)).not.toBe(s);
    expect(w.packageStatus('delivered')).toBe('livrée'); // a package past the warehouse carries the order's own status
    for (const s of ['requested', 'sending', 'rejected', 'paid']) expect(w.payoutStatus(s)).not.toBe(s);
    for (const k of ['sale', 'refund', 'payout']) expect(w.kind(k)).not.toBe(k);
    expect(w.method('cod')).toBe('Paiement à la livraison');
    expect(w.method('airtel_money')).toBe('airtel_money'); // brand names stay
    expect(w.method(null)).toBe('');
  });

  it('a word we do not know comes back as it is, and a missing heading falls back to English', () => {
    const w = csvWords('fr');
    expect(w.orderStatus('brand_new')).toBe('brand_new');
    expect(w.t('h.nothing')).toBe('h.nothing');
    expect(w.t('h.order')).toBe('Commande');
  });
});
