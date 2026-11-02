// The card sheet only ever accepts a publishable key from the server: a secret key must never reach the phone.
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/services/card_payments.dart';

void main() {
  for (final bad in ['sk_' + 'test_abcdefghijklmnop', 'rk_' + 'live_abcdefghijklmnop', 'whsec_abcdefghijklmnop', 'pk_' + 'test_short', '']) {
    test('refuses "${bad.isEmpty ? '(empty)' : bad.split('_').first}" without opening the sheet', () async {
      final r = await StripeCardPayments().present(publishableKey: bad, clientSecret: 'pi_123_secret_abc', merchantName: 'Somba & Teka');
      expect(r.isFailed, isTrue);
      expect(r.message, isEmpty, reason: 'no detail that could echo a key');
    });
  }
}
