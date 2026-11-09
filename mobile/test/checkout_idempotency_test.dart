// C-01: one "Place order" = one order. The checkout sends one idempotency key per attempt and the same key on every
// retry of it, waits longer than the default 8 s, asks the server what became of the attempt after a timeout before
// saying anything, and a second tap while the first is running sends nothing.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'gap_helpers.dart';

/// Every request the checkout sent (`orders:create` and `orders:byRequest`), in order.
final _sent = <(String, Map<String, dynamic>)>[];

/// What the fake server does with the next `orders:create` (null = a confirmed wallet order).
Future<dynamic> Function(Map<String, dynamic> body)? _onCreate;

/// The fake server's answer to `orders:byRequest`.
Map<String, dynamic> Function(Map<String, dynamic> body) _onLookup = (_) => {'state': 'none'};

Map<String, dynamic> _order(String id) =>
    {'id': id, 'reference': 'SOM-$id', 'status': 'confirmed', 'paymentMethod': 'wallet', 'totalUsd': 23, 'items': const []};

Future<dynamic> _fakeServer(String event, [Map<String, dynamic>? body]) async {
  _sent.add((event, body!));
  if (event == 'orders:byRequest') return _onLookup(body);
  final handler = _onCreate;
  _onCreate = null;
  if (handler != null) return handler(body);
  return _order('o-${_sent.length}');
}

List<String?> get _createKeys => [for (final (e, b) in _sent) if (e == 'orders:create') b['clientRequestId'] as String?];

void main() {
  setUpAll(() => initializeDateFormatting());

  setUp(() async {
    await gapReset();
    _sent.clear();
    _onCreate = null;
    _onLookup = (_) => {'state': 'none'};
    final store = RealtimeStore.instance;
    store.walletBalance = 1000;
    store.requirePinnedAddress = false;
    store.checkoutAttemptKey = null;
    store.addresses.add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kinshasa', commune: 'Gombe', isDefault: true, geo: (lat: -4.31, lng: 15.31, placeId: null, formatted: null)));
    store.debugPlaceOrderRequest = _fakeServer;
  });

  tearDown(() {
    RealtimeStore.instance.checkoutAttemptKey = null;
    gapTearDown();
  });

  Future<void> openCheckout(WidgetTester tester, {String lang = 'en'}) async {
    await Strings.setLang(lang, persist: false);
    ShopState.instance.addToCart(productByUuid('p1')!);
    gapTallViewport(tester);
    await tester.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
    await tester.pump(const Duration(milliseconds: 300));
    await tester.tap(find.byKey(const ValueKey('pay-wallet')));
    await tester.pump();
  }

  Future<void> placeOrder(WidgetTester tester) async {
    await tester.tap(find.byKey(const ValueKey('place-order')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
  }

  Finder snack(String text) => find.descendant(of: find.byType(SnackBar), matching: find.text(text));

  test('the key is a v4 UUID, and a new one each attempt', () {
    final a = RealtimeStore.newCheckoutKey();
    expect(a, matches(RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    expect(RealtimeStore.newCheckoutKey(), isNot(a));
  });

  test('placing an order waits much longer than the default 8 s (the server may wait on the payment provider)', () {
    expect(RealtimeStore.placeOrderTimeout, greaterThanOrEqualTo(const Duration(seconds: 30)));
  });

  for (final lang in ['en', 'fr']) {
    testWidgets('no answer, and the server never got it: says so plainly, and the retry reuses the SAME key ($lang)', (tester) async {
      final s = Strings(lang);
      await openCheckout(tester, lang: lang);
      _onCreate = (_) async => throw ApiException.local('err_no_response');
      await placeOrder(tester);

      expect(_sent.map((r) => r.$1), ['orders:create', 'orders:byRequest'], reason: 'it asks what happened before saying anything');
      final key = _createKeys.single;
      expect(key, isNotNull);
      expect(_sent.last.$2['clientRequestId'], key);
      expect(snack(s.errOrderNotSent), findsOneWidget);
      expect(find.text(s.errNoResponse), findsNothing, reason: 'never the misleading "no response"');

      await placeOrder(tester);
      expect(_createKeys, [key, key], reason: 'a retry of the same attempt carries the same key');
      expect(RealtimeStore.instance.checkoutAttemptKey, isNull, reason: 'placed: the next order is a new attempt');
    });
  }

  testWidgets('no answer, but the order WAS placed: the shopper gets the order, no error, nothing sent twice', (tester) async {
    await openCheckout(tester);
    _onCreate = (_) async => throw ApiException.local('err_no_response');
    _onLookup = (_) => {'state': 'placed', 'order': _order('o-placed')};
    await placeOrder(tester);
    await tester.pump(const Duration(milliseconds: 600));
    expect(_createKeys, hasLength(1));
    expect(find.byType(SnackBar), findsNothing);
    expect(find.byType(CheckoutScreen), findsNothing, reason: 'it moved on to the order');
    expect(ShopState.instance.cart, isEmpty);
  });

  testWidgets('no answer and still processing: says the result is not known yet, keeps the key', (tester) async {
    await openCheckout(tester);
    _onCreate = (_) async => throw ApiException.local('err_no_response');
    _onLookup = (_) => {'state': 'processing'};
    await placeOrder(tester);
    expect(snack(const Strings('en').errOrderProcessing), findsOneWidget);
    expect(ShopState.instance.cart, isNotEmpty, reason: 'nothing is assumed');
    final key = _createKeys.single;
    expect(RealtimeStore.instance.checkoutAttemptKey, key);
    await placeOrder(tester);
    expect(_createKeys, [key, key]);
  });

  testWidgets('the server says the same attempt is still running: keeps the key (the outcome is open)', (tester) async {
    await openCheckout(tester);
    const msg = 'Your order is still being processed. Check My orders in a moment before trying again.';
    _onCreate = (_) async => throw ApiException.refusal(msg, code: 'order_processing');
    await placeOrder(tester);
    expect(snack(msg), findsOneWidget);
    final key = _createKeys.single;
    await placeOrder(tester);
    expect(_createKeys, [key, key]);
  });

  testWidgets('the lookup itself fails: says the result is unknown, keeps the key', (tester) async {
    await openCheckout(tester);
    _onCreate = (_) async => throw ApiException.local('err_no_response');
    _onLookup = (_) => throw ApiException.local('err_no_response');
    await placeOrder(tester);
    expect(snack(const Strings('en').errOrderUnknown), findsOneWidget);
    expect(RealtimeStore.instance.checkoutAttemptKey, _createKeys.single);
  });

  testWidgets('a definite refusal from the server ends the attempt: the next tap is a NEW key', (tester) async {
    await openCheckout(tester);
    _onCreate = (_) async => throw ApiException.refusal('This code is no longer available.');
    await placeOrder(tester);
    expect(snack(translateServerError('This code is no longer available.', const Strings('en'))), findsOneWidget);
    await placeOrder(tester);
    final keys = _createKeys;
    expect(keys, hasLength(2));
    expect(keys[0], isNot(keys[1]));
  });

  testWidgets('a double tap sends ONE order while the first is still running', (tester) async {
    await openCheckout(tester);
    final answer = Completer<dynamic>();
    _onCreate = (_) => answer.future;
    final button = find.byKey(const ValueKey('place-order'));
    await tester.tap(button);
    await tester.tap(button); // same frame: the button has not been rebuilt as busy yet
    await tester.pump();
    await tester.tap(button, warnIfMissed: false); // and once more while it shows the spinner
    await tester.pump(const Duration(milliseconds: 100));
    expect(_createKeys, hasLength(1));
    answer.complete(_order('o-1'));
    await tester.pump(const Duration(milliseconds: 600));
    expect(_createKeys, hasLength(1));
  });

  test('the French for the server sentences of this flow exists', () {
    const fr = Strings('fr');
    for (final m in [
      'Invalid checkout reference. Please try again.',
      'Your order is still being processed. Check My orders in a moment before trying again.',
      'This checkout did not go through and nothing was charged. Please place the order again.',
    ]) {
      expect(translateServerError(m, fr), isNot(m), reason: m);
    }
    for (final k in ['err_order_processing', 'err_order_unknown', 'err_order_not_sent', 'err_order_failed']) {
      expect(fr.t(k), isNot(const Strings('en').t(k)), reason: k);
    }
  });
}
