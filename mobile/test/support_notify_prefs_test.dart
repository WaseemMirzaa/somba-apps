// Notification categories in the settings: switches for what matters to a shopper, defaults on, the server merges the
// nested map (and so does the phone), a refused change is put back with a snackbar.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/settings_extra.dart';
import 'package:lipcart/services/notify_prefs.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'button_rules.dart';
import 'gap_helpers.dart';
import 'social_helpers.dart';

Future<void> open(WidgetTester tester, {String lang = 'en'}) async {
  gapTallViewport(tester);
  await Strings.setLang(lang, persist: false);
  await tester.pumpWidget(gapApp(const CustomerSettingsScreen(), lang: lang));
  await tester.pump(const Duration(milliseconds: 300));
}

bool isOn(WidgetTester tester, String kind) => tester.widget<SwitchListTile>(find.byKey(ValueKey('notify-$kind'))).value;

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  late FakeServer server;
  setUp(() async => server = await socialReset());
  tearDown(socialTearDown);

  test('NotifyPrefs: every kind is on by default and only the shopper kinds are offered', () {
    for (final k in NotifyPrefs.customerKinds) {
      expect(NotifyPrefs.instance.isOn(k), isTrue, reason: k);
    }
    expect(NotifyPrefs.customerKinds, containsAll(['order', 'message', 'question', 'review', 'promo', 'product']));
    expect(NotifyPrefs.customerKinds, isNot(contains('payout')));
    expect(NotifyPrefs.customerKinds, isNot(contains('stock')));
  });

  test('NotifyPrefs reads what the server sent; a missing kind is on', () {
    RealtimeStore.instance.prefs = {...RealtimeStore.instance.prefs, 'notify': {'order': false, 'promo': true}};
    expect(NotifyPrefs.instance.isOn('order'), isFalse);
    expect(NotifyPrefs.instance.isOn('promo'), isTrue);
    expect(NotifyPrefs.instance.isOn('review'), isTrue);
  });

  test('set sends only the changed kind and merges the nested map locally', () async {
    RealtimeStore.instance.prefs = {...RealtimeStore.instance.prefs, 'notify': {'order': false, 'review': true}};
    server.handlers['me:setPrefs'] = (b) => {'push': true, 'notify': {'order': false, 'review': true, 'promo': false}};
    await NotifyPrefs.instance.set('promo', false);
    expect(server.bodiesOf('me:setPrefs').single, {
      'notify': {'promo': false}
    });
    final n = RealtimeStore.instance.prefs['notify'] as Map;
    expect(n['order'], false, reason: 'the other kinds are kept');
    expect(n['promo'], false);
    expect(RealtimeStore.instance.prefs['push'], true, reason: 'the other preferences are kept');
  });

  test('set keeps the other kinds even when the server answers without the notify map', () async {
    RealtimeStore.instance.prefs = {...RealtimeStore.instance.prefs, 'notify': {'order': false}};
    server.handlers['me:setPrefs'] = (b) => {'push': true};
    await NotifyPrefs.instance.set('message', false);
    expect(RealtimeStore.instance.prefs['notify'], {'order': false, 'message': false});
  });

  test('a refused change is put back and the error is thrown', () async {
    RealtimeStore.instance.prefs = {...RealtimeStore.instance.prefs, 'notify': {'order': true}};
    server.handlers['me:setPrefs'] = (b) => throw serverError('Unknown notification kind: order.');
    await expectLater(NotifyPrefs.instance.set('order', false), throwsA(isA<Exception>()));
    expect(NotifyPrefs.instance.isOn('order'), isTrue);
    expect((RealtimeStore.instance.prefs['notify'] as Map)['order'], true);
  });

  group('settings screen', () {
    testWidgets('shows a switch per shopper category, all on by default, none for payouts or stock', (tester) async {
      await open(tester);
      expect(find.text('What you hear about'), findsOneWidget);
      for (final k in NotifyPrefs.customerKinds) {
        expect(find.byKey(ValueKey('notify-$k')), findsOneWidget, reason: k);
        expect(isOn(tester, k), isTrue, reason: k);
      }
      expect(find.byKey(const ValueKey('notify-payout')), findsNothing);
      expect(find.byKey(const ValueKey('notify-stock')), findsNothing);
      expect(find.text('Orders and delivery'), findsOneWidget);
      expect(find.text('Messages and support'), findsOneWidget);
      expect(find.textContaining('Switch a kind off'), findsOneWidget);
      // the existing switches are still there
      expect(find.text('Push notifications'), findsOneWidget);
      expect(find.text('SMS'), findsOneWidget);
    });

    testWidgets('switches follow what the server said at sign-in', (tester) async {
      RealtimeStore.instance.prefs = {...RealtimeStore.instance.prefs, 'notify': {'promo': false, 'order': true}};
      await open(tester);
      expect(isOn(tester, 'promo'), isFalse);
      expect(isOn(tester, 'order'), isTrue);
    });

    testWidgets('turning one off sends the merge payload and confirms with a snackbar', (tester) async {
      server.handlers['me:setPrefs'] = (b) => {'notify': {'order': true, 'message': true, 'question': true, 'review': true, 'product': true, 'promo': false, 'payout': true, 'stock': true}};
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('notify-promo')));
      await tester.pump();
      expect(isOn(tester, 'promo'), isFalse, reason: 'shown at once');
      await tester.pump(const Duration(milliseconds: 200));
      expect(server.bodiesOf('me:setPrefs').single, {
        'notify': {'promo': false}
      });
      expect(find.text('Notification settings saved.'), findsOneWidget);
      expect(isOn(tester, 'promo'), isFalse);
      expect(isOn(tester, 'order'), isTrue);
    });

    testWidgets('a second change merges with the first', (tester) async {
      server.handlers['me:setPrefs'] = (b) => {'push': true};
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('notify-promo')));
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(find.byKey(const ValueKey('notify-review')));
      await tester.pump(const Duration(milliseconds: 200));
      expect(server.bodiesOf('me:setPrefs').last, {
        'notify': {'review': false}
      });
      expect(isOn(tester, 'promo'), isFalse);
      expect(isOn(tester, 'review'), isFalse);
      expect(isOn(tester, 'order'), isTrue);
    });

    testWidgets('a refused change flips back and says why, in French', (tester) async {
      final gate = Completer<dynamic>();
      server.handlers['me:setPrefs'] = (b) => gate.future;
      await open(tester, lang: 'fr');
      expect(find.text('Ce dont vous êtes informé'), findsOneWidget);
      expect(find.text('Commandes et livraison'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('notify-order')));
      await tester.pump();
      expect(isOn(tester, 'order'), isFalse);
      gate.completeError(serverError('You are sending messages too fast. Wait a moment.'));
      await tester.pump(const Duration(milliseconds: 200));
      expect(isOn(tester, 'order'), isTrue, reason: 'put back');
      expect(find.text('Vous envoyez des messages trop vite. Patientez un instant.'), findsOneWidget);
    });

    testWidgets('while the request is pending the switch already shows the new state', (tester) async {
      final gate = Completer<dynamic>();
      server.handlers['me:setPrefs'] = (b) => gate.future;
      await open(tester);
      await tester.tap(find.byKey(const ValueKey('notify-message')));
      await tester.pump();
      expect(isOn(tester, 'message'), isFalse);
      gate.complete({'notify': {'message': false}});
      await tester.pump(const Duration(milliseconds: 200));
      expect(isOn(tester, 'message'), isFalse);
    });

    testWidgets('settings obey the button rules', (tester) async {
      await open(tester);
      expectButtonRules(tester);
    });
  });
}
