import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/util/payment_label.dart';

void main() {
  test('known methods use their translated name', () {
    const en = Strings('en');
    expect(shownPaymentLabel(en, 'wallet'), en.paymentLabel('wallet'));
    expect(shownPaymentLabel(en, 'airtel_money'), 'Airtel Money');
    expect(shownPaymentLabel(en, 'stripe_card'), en.paymentLabel('stripe_card'));
  });

  test('a method the app does not know reads as a humanised label, never a crash or a raw code', () {
    const en = Strings('en');
    expect(shownPaymentLabel(en, 'some_old_method'), 'Some old method');
    expect(shownPaymentLabel(en, ''), en.t('payment'));
  });
}
