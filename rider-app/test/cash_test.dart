// Cash on delivery in the rider app: the rider confirms the cash they took (the server records it and refuses any other
// amount than the one due), sees the cash they still hold, and the receipts the warehouse recorded when they handed it in.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/messages.dart';
import 'package:somba_rider/l10n/server_errors.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/deliveries_screen.dart';
import 'package:somba_rider/screens/earnings_screen.dart';
import 'package:somba_rider/services/auth_service.dart' show ApiException;
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'task_fixtures.dart';

const _cashAnswer = {
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
  Object? updateError;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
    calls.clear();
    sent.clear();
    updateError = null;
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean', role: 'rider', phone: '+243810000000');
    store.loaded = true;
    store.requireDeliveryCode = false;
    store.myTasks.clear();
    store.cash = const CashDto();
    store.transport = (event, body) async {
      calls.add(event);
      sent.add(body);
      switch (event) {
        case 'delivery:updateStatus':
          if (updateError != null) throw updateError!;
          return {'ok': true};
        case 'rider:tasks':
          return [];
        case 'rider:earnings':
          return {'totalTasks': 3, 'delivered': 1, 'active': 2, 'codCollectedUsd': 70, 'earningsUsd': 2};
        case 'cash:mine':
          return _cashAnswer;
        case 'notifications:list':
        case 'support:list':
          return [];
        case 'settings:get':
          return {};
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
    store.requireDeliveryCode = false;
    resetSupport();
  });

  group('CashDto', () {
    test('reads what the rider holds and the receipts', () {
      final c = CashDto.fromJson(_cashAnswer);
      expect((c.collectedUsd, c.handedOverUsd, c.heldUsd, c.openTasks), (70.0, 20.0, 50.0, 2));
      expect(c.handovers.single.receivedByName, 'Marie Supervisor');
      expect(c.handovers.single.heldAfterUsd, 50);
      expect(c.handovers.single.at, isNotNull);
    });

    test('an older server that sends nothing parses to zero', () {
      final c = CashDto.fromJson({});
      expect(c.heldUsd, 0);
      expect(c.handovers, isEmpty);
    });

    test('a refresh reads the cash in hand', () async {
      await RiderStore.instance.refresh();
      expect(calls, contains('cash:mine'));
      expect(RiderStore.instance.cash.heldUsd, 50);
    });

    test('a server without the cash call keeps the last value and still loads', () async {
      RiderStore.instance.cash = CashDto.fromJson(_cashAnswer);
      final inner = RiderStore.instance.transport!;
      RiderStore.instance.transport = (event, body) async => event == 'cash:mine' ? throw ApiException('Unknown event') : inner(event, body);
      await RiderStore.instance.refresh();
      expect(RiderStore.instance.cash.heldUsd, 50);
    });
  });

  group('confirming the cash at the door', () {
    Future<void> show(WidgetTester t, String lang, List<DeliveryTaskDto> tasks) async {
      await Strings.setLang(lang, persist: false);
      RiderStore.instance.myTasks
        ..clear()
        ..addAll(tasks);
      t.view.physicalSize = const Size(360 * 3, 1600 * 3);
      t.view.devicePixelRatio = 3;
      addTearDown(t.view.reset);
      await t.pumpWidget(KeyedSubtree(
        key: UniqueKey(),
        child: MaterialApp(
          locale: Locale(lang),
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          theme: AppTheme.light(),
          home: const Scaffold(body: DeliveriesScreen()),
        ),
      ));
      await t.pump(const Duration(milliseconds: 600));
    }

    Future<void> open(WidgetTester t, {double cod = 20}) async {
      await show(t, 'en', [leg('delivery', id: 'd', status: 'in_transit', cod: cod)]);
      await t.tap(find.byKey(const ValueKey('next-d')));
      await t.pumpAndSettle();
    }

    testWidgets('the dialog starts at the amount due; confirming sends exactly that cash with the delivery', (t) async {
      await open(t);
      expect(find.text(Strings('en').cashTitle), findsOneWidget);
      expect(find.text(Strings('en').cashBody(Strings('en').usd(20), 'Aline Kabila Mwamba')), findsOneWidget);
      expect(tester(t).controller.text, '20.00');
      await t.tap(find.byKey(const ValueKey('confirm-dialog')));
      await t.pumpAndSettle();
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'd', 'status': 'delivered', 'cashUsd': 20.0});
      expect(find.text(Strings('en').doneDelivered), findsOneWidget);
    });

    testWidgets('the amount the rider types is what is sent (a comma works), so the server can refuse a difference', (t) async {
      await open(t);
      await t.enterText(find.byKey(const ValueKey('cash-amount-field')), '18,50');
      await t.tap(find.byKey(const ValueKey('confirm-dialog')));
      await t.pumpAndSettle();
      expect(sent[calls.indexOf('delivery:updateStatus')]!['cashUsd'], 18.5);
    });

    testWidgets("the server's refusal of another amount is shown to the rider", (t) async {
      updateError = ApiException('The cash you entered (\$18.50) is not the amount to collect (\$20.00). Collect exactly \$20.00, or ask the warehouse if the amount changed.');
      await open(t);
      await t.enterText(find.byKey(const ValueKey('cash-amount-field')), '18.50');
      await t.tap(find.byKey(const ValueKey('confirm-dialog')));
      await t.pumpAndSettle();
      expect(find.textContaining('is not the amount to collect (\$20.00)'), findsOneWidget);
    });

    testWidgets('an unreadable amount is refused in the dialog and nothing is sent', (t) async {
      await open(t);
      for (final bad in ['', '0', '12.345', '.']) {
        await t.enterText(find.byKey(const ValueKey('cash-amount-field')), bad);
        await t.tap(find.byKey(const ValueKey('confirm-dialog')));
        await t.pumpAndSettle();
        expect(find.text(Strings('en').cashAmountErr), findsOneWidget, reason: 'for "$bad"');
      }
      expect(calls, isNot(contains('delivery:updateStatus')));
    });

    testWidgets('"Not yet" sends nothing', (t) async {
      await open(t);
      await t.tap(find.text(Strings('en').notYet));
      await t.pumpAndSettle();
      expect(calls, isNot(contains('delivery:updateStatus')));
    });

    testWidgets('with the delivery code required the cash rides along with the code', (t) async {
      RiderStore.instance.requireDeliveryCode = true;
      await open(t);
      await t.tap(find.byKey(const ValueKey('confirm-dialog')));
      await t.pumpAndSettle();
      await t.enterText(find.byKey(const ValueKey('delivery-code-field')), '4321');
      await t.tap(find.byKey(const ValueKey('delivery-code-submit')));
      await t.pumpAndSettle();
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'd', 'status': 'delivered', 'code': '4321', 'cashUsd': 20.0});
    });

    testWidgets('a delivery that is already paid asks for no cash and sends none', (t) async {
      await open(t, cod: 0);
      expect(find.byKey(const ValueKey('cash-amount-field')), findsNothing);
      expect(sent[calls.indexOf('delivery:updateStatus')], {'taskId': 'd', 'status': 'delivered'});
    });
  });

  group('the cash in hand on the earnings screen', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('shows what the rider holds, what was collected and handed in, and each receipt ($lang)', (t) async {
        await Strings.setLang(lang, persist: false);
        final s = Strings(lang);
        RiderStore.instance.cash = CashDto.fromJson(_cashAnswer);
        t.view.physicalSize = const Size(402 * 3, 1200 * 3);
        t.view.devicePixelRatio = 3;
        addTearDown(t.view.reset);
        await t.pumpWidget(MaterialApp(
          locale: Locale(lang),
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          theme: AppTheme.light(),
          home: const Scaffold(body: EarningsScreen()),
        ));
        await t.pump(const Duration(milliseconds: 400));
        expect(find.text(s.usd(50)), findsOneWidget);
        expect(find.text(s.cashInHand), findsOneWidget);
        expect(find.text(s.cashInHandSub(s.usd(70), s.usd(20))), findsOneWidget);
        expect(find.byKey(const ValueKey('cash-handover-h1')), findsOneWidget);
        expect(find.text(s.cashHandoverLine(s.usd(20), 'Marie Supervisor')), findsOneWidget);
        expect(find.textContaining(s.cashHandoverLeft(s.usd(50))), findsOneWidget);
      });
    }

    testWidgets('no receipts yet: no receipts card', (t) async {
      await Strings.setLang('en', persist: false);
      await t.pumpWidget(MaterialApp(theme: AppTheme.light(), home: const Scaffold(body: EarningsScreen())));
      await t.pump(const Duration(milliseconds: 400));
      expect(find.byKey(const ValueKey('cash-handovers')), findsNothing);
      expect(find.text(Strings('en').usd(0)), findsWidgets);
    });
  });

  group('French', () {
    final fr = const Strings('fr');
    test('the server messages about the cash are translated, with French amounts', () {
      expect(translateServerError('Confirm the cash you collected: \$40.00 is due on this delivery.', fr), 'Confirmez les espèces encaissées : 40,00 \$ sont dus pour cette livraison.');
      final mismatch = translateServerError('The cash you entered (\$35.00) is not the amount to collect (\$40.00). Collect exactly \$40.00, or ask the warehouse if the amount changed.', fr);
      expect(mismatch, startsWith('Les espèces saisies (35,00 \$) ne correspondent pas au montant à encaisser (40,00 \$)'));
      expect(translateServerError('This delivery is already complete with \$40.00 collected.', fr), contains('déjà terminée'));
      expect(translateServerError('No cash is due on this delivery: it is already paid.', fr), contains('déjà payée'));
      expect(translateServerError('Enter the cash you collected as an amount in dollars.', fr), contains('montant en dollars'));
    });

    test('every new text exists in English and French with the same placeholders', () {
      for (final k in ['cash_amount_label', 'cash_amount_err', 'cash_in_hand', 'cash_in_hand_sub', 'cash_handovers', 'cash_handover_line', 'cash_handover_left', 'cash_note']) {
        final m = kMessages[k];
        expect(m, isNotNull, reason: k);
        expect(m!.$1.trim(), isNotEmpty);
        expect(m.$2.trim(), isNotEmpty);
        expect(m.$1, isNot(m.$2), reason: '$k is translated');
        expect(RegExp(r'\{(\w+)\}').allMatches(m.$1).map((x) => x.group(1)).toSet(), RegExp(r'\{(\w+)\}').allMatches(m.$2).map((x) => x.group(1)).toSet(), reason: k);
      }
    });
  });
}

/// The text field of the cash dialog.
({TextEditingController controller}) tester(WidgetTester t) => (controller: t.widget<TextField>(find.byKey(const ValueKey('cash-amount-field'))).controller!);
