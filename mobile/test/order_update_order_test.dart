// A new order must not go back to "pending" after its payment settled: with the sandbox provider the
// server pushes `order:updated` (confirmed) BEFORE the `orders:create` reply (pending) reaches the phone,
// and the late reply used to overwrite the newer copy. Copies are ordered by the server's `updatedAt`.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/screens/order_success_screen.dart';
import 'package:lipcart/screens/payment_pending_screen.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'gap_helpers.dart';

Map<String, dynamic> _order(String status, {String? updatedAt, String id = 'o1', double total = 25}) => {
      'id': id,
      'reference': 'SOM-1',
      'customerName': 'Aline',
      'status': status,
      'paymentMethod': 'airtel_money',
      'totalUsd': total,
      'createdAt': '2026-10-24T09:00:00.000Z',
      if (updatedAt != null) 'updatedAt': updatedAt,
      'items': const [],
    };

const _t0 = '2026-10-24T09:00:00.000Z';
const _t1 = '2026-10-24T09:00:02.500Z';
const _t2 = '2026-10-24T09:00:05.000Z';

Future<dynamic> _place(RealtimeStore store) => store.placeOrder(
      items: const [
        {'productId': 'p1', 'qty': 1}
      ],
      paymentMethod: 'airtel_money',
      paymentPhone: '0991234567',
    );

void main() {
  final store = RealtimeStore.instance;

  setUp(() => store.orders.clear());
  tearDown(() {
    store.orders.clear();
    store.debugPlaceOrderRequest = null;
  });

  test('OrderDto reads the server updatedAt (and tolerates its absence)', () {
    expect(OrderDto.fromJson(_order('pending', updatedAt: _t1)).updatedAt!.isAtSameMomentAs(DateTime.parse(_t1)), isTrue);
    expect(OrderDto.fromJson(_order('pending')).updatedAt, isNull);
    expect(OrderDto.fromJson({..._order('pending'), 'updatedAt': 12}).updatedAt, isNull);
  });

  group('orders:create reply vs order:updated push', () {
    test('the create reply arriving after a newer order:updated keeps "confirmed"', () async {
      // The server settled the payment (confirmed, t1) before it answered the create request (pending, t0).
      store.debugPlaceOrderRequest = (event, [body]) async {
        store.debugOrderPush(_order('confirmed', updatedAt: _t1));
        return _order('pending', updatedAt: _t0);
      };
      final placed = await _place(store);

      expect(placed.id, 'o1');
      expect(store.orders, hasLength(1));
      expect(store.orderById('o1')!.status, 'confirmed');
      expect(store.orderById('o1')!.updatedAt!.isAtSameMomentAs(DateTime.parse(_t1)), isTrue);
    });

    test('a create reply that is the newest copy is stored as before', () async {
      store.debugPlaceOrderRequest = (event, [body]) async => _order('pending', updatedAt: _t0);
      await _place(store);
      expect(store.orderById('o1')!.status, 'pending');
    });

    test('the stale reply does not notify listeners either', () async {
      store.debugOrderPush(_order('confirmed', updatedAt: _t1));
      var notified = 0;
      void listener() => notified++;
      store.addListener(listener);
      addTearDown(() => store.removeListener(listener));
      store.debugOrderPush(_order('pending', updatedAt: _t0));
      expect(notified, 0);
    });
  });

  group('a genuinely newer copy still replaces the stored one', () {
    test('pending then confirmed', () {
      store.debugOrderPush(_order('pending', updatedAt: _t0));
      store.debugOrderPush(_order('confirmed', updatedAt: _t1));
      expect(store.orderById('o1')!.status, 'confirmed');
    });

    test('confirmed then shipped, then a replayed older confirmed is ignored', () {
      store.debugOrderPush(_order('confirmed', updatedAt: _t1));
      store.debugOrderPush(_order('shipped', updatedAt: _t2));
      store.debugOrderPush(_order('confirmed', updatedAt: _t1));
      expect(store.orderById('o1')!.status, 'shipped');
    });

    test('the same updatedAt replaces (nothing older about it: e.g. only the items or the rider changed)', () {
      store.debugOrderPush(_order('shipped', updatedAt: _t1, total: 25));
      store.debugOrderPush(_order('shipped', updatedAt: _t1, total: 30));
      expect(store.orderById('o1')!.totalUsd, 30);
    });

    test('without an updatedAt on either side the latest arrival wins, as before', () {
      store.debugOrderPush(_order('confirmed', updatedAt: _t1));
      store.debugOrderPush(_order('pending')); // incoming has none
      expect(store.orderById('o1')!.status, 'pending');
      store.debugOrderPush(_order('shipped')); // neither has one
      expect(store.orderById('o1')!.status, 'shipped');
      store.debugOrderPush(_order('delivered', updatedAt: _t0)); // stored has none
      expect(store.orderById('o1')!.status, 'delivered');
    });

    test('other orders are untouched and a new order is inserted first', () {
      store.debugOrderPush(_order('confirmed', id: 'o1', updatedAt: _t1));
      store.debugOrderPush(_order('pending', id: 'o2', updatedAt: _t0));
      expect(store.orders.map((o) => o.id), ['o2', 'o1']);
      expect(store.orderById('o1')!.status, 'confirmed');
    });
  });

  group('payment-pending screen', () {
    setUp(() async => gapReset());
    tearDown(gapTearDown);

    testWidgets('moves on to the success page when a newer order:updated arrives', (tester) async {
      store.debugOrderPush(_order('pending', updatedAt: _t1));
      await tester.pumpWidget(gapApp(const PaymentPendingScreen(locale: Locale('en'), orderId: 'o1')));
      await tester.pump();
      expect(find.byKey(const ValueKey('pending-title')), findsOneWidget);

      // An older copy changes nothing on screen...
      store.debugOrderPush(_order('confirmed', updatedAt: _t0));
      await tester.pump();
      expect(find.byType(OrderSuccessScreen), findsNothing);

      // ...the real settlement moves the customer forward.
      store.debugOrderPush(_order('confirmed', updatedAt: _t2));
      await tester.pump(); // rebuild, then the screen replaces itself
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(OrderSuccessScreen), findsOneWidget);
    });

    testWidgets('a stale pending copy cannot pull a confirmed order back to the waiting page', (tester) async {
      store.debugOrderPush(_order('confirmed', updatedAt: _t1));
      store.debugOrderPush(_order('pending', updatedAt: _t0)); // the late create reply
      await tester.pumpWidget(gapApp(const PaymentPendingScreen(locale: Locale('en'), orderId: 'o1')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(OrderSuccessScreen), findsOneWidget);
    });
  });
}
