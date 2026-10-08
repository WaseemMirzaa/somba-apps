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
    final products = (await customer.call('products:list')) as List;
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
}
