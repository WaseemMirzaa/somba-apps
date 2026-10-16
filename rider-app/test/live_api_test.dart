// End-to-end test of the REAL rider client (AuthService + RiderStore + socket
// protocol) against a RUNNING backend. Skipped unless LIVE_TEST=true.
//
//   cd api && npm run seed && node dist/main.js
//   cd rider-app && flutter test test/live_api_test.dart --dart-define=LIVE_TEST=true \
//     --dart-define=API_URL=http://localhost:3001 --dart-define=SOCKET_URL=http://localhost:3001
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/services/auth_service.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/services/socket_service.dart';

const live = bool.fromEnvironment('LIVE_TEST');

Future<void> until(bool Function() cond, {String what = 'condition', Duration timeout = const Duration(seconds: 12)}) async {
  final end = DateTime.now().add(timeout);
  while (!cond()) {
    if (DateTime.now().isAfter(end)) throw TestFailure('Timed out waiting for: $what');
    await Future.delayed(const Duration(milliseconds: 100));
  }
}

class Actor {
  final SocketService socket = SocketService();
  late String token;
  Future<void> connect(String email, String password) async {
    token = (await AuthService().login(email, password)).accessToken;
    final s = socket.connect(() async => token);
    final ready = Completer<void>();
    s.on('ready', (_) => ready.complete());
    await ready.future.timeout(const Duration(seconds: 8));
  }

  Future<dynamic> call(String e, [Map<String, dynamic>? b]) => socket.request(e, b);
  void close() => socket.disconnect();
}

void main() {
  setUpAll(() {
    HttpOverrides.global = null;
    SharedPreferences.setMockInitialValues({});
  });

  test('rider: sign in, claim, deliver, GPS push reaches the customer', () async {
    final admin = Actor();
    await admin.connect('admin@somba.app', 'Somba@2026');
    final customer = Actor();
    await customer.connect('customer@somba.app', 'Somba@2026');
    final store = RiderStore.instance;

    // Wrong password is a readable error, not an offline entry.
    await expectLater(store.login('rider@somba.app', 'wrong-password'), throwsA(anything));
    expect(store.isSignedIn, isFalse);

    // COD is off by default; enable for this run, then the customer orders cash-on-delivery.
    await admin.call('settings:set', {'key': 'codEnabled', 'value': 'true'});
    final products = ((await customer.call('products:list')) as List).where((p) => ((p['stock'] as num?) ?? 0) > 5).toList();
    final order = await customer.call('orders:create', {
      'items': [
        {'productId': products.first['id'], 'qty': 1}
      ],
      'paymentMethod': 'cod',
      'deliveryFeeUsd': 3,
      'zoneId': 'gombe',
      'shippingAddress': '{"city":"Kinshasa","line1":"12 Ave du Commerce"}',
    });

    await store.login('rider@somba.app', 'Somba@2026');
    await until(() => store.isConnected && store.loaded, what: 'rider hydrated');
    expect(store.user!.role, 'rider');
    await until(() => store.pool.any((t) => t.orderId == order['id']), what: 'task in pool');
    final task = store.pool.firstWhere((t) => t.orderId == order['id']);

    await store.accept(task.id);
    expect(store.active.any((t) => t.id == task.id), isTrue);
    expect(store.pool.any((t) => t.id == task.id), isFalse);

    await store.advance(task.id, 'picked_up');
    await store.advance(task.id, 'in_transit');

    final located = Completer<Map>();
    customer.socket.socket!.on('delivery:location', (d) {
      if (!located.isCompleted) located.complete(d as Map);
    });
    await store.sendLocation(task.id, -4.325, 15.322);
    final loc = await located.future.timeout(const Duration(seconds: 6));
    expect(loc['lat'], -4.325);

    await store.advance(task.id, 'delivered');
    await until(() => store.finished.any((t) => t.id == task.id), what: 'task finished');
    expect(store.earnings.delivered, greaterThan(0));
    expect(store.earnings.codCollectedUsd, greaterThan(0));

    // Server rule: cannot skip or redo a finished delivery.
    await expectLater(store.advance(task.id, 'picked_up'), throwsA(anything));

    await store.logout();
    expect(store.isSignedIn, isFalse);
    // Leave the platform as we found it (COD off per the client scope).
    await admin.call('settings:set', {'key': 'codEnabled', 'value': 'false'});
    admin.close();
    customer.close();
  }, skip: live ? false : 'set --dart-define=LIVE_TEST=true');

  test('rider: fail with a reason (re-queued as attempt 2) and deliver with the customer code', () async {
    final admin = Actor();
    await admin.connect('admin@somba.app', 'Somba@2026');
    final customer = Actor();
    await customer.connect('customer@somba.app', 'Somba@2026');
    final store = RiderStore.instance;
    final products = ((await customer.call('products:list')) as List).where((p) => ((p['stock'] as num?) ?? 0) > 5).toList();

    Future<Map> order() async => Map<String, dynamic>.from(await customer.call('orders:create', {
          'items': [
            {'productId': products.first['id'], 'qty': 1}
          ],
          'paymentMethod': 'stripe_card',
          'zoneId': 'gombe',
          'shippingAddress': '{"city":"Kinshasa","line1":"3 Ave Livre"}',
        }));

    await store.login('rider@somba.app', 'Somba@2026');
    await until(() => store.isConnected && store.loaded, what: 'rider hydrated');

    // ---- failed delivery from `assigned` with a reason -> new task, attempt 2
    final o1 = await order();
    // The server does not push new pool items to riders, so re-read like pull-to-refresh.
    await store.refresh();
    await until(() => store.pool.any((t) => t.orderId == o1['id']), what: 'task in pool');
    final t1 = store.pool.firstWhere((t) => t.orderId == o1['id']);
    expect(t1.attempts, 1);
    await store.accept(t1.id);
    await store.advance(t1.id, 'failed', reason: 'Customer unreachable');
    await until(() => store.finished.any((t) => t.id == t1.id), what: 'failed task in Done');
    final failed = store.finished.firstWhere((t) => t.id == t1.id);
    expect(failed.status, 'failed');
    expect(failed.failureReason, startsWith('Customer unreachable'));
    await until(() => store.pool.any((t) => t.orderId == o1['id']), what: 're-queued task');
    final again = store.pool.firstWhere((t) => t.orderId == o1['id']);
    expect(again.id, isNot(t1.id));
    expect(again.attempts, 2);

    // ---- proof of delivery: wrong code refused, right code delivers
    await admin.call('settings:set', {'key': 'requireDeliveryCode', 'value': 'true'});
    try {
      await store.refresh();
      expect(store.requireDeliveryCode, isTrue);
      final o2 = await order();
      await store.refresh();
      await until(() => store.pool.any((t) => t.orderId == o2['id']), what: 'second task in pool');
      final t2 = store.pool.firstWhere((t) => t.orderId == o2['id']);
      await store.accept(t2.id);
      await store.advance(t2.id, 'picked_up');
      await store.advance(t2.id, 'in_transit');
      final info = await customer.call('orders:deliveryCode', {'orderId': o2['id']}) as Map;
      expect(info['required'], isTrue);
      final code = info['code'] as String;
      expect(code, matches(RegExp(r'^\d{4}$')));

      await expectLater(store.advance(t2.id, 'delivered'), throwsA(anything));
      final wrong = code == '1234' ? '4321' : '1234';
      await expectLater(store.advance(t2.id, 'delivered', code: wrong), throwsA(predicate((e) => e.toString().contains('Wrong delivery code'))));
      await store.advance(t2.id, 'delivered', code: code);
      await until(() => store.finished.any((t) => t.id == t2.id && t.status == 'delivered'), what: 'delivered with code');
    } finally {
      await admin.call('settings:set', {'key': 'requireDeliveryCode', 'value': 'false'});
    }
    await store.refresh();
    expect(store.requireDeliveryCode, isFalse);

    await store.logout();
    admin.close();
    customer.close();
  }, skip: live ? false : 'set --dart-define=LIVE_TEST=true');
}
