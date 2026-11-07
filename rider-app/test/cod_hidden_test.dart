// Cash on delivery is not offered (public setting `codEnabled` is "false"): every COD surface in the rider app is hidden
// until an administrator switches it on, and follows the setting live. The one exception is an open task that still has
// cash due, because the server refuses to complete it without the amount.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/screens/work_screen.dart';
import 'package:somba_rider/services/cod_visibility.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'task_fixtures.dart';
import 'proof_helpers.dart';

const _cash = {
  'collectedUsd': 70,
  'handedOverUsd': 20,
  'heldUsd': 50,
  'openTasks': 2,
  'handovers': [
    {'id': 'h1', 'amountUsd': 20, 'heldBeforeUsd': 70, 'heldAfterUsd': 50, 'receivedByName': 'Marie Supervisor', 'note': null, 'createdAt': '2026-10-30T10:15:00.000Z'},
  ],
};

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  final calls = <String>[];
  final sent = <Map<String, dynamic>?>[];
  Map<String, dynamic> settings = {};

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
    calls.clear();
    sent.clear();
    settings = {'requireDeliveryCode': 'false', 'codEnabled': 'false'};
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
    store.loaded = true;
    store.requireDeliveryCode = false;
    store.codEnabled = false;
    store.myTasks.clear();
    store.cash = CashDto.fromJson(_cash);
    store.transport = (event, body) async {
      calls.add(event);
      sent.add(body);
      switch (event) {
        case 'rider:tasks':
        case 'notifications:list':
        case 'support:list':
          return [];
        case 'rider:workStats':
          return {'totalTasks': 3, 'completed': 1, 'active': 2, 'failed': 0, 'completedToday': 1, 'completedLast7Days': 1, 'successRate': 100, 'codCollectedUsd': 70, 'byKind': []};
        case 'cash:mine':
          return _cash;
        case 'settings:get':
          return settings;
        default:
          return {'ok': true};
      }
    };
  });

  tearDown(() {
    final store = RiderStore.instance;
    store.transport = null;
    store.user = null;
    store.myTasks.clear();
    store.cash = const CashDto();
    store.codEnabled = false;
    store.requireDeliveryCode = false;
    resetSupport();
  });

  group('the rules', () {
    test('the setting is read the way the API sends it', () {
      expect(parseCodEnabled('true'), isTrue);
      expect(parseCodEnabled(' True '), isTrue);
      expect(parseCodEnabled(true), isTrue);
      for (final off in ['false', '', null, 0, '0', 'yes']) {
        expect(parseCodEnabled(off), isFalse, reason: '$off');
      }
    });

    test('cash card, receipts and note follow the setting', () {
      expect(showCashSummary(true), isTrue);
      expect(showCashSummary(false), isFalse);
    });

    test('COD off: only an open task that still has cash due keeps its cash line and prompt', () {
      final open = leg('delivery', id: 'a', status: 'in_transit', cod: 25);
      final done = leg('delivery', id: 'b', status: 'delivered', cod: 25);
      final prepaid = leg('delivery', id: 'c', status: 'in_transit');
      expect(showTaskCash(false, open), isTrue);
      expect(showTaskCash(false, done), isFalse);
      expect(showTaskCash(false, prepaid), isFalse);
      expect(showTaskCash(true, open), isTrue);
      expect(showTaskCash(true, prepaid), isFalse);
    });

    test('"Already paid online" is a COD word: only while COD is on, only on an open prepaid delivery', () {
      final prepaid = leg('delivery', id: 'c', status: 'in_transit');
      expect(showPrepaidNote(false, prepaid), isFalse);
      expect(showPrepaidNote(true, prepaid), isTrue);
      expect(showPrepaidNote(true, leg('pickup', id: 'p')), isFalse);
      expect(showPrepaidNote(true, leg('delivery', id: 'd', status: 'delivered')), isFalse);
      expect(showPrepaidNote(true, leg('delivery', id: 'e', status: 'in_transit', cod: 5)), isFalse);
    });
  });

  group('the store follows the setting', () {
    test('a full refresh reads codEnabled; the default is off', () async {
      expect(RiderStore.instance.codEnabled, isFalse);
      await RiderStore.instance.refresh();
      expect(calls, contains('settings:get'));
      expect(RiderStore.instance.codEnabled, isFalse);
      settings = {'codEnabled': 'true'};
      await RiderStore.instance.refresh();
      expect(RiderStore.instance.codEnabled, isTrue);
    });

    test('settings:updated flips it live, in both directions, and leaves it alone when the push does not carry it', () {
      final store = RiderStore.instance;
      var notified = 0;
      store.addListener(() => notified++);
      store.applySettingsPush({'codEnabled': 'true'});
      expect(store.codEnabled, isTrue);
      store.applySettingsPush({'fxRate': '2800'});
      expect(store.codEnabled, isTrue, reason: 'not in this push');
      store.applySettingsPush({'codEnabled': 'false', 'requireDeliveryCode': 'true'});
      expect(store.codEnabled, isFalse);
      expect(store.requireDeliveryCode, isTrue);
      store.applySettingsPush('garbage');
      expect(notified, 3);
    });
  });

  group('on screen', () {
    Future<void> pumpScreen(WidgetTester t, Widget home, {String lang = 'en'}) async {
      await Strings.setLang(lang, persist: false);
      t.view.physicalSize = const Size(402 * 3, 1800 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(KeyedSubtree(
        key: UniqueKey(),
        child: MaterialApp(
          locale: Locale(lang),
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          theme: AppTheme.light(),
          home: Scaffold(body: home),
        ),
      ));
      await t.pump(const Duration(milliseconds: 600));
    }

    for (final lang in ['en', 'fr']) {
      testWidgets('My work: COD off shows no cash card, no receipts, no cash note ($lang)', (t) async {
        final s = Strings(lang);
        await pumpScreen(t, const WorkScreen(), lang: lang);
        expect(find.byKey(const ValueKey('cod-total')), findsNothing);
        expect(find.byKey(const ValueKey('cash-note')), findsNothing);
        expect(find.byKey(const ValueKey('cash-handovers')), findsNothing);
        expect(find.text(s.cashInHand), findsNothing);
        expect(find.text(s.cashNote), findsNothing);
        // the salary note and the counts stay
        expect(find.byKey(const ValueKey('work-salary-note')), findsOneWidget);
        expect(find.byKey(const ValueKey('work-completed')), findsOneWidget);
      });

      testWidgets('My work: COD on shows them ($lang)', (t) async {
        final s = Strings(lang);
        RiderStore.instance.codEnabled = true;
        await pumpScreen(t, const WorkScreen(), lang: lang);
        expect(find.byKey(const ValueKey('cod-total')), findsOneWidget);
        expect(find.byKey(const ValueKey('cash-handover-h1')), findsOneWidget);
        expect(find.text(s.cashNote), findsOneWidget);
      });
    }

    testWidgets('My work follows settings:updated without a reload', (t) async {
      await pumpScreen(t, const WorkScreen());
      expect(find.byKey(const ValueKey('cod-total')), findsNothing);
      RiderStore.instance.applySettingsPush({'codEnabled': 'true'});
      await t.pump();
      expect(find.byKey(const ValueKey('cod-total')), findsOneWidget);
      RiderStore.instance.applySettingsPush({'codEnabled': 'false'});
      await t.pump();
      expect(find.byKey(const ValueKey('cod-total')), findsNothing);
    });

    testWidgets('a prepaid delivery card: no "Already paid online" line while COD is off, the line while it is on', (t) async {
      RiderStore.instance.myTasks.add(leg('delivery', id: 'd', status: 'in_transit'));
      await pumpScreen(t, const DeliveriesScreen());
      expect(find.text(Strings('en').alreadyPaid), findsNothing);
      RiderStore.instance.applySettingsPush({'codEnabled': 'true'});
      await t.pump();
      expect(find.text(Strings('en').alreadyPaid), findsOneWidget);
    });

    testWidgets('a prepaid delivery with COD off: Delivered sends no cash and shows no cash prompt', (t) async {
      RiderStore.instance.myTasks.add(leg('delivery', id: 'd', status: 'in_transit'));
      await pumpScreen(t, const DeliveriesScreen());
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('cash-amount-field')), findsNothing);
      await continueWithoutProof(t);
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'd', 'status': 'delivered'});
    });

    testWidgets('an open task with cash still due keeps the cash line and prompt even with COD off (the server needs the amount)', (t) async {
      RiderStore.instance.myTasks.add(leg('delivery', id: 'd', status: 'in_transit', cod: 20));
      await pumpScreen(t, const DeliveriesScreen());
      expect(find.text(Strings('en').collectCash(Strings('en').usd(20))), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('cash-amount-field')), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('confirm-dialog')));
      await t.pumpAndSettle();
      await continueWithoutProof(t);
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'd', 'status': 'delivered', 'cashUsd': 20.0});
    });

    testWidgets('a finished task that was paid in cash shows no cash line with COD off', (t) async {
      RiderStore.instance.myTasks.add(leg('delivery', id: 'd', status: 'delivered', cod: 20));
      await pumpScreen(t, const DeliveriesScreen());
      await t.tap(find.byKey(const ValueKey('tab-1')));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('task-d')), findsOneWidget);
      expect(find.textContaining('in cash'), findsNothing);
    });
  });
}
