// Language coverage: every text exists in French AND English, French is applied
// by default, the language can be switched, and no user-visible English is
// hard-coded in the screens.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/messages.dart';
import 'package:lipcart/l10n/notification_text.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/main.dart';
import 'package:lipcart/services/auth_service.dart';
import 'package:lipcart/util/format.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Words/names that are legitimately the same in both languages.
const _sameInBothLanguages = {
  'total', 'description', 'ok', 'addr_commune', 'addr_commune_hint', 'addr_city_hint', 'settings_notifications',
  'settings_sms', 'kv_type', 'notifications', 'notifications_n', 'promo_row', 'reg_phone_hint', 'country_cg',
  'country_fr', 'country_ke',
};

Set<String> _placeholders(String text) => RegExp(r'\{(\w+)\}').allMatches(text).map((m) => m.group(1)!).toSet();

void main() {
  setUpAll(() => initializeDateFormatting());

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    Strings.hasChoice = false;
    await Strings.setLang('fr', persist: false);
  });

  group('translations', () {
    test('every key has a non-empty English and French text', () {
      expect(kMessages, isNotEmpty);
      final missing = <String>[];
      kMessages.forEach((key, v) {
        if (v.$1.trim().isEmpty) missing.add('$key (en)');
        if (v.$2.trim().isEmpty) missing.add('$key (fr)');
      });
      expect(missing, isEmpty, reason: 'missing or empty translations');
    });

    test('both languages use the same {placeholders}', () {
      final bad = kMessages.entries.where((e) => !_setEq(_placeholders(e.value.$1), _placeholders(e.value.$2))).map((e) => e.key);
      expect(bad, isEmpty);
    });

    test('French is really translated (no English copy-pasted into the French column)', () {
      final same = kMessages.entries.where((e) => e.value.$1 == e.value.$2).map((e) => e.key).toSet();
      expect(same.difference(_sameInBothLanguages), isEmpty, reason: 'untranslated French text');
    });

    test('Strings.t resolves each key in both languages', () {
      const en = Strings('en'), fr = Strings('fr');
      for (final key in kMessages.keys) {
        expect(en.has(key), isTrue);
        expect(en.t(key), isNotEmpty);
        expect(fr.t(key), isNotEmpty);
      }
      expect(fr.cartEmpty, 'Votre panier est vide');
      expect(en.cartEmpty, 'Your cart is empty');
      expect(fr.itemsCount(1), '1 article');
      expect(fr.itemsCount(3), '3 articles');
      expect(en.itemsCount(1), '1 item');
      expect(en.itemsCount(3), '3 items');
    });

    test('every key used from the code exists', () {
      final used = <String>{};
      final call = RegExp(r"""\bt\(\s*'([\w]+)'""");
      for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
        if (f.path.contains('messages.dart') || f.path.endsWith('strings_keys.dart')) continue;
        used.addAll(call.allMatches(f.readAsStringSync()).map((m) => m.group(1)!));
      }
      expect(kMessages.keys.toSet().containsAll(used), isTrue, reason: 'unknown keys: ${used.difference(kMessages.keys.toSet())}');
    });

    test('dynamic key families are complete (statuses, hints, payment methods, markets)', () {
      const s = Strings('fr');
      for (final st in ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned']) {
        expect(s.has('status_$st'), isTrue, reason: 'status_$st');
      }
      for (final st in ['delivered', 'out_for_delivery', 'shipped', 'confirmed', 'pending', 'cancelled', 'returned', 'processing']) {
        expect(s.has('hint_$st'), isTrue, reason: 'hint_$st');
      }
      for (final m in ['stripe_card', 'cod', 'wallet']) {
        expect(s.has('pay_$m'), isTrue, reason: 'pay_$m');
      }
      for (final m in ['france', 'drc']) {
        expect(s.has('market_$m'), isTrue);
      }
      expect(s.orderStatus('out_for_delivery'), 'En cours de livraison');
      expect(s.orderStatus('something_new'), 'something_new', reason: 'unknown values pass through');
    });

    test('no user-visible English is hard-coded in lib/', () {
      // Text('Literal'), hintText: 'Literal', labelText: …, tooltip: … must go through Strings.
      final pattern = RegExp(
          r"""(?:(?:Text|SelectableText)\(\s*(?:const\s+)?|(?:hintText|labelText|helperText|errorText|tooltip|semanticLabel|applicationName):\s*)'((?:[^'\\]|\\.)*)'""");
      const brand = {'Somba&Teka', 'EN', 'FR', 'FC'};
      final offenders = <String>[];
      for (final f in Directory('lib').listSync(recursive: true).whereType<File>().where((f) => f.path.endsWith('.dart'))) {
        if (f.path.contains('/l10n/')) continue;
        // Drop ${…} interpolations first: they may contain quotes of their own.
        final source = f.readAsStringSync().replaceAll(RegExp(r'\$\{[^{}]*\}'), '');
        for (final m in pattern.allMatches(source)) {
          final text = m.group(1)!.replaceAll(RegExp(r'\$\w+'), '');
          if (brand.contains(text)) continue;
          if (RegExp(r'[A-Za-zÀ-ÿ]{3,}').hasMatch(text)) offenders.add('${f.path}: $text');
        }
      }
      expect(offenders, isEmpty);
    });
  });

  group('server messages', () {
    const fr = Strings('fr'), en = Strings('en');

    test('known English server errors are shown in French, others pass through', () {
      expect(translateServerError('Invalid email or password.', fr), 'E-mail ou mot de passe incorrect.');
      expect(translateServerError('Insufficient wallet balance.', fr), 'Solde du portefeuille insuffisant.');
      expect(translateServerError('Order not found.', fr), 'Commande introuvable.');
      expect(translateServerError('Not allowed.', fr), 'Action non autorisée.');
      expect(translateServerError('"Phone X" just sold out or has too little stock left.', fr), '« Phone X » est épuisé ou n’a plus assez de stock.');
      expect(translateServerError('Minimum order \$20.', fr), 'Commande minimum de 20 \$.');
      expect(translateServerError('Order can no longer be cancelled (status: shipped).', fr), contains('expédiée'));
      expect(translateServerError('A brand new unknown message.', fr), 'A brand new unknown message.');
      expect(translateServerError('Order not found.', en), 'Order not found.', reason: 'English stays as the server wrote it');
    });

    test('every mapped message has a French text', () {
      for (final m in knownServerErrors) {
        expect(translateServerError(m, fr), isNot(equals(m)), reason: m);
      }
    });

    test('ApiException prints in the current language', () async {
      final e = ApiException('Invalid email or password.');
      expect(e.toString(), 'E-mail ou mot de passe incorrect.');
      await Strings.setLang('en', persist: false);
      expect(e.toString(), 'Invalid email or password.');
      expect(ApiException.local('err_offline').toString(), 'Can’t reach the server. Check your internet connection.');
      await Strings.setLang('fr', persist: false);
      expect(ApiException.local('err_offline').toString(), 'Impossible de joindre le serveur. Vérifiez votre connexion internet.');
      expect(Strings.current.errorText(StateError('boom')), Strings.current.errUnexpected, reason: 'no raw exception dumps');
    });

    test('server notifications and wallet lines are translated', () {
      const fr = Strings('fr');
      expect(localizeNotification(fr, 'Order placed', 'We received SOM-1042. You\'ll get updates here in real time.'),
          ('Commande enregistrée', 'Nous avons reçu SOM-1042. Vous recevrez les mises à jour ici en temps réel.'));
      expect(localizeNotification(fr, 'Order update', 'SOM-1 is now out for delivery.').$2, 'SOM-1 est maintenant en cours de livraison.');
      expect(localizeNotification(fr, 'Promo of the week', 'Free delivery!'), ('Promo of the week', 'Free delivery!'));
      expect(localizeNotification(const Strings('en'), 'Order placed', 'x'), ('Order placed', 'x'));
      expect(localizeWalletDescription(fr, 'Wallet top-up via airtel_money'), 'Recharge du portefeuille via Airtel Money');
      expect(localizeWalletDescription(fr, 'Refund for SOM-9'), 'Remboursement de SOM-9');
    });
  });

  group('formatting', () {
    test('amounts, numbers and dates follow the language', () async {
      await Strings.setLang('en', persist: false);
      expect(money(1199), anyOf('FC 3,417,150', '\$1,199'));
      expect(Strings.current.number(1234.5, decimals: 1), '1,234.5');
      await Strings.setLang('fr', persist: false);
      expect(money(1199).replaceAll(RegExp(r'[  ]'), ' '), anyOf('3 417 150 FC', '1 199 \$'));
      expect(Strings.current.number(1234.5, decimals: 1), '1 234,5');
      final d = DateTime(2026, 10, 17, 14, 5);
      expect(const Strings('fr').date(d), contains('oct'));
      expect(const Strings('en').date(d), contains('Oct'));
      expect(const Strings('fr').time(d), '14:05');
    });
  });

  group('language switch', () {
    testWidgets('the sign-in screen is French by default and switches to English and back', (tester) async {
      await tester.pumpWidget(const SombaApp());
      await tester.pump(const Duration(seconds: 3));
      await tester.pump();

      expect(find.text('Bon retour'), findsOneWidget);
      expect(find.text('Welcome back'), findsNothing);
      expect(find.widgetWithText(FilledButton, 'Se connecter'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('lang-toggle')));
      await tester.pumpAndSettle();
      expect(find.text('Welcome back'), findsOneWidget);
      expect(find.text('Bon retour'), findsNothing);
      expect(find.widgetWithText(FilledButton, 'Sign in'), findsOneWidget);
      expect(Strings.current.lang, 'en');

      // Validation messages follow the language too.
      await tester.tap(find.widgetWithText(FilledButton, 'Sign in'));
      await tester.pump();
      expect(find.text('Enter your email'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('lang-toggle')));
      await tester.pumpAndSettle();
      expect(find.text('Bon retour'), findsOneWidget);
      await tester.tap(find.widgetWithText(FilledButton, 'Se connecter'));
      await tester.pump();
      expect(find.text('Saisissez votre e-mail'), findsOneWidget);
    });

    testWidgets('the chosen language is remembered on the device', (tester) async {
      await tester.pumpWidget(const SombaApp());
      await tester.pump(const Duration(seconds: 3));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('lang-toggle')));
      await tester.pumpAndSettle();
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getString('somba.lang'), 'en');

      // A fresh start reads it back.
      await Strings.setLang('fr', persist: false);
      Strings.hasChoice = false;
      await Strings.restore();
      expect(Strings.current.lang, 'en');
      expect(Strings.hasChoice, isTrue);
    });
  });
}

bool _setEq(Set<String> a, Set<String> b) => a.length == b.length && a.containsAll(b);
