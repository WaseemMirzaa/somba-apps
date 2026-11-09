// Deleting the account (audit C-04): the screen asks the server what is still outstanding BEFORE the customer
// confirms, and shows each reason in words, in English and in French, with where to settle it. The delete button stays
// off while anything is outstanding, and a refusal from the server (an order placed meanwhile) shows the same list.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/messages.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/account_deletion.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/realtime_store.dart';

import 'button_rules.dart';
import 'gap_helpers.dart';
import 'social_helpers.dart';

const _wallet = {'kind': 'wallet_balance', 'count': 1, 'amountUsd': 204.0};
const _order = {'kind': 'open_order', 'count': 2};

Future<void> open(WidgetTester tester, {String lang = 'en', double scale = 1}) async {
  gapTallViewport(tester);
  await Strings.setLang(lang, persist: false);
  await tester.pumpWidget(gapApp(
    Builder(builder: (context) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: const AccountDeleteScreen())),
    lang: lang,
  ));
  await tester.pump(const Duration(milliseconds: 300));
}

bool _enabled(WidgetTester tester) => tester.widget<FilledButton>(find.byKey(const ValueKey('delete-account'))).onPressed != null;

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  late FakeServer server;
  setUp(() async => server = await socialReset());
  tearDown(socialTearDown);

  group('the reasons are shown before anything is confirmed', () {
    testWidgets('English: names the money and the unfinished orders, offers where to settle them, delete is off', (tester) async {
      server.handlers['me:deleteCheck'] = (_) => {'canDelete': false, 'blockers': [_wallet, _order]};
      await open(tester);
      expect(server.countOf('me:deleteCheck'), 1);
      expect(server.countOf('me:delete'), 0, reason: 'nothing is sent until the customer confirms');
      expect(find.byKey(const ValueKey('delete-blockers')), findsOneWidget);
      expect(find.text('You can’t delete your account yet'), findsOneWidget);
      expect(find.text('Your wallet still holds \$204.00: spend it or ask support to pay it out first.'), findsOneWidget);
      expect(find.text('You have 2 orders that are not finished yet: wait until they are delivered, or cancel them, first.'), findsOneWidget);
      expect(find.text('Open my wallet'), findsOneWidget);
      expect(find.text('See my orders'), findsOneWidget);
      expect(find.text('Contact support'), findsOneWidget);
      expect(_enabled(tester), isFalse);
      expectButtonRules(tester);
    });

    testWidgets('French: the same reasons in French, with the amount in French form', (tester) async {
      server.handlers['me:deleteCheck'] = (_) => {'canDelete': false, 'blockers': [_wallet, _order]};
      await open(tester, lang: 'fr');
      expect(find.text('Vous ne pouvez pas encore supprimer votre compte'), findsOneWidget);
      expect(find.textContaining('Votre portefeuille contient encore 204,00 \$ : dépensez-le ou demandez à l’assistance de vous le verser d’abord.'), findsOneWidget);
      expect(find.text('Vous avez 2 commandes qui ne sont pas terminées : attendez qu’elles soient livrées, ou annulez-les, d’abord.'), findsOneWidget);
      expect(find.text('Ouvrir mon portefeuille'), findsOneWidget);
      expect(find.text('Voir mes commandes'), findsOneWidget);
      expect(find.text('Contacter l’assistance'), findsOneWidget);
      expect(_enabled(tester), isFalse);
      expectButtonRules(tester);
    });

    testWidgets('every kind has its words in both languages, singular and plural', (tester) async {
      const en = Strings('en'), fr = Strings('fr');
      for (final kind in DeletionBlocker.kinds) {
        for (final count in [1, 3]) {
          final b = DeletionBlocker(kind, count: count, amountUsd: kind == 'wallet_balance' ? 12.5 : null);
          expect(en.delaccBlocker(b), isNot(contains('delacc_')), reason: kind);
          expect(fr.delaccBlocker(b), isNot(equals(en.delaccBlocker(b))), reason: kind);
          expect(fr.delaccBlocker(b), isNot(contains('{')), reason: kind);
        }
      }
    });

    testWidgets('large text (200%) in French still lays out without overflow', (tester) async {
      server.handlers['me:deleteCheck'] = (_) => {
            'blockers': [_wallet, _order, {'kind': 'open_return', 'count': 1}, {'kind': 'open_dispute', 'count': 1}, {'kind': 'open_ticket', 'count': 1}]
          };
      await open(tester, lang: 'fr', scale: 2);
      expect(tester.takeException(), isNull);
      expect(find.byKey(const ValueKey('delete-blockers')), findsOneWidget);
    });

    testWidgets('nothing outstanding: no warning card and delete works', (tester) async {
      server.handlers['me:deleteCheck'] = (_) => {'canDelete': true, 'blockers': []};
      server.handlers['me:delete'] = (_) => {'deleted': true};
      await open(tester);
      expect(find.byKey(const ValueKey('delete-blockers')), findsNothing);
      expect(_enabled(tester), isTrue);
      await tester.enterText(find.byType(TextField), 'Password-123');
      await tester.tap(find.byKey(const ValueKey('delete-account')));
      await tester.pump(const Duration(milliseconds: 100));
      expect(server.bodiesOf('me:delete').single, {'password': 'Password-123'});
    });

    testWidgets('the check cannot be asked (offline or an older server): delete stays on, the server decides', (tester) async {
      server.handlers['me:deleteCheck'] = (_) => throw ApiException.local('err_offline');
      await open(tester);
      expect(find.byKey(const ValueKey('delete-blockers')), findsNothing);
      expect(_enabled(tester), isTrue);
    });
  });

  group('a refusal the server still sends (something changed meanwhile)', () {
    testWidgets('shows the same reasons, not a raw error, and keeps the session', (tester) async {
      server.handlers['me:deleteCheck'] = (_) => {'canDelete': true, 'blockers': []};
      server.handlers['me:delete'] = (_) => throw ApiException.refusal(
            'You cannot delete your account yet. A wallet top-up is still waiting for your approval: wait until it completes or fails first.',
            code: 'account_blocked',
            details: {'blockers': [{'kind': 'pending_topup', 'count': 1}]},
          );
      await open(tester);
      await tester.enterText(find.byType(TextField), 'Password-123');
      await tester.tap(find.byKey(const ValueKey('delete-account')));
      await tester.pump(const Duration(milliseconds: 100));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('delete-blockers')), findsOneWidget);
      expect(find.text('A wallet top-up is still waiting for your approval: wait until it completes or fails first.'), findsOneWidget);
      expect(find.textContaining('You cannot delete your account yet. A wallet'), findsNothing);
      expect(_enabled(tester), isFalse);
      expect(RealtimeStore.instance.user, isNotNull, reason: 'a refusal does not sign the customer out');
    });

    testWidgets('a wrong password is still shown under the field', (tester) async {
      server.handlers['me:deleteCheck'] = (_) => {'canDelete': true, 'blockers': []};
      server.handlers['me:delete'] = (_) => throw ApiException('Password is incorrect.');
      await open(tester);
      await tester.enterText(find.byType(TextField), 'nope');
      await tester.tap(find.byKey(const ValueKey('delete-account')));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.text('Password is incorrect.'), findsOneWidget);
      expect(find.byKey(const ValueKey('delete-blockers')), findsNothing);
    });
  });

  group('the promise on the screen matches the behaviour', () {
    test('what the deletion text says is removed, is what the server removes', () {
      for (final lang in [0, 1]) {
        String pick((String, String) v) => lang == 0 ? v.$1 : v.$2;
        final body = pick(kMessages['delacc_permanent_body']!);
        expect(body, isNot(contains('forfeit')));
        expect(pick(kMessages['delacc_b1']!), isNot(contains('perdu')));
      }
      expect(kMessages['delacc_permanent_body']!.$1, allOf(contains('name'), contains('phone'), contains('street address'), contains('reviews')));
      expect(kMessages['delacc_permanent_body']!.$2, allOf(contains('nom'), contains('téléphone'), contains('adresse'), contains('avis')));
    });

    test('the server refusal message is translated whole, sentence by sentence', () {
      const fr = Strings('fr');
      const en = Strings('en');
      const raw =
          'You cannot delete your account yet. Your wallet still holds \$204.69: spend it or ask support to pay it out first. You have 1 order that is not finished yet: wait until it is delivered, or cancel it, first.';
      final out = translateServerError(raw, fr);
      expect(out, startsWith('Vous ne pouvez pas encore supprimer votre compte.'));
      expect(out, contains('204,69 \$'));
      expect(out, contains('Vous avez 1 commande qui n’est pas terminée'));
      expect(translateServerError(raw, en), raw);
      // a reason this app does not know leaves the message as it came
      expect(translateServerError('$raw A new thing is pending.', fr), '$raw A new thing is pending.');
    });

    test('DeletionBlocker reads the server JSON and ignores kinds it does not know', () {
      final list = DeletionBlocker.listFrom([_wallet, {'kind': 'martian', 'count': 2}, 'junk', _order]);
      expect(list, [const DeletionBlocker('wallet_balance', amountUsd: 204), const DeletionBlocker('open_order', count: 2)]);
      expect(DeletionBlocker.listFrom(null), isEmpty);
      expect(DeletionBlocker.fromRefusal(ApiException('Password is incorrect.')), isNull);
    });
  });
}
