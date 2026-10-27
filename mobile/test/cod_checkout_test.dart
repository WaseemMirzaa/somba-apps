// Cash on delivery in the checkout: the tile follows the public `codEnabled` setting (the same rule as the web
// shop), the order goes out as `cod`, a COD order the server keeps `pending` lands on the success screen (nothing to
// approve on a phone) and reads as confirmed, and a refusal of the server reaches the shopper in their language.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/order_success_screen.dart';
import 'package:lipcart/screens/payment_pending_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/models.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/orders_screen.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'gap_helpers.dart';

final _sent = <Map<String, dynamic>>[];
Object? _nextFailure;
String _status = 'pending';

Future<dynamic> _fakeServer(String event, [Map<String, dynamic>? body]) async {
  _sent.add(body!);
  final failure = _nextFailure;
  _nextFailure = null;
  if (failure != null) throw failure;
  return {
    'id': 'o-${_sent.length}',
    'reference': 'SOM-${_sent.length}',
    'status': _status,
    'paymentMethod': body['paymentMethod'],
    'totalUsd': 23,
    'items': const [],
  };
}

OrderDto _codOrder({String status = 'pending', String method = 'cod'}) => OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-2042',
      'customerName': 'Aline Mbuyi',
      'status': status,
      'paymentMethod': method,
      'subtotalUsd': 20,
      'deliveryFeeUsd': 3,
      'totalUsd': 23,
      'createdAt': '2026-10-01T09:30:00',
      'items': [
        {'productId': 'p1', 'productName': 'Phone case', 'qty': 1, 'priceUsd': 20},
      ],
    });

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });

  setUp(() async {
    await gapReset();
    _sent.clear();
    _nextFailure = null;
    _status = 'pending';
    final store = RealtimeStore.instance;
    store.walletBalance = 1000;
    store.requirePinnedAddress = false;
    store.codEnabled = true;
    store.debugCallRequest = gapCalls();
    store.addresses.add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kinshasa', commune: 'Gombe', isDefault: true, geo: (lat: -4.31, lng: 15.31, placeId: null, formatted: null)));
    store.debugPlaceOrderRequest = _fakeServer;
  });

  tearDown(() {
    RealtimeStore.instance.codEnabled = false;
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

  Future<void> placeOrder(WidgetTester tester) async {
    await tester.tap(find.byKey(const ValueKey('place-order')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));
  }

  group('the settings the app reads', () {
    test('codEnabled follows settings:get and settings:updated; a key the server did not send keeps its value', () {
      final store = RealtimeStore.instance;
      store.codEnabled = false;
      store.applySettings({'fxRate': 2850, 'codEnabled': 'true', 'codCapUsd': '500'});
      expect(store.codEnabled, isTrue);
      store.applySettings({'fxRate': 2850});
      expect(store.codEnabled, isTrue, reason: 'a push without the key changes nothing');
      store.applySettings({'codEnabled': 'false'});
      expect(store.codEnabled, isFalse);
      store.applySettings({'codEnabled': true});
      expect(store.codEnabled, isTrue, reason: 'a real boolean works too');
    });
  });

  group('the cash-on-delivery tile', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('is offered, in the shopper\'s language, while the platform allows it ($lang)', (tester) async {
        final s = Strings(lang);
        await openCheckout(tester, lang: lang);
        expect(find.byKey(const ValueKey('pay-cod')), findsOneWidget);
        expect(find.text(s.payCod), findsOneWidget);
        expect(find.byKey(const ValueKey('cod-note')), findsNothing, reason: 'the note shows once the method is chosen');
        await tester.tap(find.byKey(const ValueKey('pay-cod')));
        await tester.pump();
        expect(find.text(s.payCodNote), findsOneWidget);
        expect(find.byKey(const ValueKey('mm-phone')), findsNothing, reason: 'no phone number for cash');
      });
    }

    testWidgets('is not offered while cash on delivery is off', (tester) async {
      RealtimeStore.instance.codEnabled = false;
      await openCheckout(tester);
      expect(find.byKey(const ValueKey('pay-cod')), findsNothing);
      expect(find.byKey(const ValueKey('pay-wallet')), findsOneWidget);
    });

    testWidgets('appears and disappears with the live setting', (tester) async {
      RealtimeStore.instance.codEnabled = false;
      await openCheckout(tester);
      expect(find.byKey(const ValueKey('pay-cod')), findsNothing);
      RealtimeStore.instance.applySettings({'codEnabled': 'true'});
      RealtimeStore.instance.notifyListeners();
      await tester.pump();
      expect(find.byKey(const ValueKey('pay-cod')), findsOneWidget);
    });
  });

  group('placing a cash-on-delivery order', () {
    testWidgets('sends cod without a phone and lands on the success screen although the order is still pending', (tester) async {
      await openCheckout(tester);
      await tester.tap(find.byKey(const ValueKey('pay-cod')));
      await tester.pump();
      await tester.drag(find.byType(ListView), const Offset(0, -2000));
      await tester.pump(const Duration(milliseconds: 300));
      await placeOrder(tester);
      expect(_sent, hasLength(1));
      expect(_sent.single['paymentMethod'], 'cod');
      expect(_sent.single.containsKey('paymentPhone'), isFalse);
      expect(find.byType(OrderSuccessScreen), findsOneWidget);
      expect(find.byType(PaymentPendingScreen), findsNothing, reason: 'there is nothing to approve on a phone');
    });

    testWidgets('the server refusing cash on delivery says so in French and keeps the checkout', (tester) async {
      await openCheckout(tester, lang: 'fr');
      await tester.tap(find.byKey(const ValueKey('pay-cod')));
      await tester.pump();
      _nextFailure = ApiException('Cash on delivery is not available.');
      await tester.drag(find.byType(ListView), const Offset(0, -2000));
      await tester.pump(const Duration(milliseconds: 300));
      await placeOrder(tester);
      expect(_sent, hasLength(1));
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text('Le paiement à la livraison n’est pas disponible.')), findsOneWidget);
      expect(find.byType(CheckoutScreen), findsOneWidget);
      expect(find.byType(OrderSuccessScreen), findsNothing);
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('switched off while the shopper is on the screen: nothing is sent, the reason is shown and the method resets ($lang)', (tester) async {
        await openCheckout(tester, lang: lang);
        await tester.tap(find.byKey(const ValueKey('pay-cod')));
        await tester.pump();
        RealtimeStore.instance.codEnabled = false;
        await tester.drag(find.byType(ListView), const Offset(0, -2000));
        await tester.pump(const Duration(milliseconds: 300));
        await placeOrder(tester);
        expect(_sent, isEmpty);
        final msg = lang == 'fr' ? 'Le paiement à la livraison n’est pas disponible.' : 'Cash on delivery is not available.';
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(msg)), findsOneWidget);
        expect(find.byKey(const ValueKey('pay-cod')), findsNothing);
      });
    }
  });

  group('a cash-on-delivery order that is still pending', () {
    test('reads as confirmed and never waits for an online payment', () {
      final cod = _codOrder();
      expect(cod.isCod, isTrue);
      expect(cod.awaitsOnlinePayment, isFalse);
      expect(cod.shownStatus, 'confirmed');
      final momo = _codOrder(method: 'airtel_money');
      expect(momo.awaitsOnlinePayment, isTrue);
      expect(momo.shownStatus, 'pending');
      expect(_codOrder(status: 'delivered').shownStatus, 'delivered');
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('the order page says Confirmed and Pay on delivery, with no Pay button ($lang)', (tester) async {
        await Strings.setLang(lang, persist: false);
        final s = Strings(lang);
        final store = RealtimeStore.instance;
        store.orders.add(_codOrder());
        store.payments.add(PaymentDto(id: 'pay1', reference: 'PAY-1', orderId: 'o1', orderReference: 'SOM-2042', method: 'cod', amountUsd: 23, status: 'pending'));
        tester.view.physicalSize = const Size(390 * 3, 1500 * 3);
        tester.view.devicePixelRatio = 3;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(gapApp(OrderDetailScreen(locale: Locale(lang), orderId: 'o1'), lang: lang));
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.text(s.orderStatus('confirmed')), findsOneWidget);
        expect(find.text('${s.orderPayOnDelivery} · ${s.payCod}'), findsOneWidget);
        expect(find.text(s.orderPay), findsNothing);
        expect(find.text(s.orderTrack), findsOneWidget, reason: 'the parcel is already being prepared');
        store.payments.clear();
      });

      testWidgets('the orders list shows it as confirmed ($lang)', (tester) async {
        await Strings.setLang(lang, persist: false);
        final s = Strings(lang);
        RealtimeStore.instance.orders.add(_codOrder());
        await tester.pumpWidget(gapApp(OrdersScreen(locale: Locale(lang)), lang: lang));
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.text(s.orderStatus('confirmed')), findsWidgets);
        expect(find.text(s.orderStatus('pending')), findsNothing);
      });
    }
  });
}
