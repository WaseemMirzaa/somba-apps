// Bank-card checkout through Stripe: the card tile follows the public `cardPayments` setting; placing a card order
// asks the server for the card sheet of THAT order (`payments:card-sheet`) and opens it with the server's publishable
// key and client secret (nothing is compiled into the app); completed / canceled / failed all land on the payment
// pending screen with card wording (never "approve on your phone"), where "Pay by card" reopens the sheet; every
// outcome is announced in a snackbar in EN and FR; and no key or client secret reaches a log.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/order_success_screen.dart';
import 'package:lipcart/screens/payment_pending_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/card_payments.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/format.dart' show money;
import 'package:lipcart/widgets/kit.dart';

import 'button_rules.dart';
import 'gap_helpers.dart';

// Look like the real thing without being one: the test-mode prefixes only. Never a real key.
const _publishableKey = 'pk_' 'test_FAKE_publishable_key_for_tests';
const _clientSecret = 'pi_FAKE123_secret_FAKE456';

/// The Stripe sheet, faked: records what it was opened with and ends as [next] says (or waits on [gate]).
class _FakeSheet implements CardPayments {
  final opened = <({String publishableKey, String clientSecret, String merchantName})>[];
  CardSheetResult next = const CardSheetResult.completed();
  Completer<void>? gate;

  @override
  Future<CardSheetResult> present({required String publishableKey, required String clientSecret, required String merchantName}) async {
    opened.add((publishableKey: publishableKey, clientSecret: clientSecret, merchantName: merchantName));
    final g = gate;
    if (g != null) await g.future;
    return next;
  }
}

final _sent = <Map<String, dynamic>>[];
final _sheetAsks = <Map<String, dynamic>?>[];
Object? _sheetFailure;
late _FakeSheet _sheet;

Future<dynamic> _fakeOrders(String event, [Map<String, dynamic>? body]) async {
  _sent.add(body!);
  final order = {
    'id': 'o-${_sent.length}',
    'reference': 'SOM-${_sent.length}',
    'status': 'pending',
    'paymentMethod': body['paymentMethod'],
    'totalUsd': 23,
    'items': const [],
  };
  // The server creates the payment with the order and pushes it (`payment:created`).
  RealtimeStore.instance.payments.add(PaymentDto(
      id: 'pay-${_sent.length}',
      reference: 'PAY-${_sent.length}',
      orderId: order['id'] as String,
      orderReference: order['reference'] as String,
      method: body['paymentMethod'] as String,
      amountUsd: 23,
      status: 'pending'));
  return order;
}

Map<String, dynamic> _sheetAnswer(Map<String, dynamic>? body) {
  _sheetAsks.add(body);
  final failure = _sheetFailure;
  if (failure != null) throw failure;
  return {
    'reference': 'PAY-1',
    'clientSecret': _clientSecret,
    'publishableKey': _publishableKey,
    'amountUsd': 23,
    'currency': 'usd',
    'merchantName': 'KOMORIKO',
  };
}

OrderDto _cardOrder({String status = 'pending'}) => OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-2042',
      'customerName': 'Aline Mbuyi',
      'status': status,
      'paymentMethod': 'stripe_card',
      'subtotalUsd': 20,
      'deliveryFeeUsd': 3,
      'totalUsd': 23,
      'createdAt': '2026-10-01T09:30:00',
      'items': [
        {'productId': 'p1', 'productName': 'Phone case', 'qty': 1, 'priceUsd': 20},
      ],
    });

PaymentDto _cardPayment({String status = 'pending'}) =>
    PaymentDto(id: 'pay1', reference: 'PAY-1', orderId: 'o1', orderReference: 'SOM-2042', method: 'stripe_card', amountUsd: 23, status: status);

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });

  setUp(() async {
    await gapReset();
    _sent.clear();
    _sheetAsks.clear();
    _sheetFailure = null;
    _sheet = _FakeSheet();
    CardPayments.debugOverride = _sheet;
    final store = RealtimeStore.instance;
    store.walletBalance = 1000;
    store.requirePinnedAddress = false;
    store.cardPayments = 'stripe';
    store.payments.clear();
    store.debugCallRequest = gapCalls(extra: {'payments:card-sheet': _sheetAnswer});
    store.addresses.add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kinshasa', commune: 'Gombe', isDefault: true, geo: (lat: -4.31, lng: 15.31, placeId: null, formatted: null)));
    store.debugPlaceOrderRequest = _fakeOrders;
  });

  tearDown(() {
    CardPayments.debugOverride = null;
    RealtimeStore.instance
      ..cardPayments = 'off'
      ..payments.clear();
    gapTearDown();
  });

  Future<void> openCheckout(WidgetTester tester, {String lang = 'en'}) async {
    await Strings.setLang(lang, persist: false);
    ShopState.instance.addToCart(productByUuid('p1')!);
    tester.view.physicalSize = const Size(390 * 3, 1500 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
    await tester.pump(const Duration(milliseconds: 300));
  }

  Future<void> chooseCardAndPlace(WidgetTester tester) async {
    await tester.tap(find.byKey(const ValueKey('pay-stripe_card')));
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('place-order')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
  }

  Finder snack(String text) => find.descendant(of: find.byType(SnackBar), matching: find.text(text));

  group('the settings the app reads', () {
    test('cardPayments follows settings:get and settings:updated; only "stripe" turns it on; a missing key keeps the value', () {
      final store = RealtimeStore.instance;
      store.cardPayments = 'off';
      expect(store.cardPaymentsEnabled, isFalse, reason: 'off by default');
      store.applySettings({'fxRate': 2850});
      expect(store.cardPaymentsEnabled, isFalse);
      store.applySettings({'cardPayments': 'stripe'});
      expect(store.cardPaymentsEnabled, isTrue);
      store.applySettings({'fxRate': 2850});
      expect(store.cardPaymentsEnabled, isTrue, reason: 'a push without the key changes nothing');
      store.applySettings({'cardPayments': 'off'});
      expect(store.cardPaymentsEnabled, isFalse);
      store.applySettings({'cardPayments': 'stripe'});
      store.applySettings({'cardPayments': 'something-else'});
      expect(store.cardPaymentsEnabled, isFalse, reason: 'anything but "stripe" is off');
    });
  });

  group('the card tile', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('is offered while the server has card payments on, labelled in the shopper\'s language ($lang)', (tester) async {
        final s = Strings(lang);
        await openCheckout(tester, lang: lang);
        expect(find.byKey(const ValueKey('pay-stripe_card')), findsOneWidget);
        expect(find.text(s.payStripeCard), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('pay-stripe_card')), matching: find.byIcon(Icons.credit_card_rounded)), findsOneWidget);
        await tester.tap(find.byKey(const ValueKey('pay-stripe_card')));
        await tester.pump();
        expect(find.byKey(const ValueKey('mm-phone')), findsNothing, reason: 'no phone number for a card');
        expectButtonRules(tester);
      });
    }

    testWidgets('is hidden while cardPayments is off', (tester) async {
      RealtimeStore.instance.cardPayments = 'off';
      await openCheckout(tester);
      expect(find.byKey(const ValueKey('pay-stripe_card')), findsNothing);
      expect(find.byKey(const ValueKey('pay-wallet')), findsOneWidget);
    });

    testWidgets('appears and disappears with the live setting', (tester) async {
      RealtimeStore.instance.cardPayments = 'off';
      await openCheckout(tester);
      expect(find.byKey(const ValueKey('pay-stripe_card')), findsNothing);
      RealtimeStore.instance.applySettings({'cardPayments': 'stripe'});
      RealtimeStore.instance.notifyListeners();
      await tester.pump();
      expect(find.byKey(const ValueKey('pay-stripe_card')), findsOneWidget);
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('switched off while the shopper is on the screen: nothing is sent, the reason is shown and the method resets ($lang)', (tester) async {
        await openCheckout(tester, lang: lang);
        await tester.tap(find.byKey(const ValueKey('pay-stripe_card')));
        await tester.pump();
        RealtimeStore.instance.cardPayments = 'off';
        await tester.tap(find.byKey(const ValueKey('place-order')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));
        expect(_sent, isEmpty);
        expect(_sheet.opened, isEmpty);
        expect(snack(lang == 'fr' ? 'Les paiements par carte ne sont pas disponibles.' : 'Card payments are not available.'), findsOneWidget);
        expect(find.byKey(const ValueKey('pay-stripe_card')), findsNothing);
      });
    }
  });

  group('placing a card order', () {
    testWidgets('sends stripe_card without a phone, asks the card sheet for THIS order and opens it with the server\'s keys', (tester) async {
      await openCheckout(tester);
      await chooseCardAndPlace(tester);
      expect(_sent, hasLength(1));
      expect(_sent.single['paymentMethod'], 'stripe_card');
      expect(_sent.single.containsKey('paymentPhone'), isFalse);
      expect(_sheetAsks, [
        {'orderId': 'o-1'}
      ], reason: 'by order id; the client never sends an amount');
      expect(_sheet.opened, hasLength(1));
      expect(_sheet.opened.single.publishableKey, _publishableKey, reason: 'the key comes from the server answer');
      expect(_sheet.opened.single.clientSecret, _clientSecret);
      expect(_sheet.opened.single.merchantName, 'KOMORIKO');
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('completed: the payment pending screen with card wording waits for the server\'s word, and says so ($lang)', (tester) async {
        final s = Strings(lang);
        await openCheckout(tester, lang: lang);
        await chooseCardAndPlace(tester);
        expect(find.byType(PaymentPendingScreen), findsOneWidget);
        expect(find.text(s.ppCardConfirming), findsOneWidget);
        expect(find.text(s.ppApproveTitle), findsNothing, reason: 'nothing to approve on a phone');
        expect(find.textContaining('PIN'), findsNothing);
        expect(find.byKey(const ValueKey('pay-by-card')), findsOneWidget);
        expect(snack(s.cardPayDone), findsOneWidget);

        // The server confirms: payment:updated + order:updated push, and the screen moves on to the success screen.
        final store = RealtimeStore.instance;
        store.debugOrderPush({..._orderJson('o-1'), 'status': 'confirmed'});
        await tester.pump(); // rebuild, then the screen replaces itself
        await tester.pump(const Duration(milliseconds: 400));
        await tester.pump(const Duration(milliseconds: 400));
        expect(find.byType(OrderSuccessScreen), findsOneWidget);
      });

      testWidgets('canceled by the user: the pending screen offers "Pay by card" and cancelling the order ($lang)', (tester) async {
        final s = Strings(lang);
        _sheet.next = const CardSheetResult.canceled();
        await openCheckout(tester, lang: lang);
        await chooseCardAndPlace(tester);
        expect(find.byType(PaymentPendingScreen), findsOneWidget);
        expect(find.text(s.payByCard), findsOneWidget);
        expect(find.byKey(const ValueKey('cancel-order')), findsOneWidget);
        expect(snack(s.cardPayCanceled), findsOneWidget);
        expect(_sheet.opened, hasLength(1));
      });

      testWidgets('failed: the reason is announced in a snackbar and the pending screen is still reached to retry ($lang)', (tester) async {
        final s = Strings(lang);
        _sheet.next = const CardSheetResult.failed('Your card was declined.');
        await openCheckout(tester, lang: lang);
        await chooseCardAndPlace(tester);
        expect(snack('${s.cardPayFailed} Your card was declined.'), findsOneWidget);
        expect(find.byType(PaymentPendingScreen), findsOneWidget);
        expect(find.text(s.payByCard), findsOneWidget);
      });
    }

    for (final lang in ['en', 'fr']) {
      testWidgets('the server refusing the card sheet is said in the shopper\'s language and the order can still be retried ($lang)', (tester) async {
        _sheetFailure = ApiException('Card payments are not available.');
        await openCheckout(tester, lang: lang);
        await chooseCardAndPlace(tester);
        final reason = lang == 'fr' ? 'Les paiements par carte ne sont pas disponibles.' : 'Card payments are not available.';
        expect(snack('${Strings(lang).cardPayFailed} $reason'), findsOneWidget);
        expect(_sheet.opened, isEmpty, reason: 'no sheet without the server\'s keys');
        expect(find.byType(PaymentPendingScreen), findsOneWidget);
        expect(find.text(Strings(lang).payByCard), findsOneWidget);
      });
    }

    testWidgets('a mobile-money order does not touch the card sheet and keeps the approve-on-your-phone wording', (tester) async {
      await openCheckout(tester);
      await tester.enterText(find.byKey(const ValueKey('mm-phone')), '+243 81 234 5678');
      await tester.tap(find.byKey(const ValueKey('place-order')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
      expect(_sent.single['paymentMethod'], 'airtel_money');
      expect(_sheetAsks, isEmpty);
      expect(_sheet.opened, isEmpty);
      expect(find.text(Strings.current.ppApproveTitle), findsOneWidget);
      expect(find.byKey(const ValueKey('pay-by-card')), findsNothing);
    });
  });

  Future<void> openPending(WidgetTester tester, {String lang = 'en'}) async {
    await Strings.setLang(lang, persist: false);
    final store = RealtimeStore.instance;
    store.orders
      ..clear()
      ..add(_cardOrder());
    store.payments
      ..clear()
      ..add(_cardPayment());
    tester.view.physicalSize = const Size(390 * 3, 1500 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(gapApp(PaymentPendingScreen(locale: Locale(lang), orderId: 'o1'), lang: lang));
    await tester.pump(const Duration(milliseconds: 300));
  }

  group('the payment pending screen of a card order', () {
    tearDown(() => RealtimeStore.instance.orders.clear());

    for (final lang in ['en', 'fr']) {
      testWidgets('says the card payment is being confirmed, with one filled button and label-only buttons ($lang)', (tester) async {
        final s = Strings(lang);
        await openPending(tester, lang: lang);
        expect(find.text(s.ppCardConfirming), findsOneWidget);
        expect(find.text(s.ppCardBody(money(23))), findsOneWidget);
        expect(find.byKey(const ValueKey('expiry-hint')), findsOneWidget);
        expect(find.text(s.ppExpiryDefault), findsNothing, reason: 'the 15-minute phone-approval hint does not apply to a card');
        expect(find.text(s.ppApproveTitle), findsNothing);
        final pay = find.byKey(const ValueKey('pay-by-card'));
        expect(tester.widget(pay), isA<FilledButton>());
        expect(find.descendant(of: pay, matching: find.text(s.payByCard)), findsOneWidget);
        expectButtonRules(tester);
      });
    }

    testWidgets('"Pay by card" reopens the sheet for the same order: busy swaps the label for a spinner, then it announces the result', (tester) async {
      final s = Strings.current;
      _sheet.gate = Completer<void>();
      await openPending(tester);
      final pay = find.byKey(const ValueKey('pay-by-card'));
      await tester.tap(pay);
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(_sheetAsks, [
        {'orderId': 'o1'}
      ]);
      expect(_sheet.opened.single.clientSecret, _clientSecret);
      expect(find.descendant(of: pay, matching: find.byType(ButtonSpinner)), findsOneWidget, reason: 'busy = spinner');
      expect(find.descendant(of: pay, matching: find.text(s.payByCard)), findsNothing);
      expect(tester.widget<FilledButton>(pay).onPressed, isNull, reason: 'no second sheet while one is open');

      _sheet.gate!.complete();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.descendant(of: pay, matching: find.byType(ButtonSpinner)), findsNothing);
      expect(find.descendant(of: pay, matching: find.text(s.payByCard)), findsOneWidget);
      expect(snack(s.cardPayDone), findsOneWidget);
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('a failed reopen is announced and can be retried ($lang)', (tester) async {
        final s = Strings(lang);
        await openPending(tester, lang: lang);
        _sheet.next = const CardSheetResult.failed('Your card was declined.');
        await tester.tap(find.byKey(const ValueKey('pay-by-card')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(snack('${s.cardPayFailed} Your card was declined.'), findsOneWidget);
        _sheet.next = const CardSheetResult.completed();
        await tester.pump(const Duration(seconds: 5)); // the snackbar leaves
        await tester.pump(const Duration(seconds: 1));
        await tester.tap(find.byKey(const ValueKey('pay-by-card')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
        expect(_sheet.opened, hasLength(2));
        await tester.pump(const Duration(milliseconds: 500));
        expect(snack(s.cardPayDone), findsOneWidget);
      });
    }

    testWidgets('a sheet that was canceled again says so and leaves the screen as it was', (tester) async {
      await openPending(tester);
      _sheet.next = const CardSheetResult.canceled();
      await tester.tap(find.byKey(const ValueKey('pay-by-card')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      expect(snack(Strings.current.cardPayCanceled), findsOneWidget);
      expect(find.byKey(const ValueKey('pay-by-card')), findsOneWidget);
      expect(find.byKey(const ValueKey('cancel-order')), findsOneWidget);
    });

    testWidgets('the server settling the payment moves the screen on to the success screen', (tester) async {
      await openPending(tester);
      RealtimeStore.instance.debugOrderPush({..._orderJson('o1'), 'status': 'confirmed'});
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(OrderSuccessScreen), findsOneWidget);
    });

    testWidgets('a failed card payment (order cancelled) reads as failed, with no "Pay by card"', (tester) async {
      await openPending(tester);
      RealtimeStore.instance.debugOrderPush({..._orderJson('o1'), 'status': 'cancelled'});
      await tester.pump();
      expect(find.text(Strings.current.ppFailedTitle), findsOneWidget);
      expect(find.byKey(const ValueKey('pay-by-card')), findsNothing);
    });

    testWidgets('the Pay button of the pending order opens the same screen, card wording included', (tester) async {
      final store = RealtimeStore.instance;
      store.orders.add(_cardOrder());
      store.payments.add(_cardPayment());
      tester.view.physicalSize = const Size(390 * 3, 1500 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await tester.pumpWidget(gapApp(OrderDetailScreen(locale: const Locale('en'), orderId: 'o1')));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.text(Strings.current.orderPay));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.byType(PaymentPendingScreen), findsOneWidget);
      expect(find.text(Strings.current.ppCardConfirming), findsOneWidget);
      expect(find.byKey(const ValueKey('pay-by-card')), findsOneWidget);
    });
  });

  group('keys and secrets', () {
    test('the card sheet answer hides the secret and the key when printed', () {
      final dto = CardSheetDto.fromJson(_sheetAnswer(null));
      expect(dto.isUsable, isTrue);
      expect('$dto', isNot(contains(_clientSecret)));
      expect('$dto', isNot(contains(_publishableKey)));
      expect('$dto', isNot(contains('secret')));
    });

    test('an answer without the keys is not usable', () {
      expect(CardSheetDto.fromJson({'reference': 'PAY-1'}).isUsable, isFalse);
      expect(CardSheetDto.fromJson({'reference': 'PAY-1', 'clientSecret': 'x'}).isUsable, isFalse);
    });

    test('the sheet request is by order id or reference only; the app never sends an amount', () async {
      await RealtimeStore.instance.cardSheet(orderId: 'o9');
      await RealtimeStore.instance.cardSheet(reference: 'PAY-9');
      expect(_sheetAsks, [
        {'orderId': 'o9'},
        {'reference': 'PAY-9'},
      ]);
    });

    testWidgets('nothing printed during the whole card flow carries a key or a client secret', (tester) async {
      final lines = <String>[];
      final previous = debugPrint;
      debugPrint = (String? message, {int? wrapWidth}) => lines.add(message ?? '');
      final printed = <String>[];
      await runZoned(() async {
        _sheet.next = const CardSheetResult.failed('Your card was declined.');
        await openCheckout(tester);
        await chooseCardAndPlace(tester);
        _sheet.next = const CardSheetResult.completed();
        await tester.tap(find.byKey(const ValueKey('pay-by-card')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 100));
      }, zoneSpecification: ZoneSpecification(print: (self, parent, zone, line) => printed.add(line)));
      debugPrint = previous; // the test binding insists on it before the test ends
      expect(_sheet.opened, hasLength(2), reason: 'the flow ran to the end');
      for (final line in [...lines, ...printed]) {
        expect(line, isNot(contains(_clientSecret)));
        expect(line, isNot(contains(_publishableKey)));
        expect(line, isNot(contains('_secret_')));
        expect(line, isNot(matches(RegExp(r'\b(sk|pk|rk)_(test|live)_'))));
      }
      // ...and the store keeps neither: the sheet answer is not part of its state.
      expect('${RealtimeStore.instance.orders}${RealtimeStore.instance.payments.map((p) => p.reference)}', isNot(contains(_clientSecret)));
    });
  });
}

Map<String, dynamic> _orderJson(String id) => {
      'id': id,
      'reference': 'SOM-1',
      'status': 'pending',
      'paymentMethod': 'stripe_card',
      'totalUsd': 23,
      'items': const [],
      'updatedAt': '2099-01-01T00:00:00Z',
    };
