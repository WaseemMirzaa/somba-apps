// French dollar amounts need a thousands separator: a cash-on-delivery badge read "1202,00 $".
// `Strings.usd` is the only money formatter of the app (earnings, cash to collect, the delivery pill).
import 'package:flutter_test/flutter_test.dart';
import 'package:somba_rider/l10n/notification_text.dart';
import 'package:somba_rider/l10n/strings.dart';

void main() {
  const fr = Strings('fr');
  const en = Strings('en');

  group('USD amounts follow the language', () {
    test(r'1202 in French: "1 202,00 $" with a no-break space between the thousands and before the symbol', () {
      expect(fr.usd(1202), '1 202,00 \$');
      expect(fr.usd(1202), isNot(contains('1202')));
      // Whatever the separator is, it must be a space that never breaks the number across lines.
      expect(fr.usd(1202), matches(RegExp(r'^1[  ]202,00[  ]\$$')));
    });

    test(r'1202 in English: "$1,202.00"', () {
      expect(en.usd(1202), '\$1,202.00');
    });

    test('small, large and fractional amounts, both languages', () {
      expect(fr.usd(0), '0,00 \$');
      expect(fr.usd(12.5), '12,50 \$');
      expect(fr.usd(999.99), '999,99 \$');
      expect(fr.usd(1234567.8), '1 234 567,80 \$');
      expect(en.usd(0), '\$0.00');
      expect(en.usd(12.5), '\$12.50');
      expect(en.usd(1234567.8), '\$1,234,567.80');
    });

    test('the narrow U+202F of the locale data never reaches the screen (too thin to read in a small pill)', () {
      for (final s in [fr, en]) {
        for (final v in [0, 7.5, 1202, 98765.43, 1234567]) {
          expect(s.usd(v), isNot(contains(' ')), reason: '${s.lang} $v');
        }
      }
    });
  });

  group('the cash-on-delivery badge', () {
    test(r'French: "Paiement à la livraison 1 202,00 $"', () {
      expect(fr.codPill(fr.usd(1202)), 'Paiement à la livraison 1 202,00 \$');
    });

    test(r'English: "COD $1,202.00"', () {
      expect(en.codPill(en.usd(1202)), 'COD \$1,202.00');
    });
  });

  group('amounts inside French notification texts (older servers, no French wording)', () {
    test('a cash amount is grouped and uses the decimal comma', () {
      expect(localizeNotification(fr, 'New delivery available', r'SOM-7 · collect $1202.00 cash. Open the app to accept it.').$2,
          'SOM-7 · 1 202,00 \$ à encaisser. Ouvrez l’application pour l’accepter.');
      expect(localizeNotification(fr, 'New delivery available', r'SOM-7 · collect $12.50 cash. Open the app to accept it.').$2,
          'SOM-7 · 12,50 \$ à encaisser. Ouvrez l’application pour l’accepter.');
      expect(localizeNotification(fr, 'New order', r'SOM-8 · $1202.00 from Marie').$2, 'SOM-8 · 1 202,00 \$ de Marie');
    });

    test('English notices are shown as received', () {
      const raw = r'SOM-7 · collect $1202.00 cash. Open the app to accept it.';
      expect(localizeNotification(en, 'New delivery available', raw), ('New delivery available', raw));
    });
  });
}
