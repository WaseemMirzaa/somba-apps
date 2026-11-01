// End-to-end test of the REAL rider client (AuthService + RiderStore + socket
// protocol) against a RUNNING backend. Skipped unless LIVE_TEST=true.
//
//   cd api && npm run seed && node dist/main.js   (needs the warehouse, admin, customer and rider demo accounts)
//   cd rider-app && flutter test test/live_api_test.dart --dart-define=LIVE_TEST=true \
//     --dart-define=API_URL=http://localhost:3001 --dart-define=SOCKET_URL=http://localhost:3001
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/services/auth_service.dart';
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/services/support_store.dart';
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

  test('rider: the warehouse assigns a pickup; the rider moves it but cannot deliver or accept it; staff scan it in', () async {
    final admin = Actor();
    await admin.connect('admin@somba.app', 'Somba@2026');
    final customer = Actor();
    await customer.connect('customer@somba.app', 'Somba@2026');
    final staff = Actor();
    await staff.connect('warehouse@somba.app', 'Somba@2026');
    final store = RiderStore.instance;

    // Wrong password is a readable error, not an offline entry.
    await expectLater(store.login('rider@somba.app', 'wrong-password'), throwsA(anything));
    expect(store.isSignedIn, isFalse);

    // COD is off by default; enable for this run, then the customer orders cash-on-delivery (pinned in Gombe).
    await admin.call('settings:set', {'key': 'codEnabled', 'value': 'true'});
    final products = ((await customer.call('products:list')) as List).where((p) => ((p['stock'] as num?) ?? 0) > 5).toList();
    final order = await customer.call('orders:create', {
      'items': [
        {'productId': products.first['id'], 'qty': 1}
      ],
      'paymentMethod': 'cod',
      'shippingAddress': '{"city":"Kinshasa","line1":"12 Ave du Commerce","geo":{"lat":-4.3105,"lng":15.3136}}',
    });

    await store.login('rider@somba.app', 'Somba@2026');
    await until(() => store.isConnected && store.loaded, what: 'rider hydrated');
    expect(store.user!.role, 'rider');
    await until(() => store.assignment?.hasHub == true, what: 'home warehouse');
    // docs/contracts/areas.md: rider:assignment carries hub.areaId and hub.coverage (the seeded Entrepôt Kinshasa covers
    // CD-KN); the rider's runs are listed with the additive Run fields.
    await until(() => store.assignment?.coverage != null, what: 'the warehouse coverage');
    expect(store.assignment!.areas, isNotEmpty);
    expect(await store.request('rider:runs'), isA<List>());

    // The rider sees nothing until the warehouse assigns, cannot accept, and has no open pool.
    expect(store.myTasks.any((t) => t.orderId == order['id']), isFalse);
    expect(await store.request('delivery:unassigned'), isEmpty);

    final queue = await staff.call('logistics:queue', {'kind': 'pickup'}) as Map;
    final row = (queue['tasks'] as List).firstWhere((t) => t['orderId'] == order['id']) as Map;
    await expectLater(store.request('delivery:accept', {'taskId': row['id']}), throwsA(predicate((e) => e.toString().contains('warehouse assigns'))));
    await staff.call('logistics:assign', {'taskId': row['id'], 'riderId': store.user!.id});
    await until(() => store.myTasks.any((t) => t.id == row['id']), what: 'assigned pickup (task:updated push)');
    final task = store.myTasks.firstWhere((t) => t.id == row['id']);
    expect(task.kind, LegKind.pickup);
    expect(task.endsAtHub, isTrue);
    expect(task.from?.type, 'seller');
    expect(task.to?.type, 'hub');

    await store.advance(task.id, 'picked_up');
    await store.advance(task.id, 'in_transit');
    // Server rule: a leg that ends at a warehouse is finished by the staff scan, never by the rider.
    await expectLater(store.advance(task.id, 'delivered'), throwsA(predicate((e) => e.toString().contains('warehouse staff scan'))));
    await staff.call('logistics:scanIn', {'taskId': task.id});
    await until(() => store.finished.any((t) => t.id == task.id), what: 'scanned in');

    await store.logout();
    expect(store.isSignedIn, isFalse);
    // Leave the platform as we found it (COD off per the client scope).
    await admin.call('settings:set', {'key': 'codEnabled', 'value': 'false'});
    admin.close();
    customer.close();
    staff.close();
  }, skip: live ? false : 'set --dart-define=LIVE_TEST=true');

  test('rider: a support ticket with a reply from an agent, live', () async {
    final admin = Actor();
    await admin.connect('admin@somba.app', 'Somba@2026');
    final store = RiderStore.instance;
    final support = SupportStore.instance;
    await store.login('rider@somba.app', 'Somba@2026');
    await until(() => store.isConnected && store.loaded, what: 'rider hydrated');

    final t = await support.open(subject: 'Live test ticket', message: 'Bonjour, test.', category: 'delivery');
    expect(t.status, 'open');
    expect(t.messages.single.text, 'Bonjour, test.');
    await support.load();
    expect(support.tickets.any((x) => x.id == t.id), isTrue);

    await admin.call('support:reply', {'id': t.id, 'text': 'Reçu.'});
    await until(() => support.byId(t.id)?.messages.length == 2, what: 'support:updated push');
    expect(support.byId(t.id)!.userUnread, 1);
    await support.markRead(t.id);
    expect(support.byId(t.id)!.userUnread, 0);

    await admin.call('support:setStatus', {'id': t.id, 'status': 'closed'});
    await until(() => support.byId(t.id)?.isClosed == true, what: 'closed');
    await store.logout();
    admin.close();
  }, skip: live ? false : 'set --dart-define=LIVE_TEST=true');

  test('rider: push device registration (devices:register as the rider app) and removal on sign-out', () async {
    final store = RiderStore.instance;
    await store.login('rider@somba.app', 'Somba@2026');
    await until(() => store.isConnected && store.loaded, what: 'rider hydrated');
    // The same call the PushService makes once Firebase gives the device a token.
    await store.registerDevice('fcm-rider-flutter-${DateTime.now().millisecondsSinceEpoch}', 'android');
    // A server error (empty token) comes back as an exception, not a crash.
    await expectLater(store.registerDevice('', 'android'), throwsA(isA<ApiException>()));
    await store.logout(); // sends devices:unregister for the token
    expect(store.isSignedIn, isFalse);
  }, skip: live ? false : 'set --dart-define=LIVE_TEST=true');
}
