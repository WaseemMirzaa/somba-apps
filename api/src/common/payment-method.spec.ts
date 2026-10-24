import { paymentMethodId, paymentMethodLabel } from './payment-method';

describe('paymentMethodLabel', () => {
  it.each([
    ['airtel_money', 'Airtel Money'],
    ['orange_money', 'Orange Money'],
    ['vodacom_mpesa', 'Vodacom M-Pesa'],
    ['stripe_card', 'Card'],
    ['cod', 'Cash on delivery'],
    ['wallet', 'Wallet'],
    ['some_new_network', 'Some New Network'],
    ['', ''],
  ])('%s -> %s', (id, label) => {
    expect(paymentMethodLabel(id)).toBe(label);
  });

  it('never returns an underscore id for a method the platform knows', () => {
    for (const id of ['airtel_money', 'orange_money', 'vodacom_mpesa', 'stripe_card']) expect(paymentMethodLabel(id)).not.toContain('_');
  });

  it('copes with a missing method', () => {
    expect(paymentMethodLabel(null)).toBe('');
    expect(paymentMethodLabel(undefined)).toBe('');
  });
});

describe('paymentMethodId', () => {
  it.each([
    ['airtel_money', 'airtel_money'],
    ['Airtel Money', 'airtel_money'],
    ['airtel money', 'airtel_money'],
    ['Vodacom M-Pesa', 'vodacom_mpesa'],
    ['vodacom mpesa', 'vodacom_mpesa'],
    ['Cash on delivery', 'cod'],
    ['Wallet', 'wallet'],
    ['Mystery', null],
  ])('%s -> %s', (text, id) => {
    expect(paymentMethodId(text)).toBe(id);
  });
});
