// End-to-end test of the REAL client code (AuthService + RealtimeStore + the
// socket protocol) against a RUNNING backend. Skipped unless LIVE_TEST=true.
//
//   cd api && npm run seed && node dist/main.js           # dev mode, sandbox payments
//   cd mobile && flutter test test/live_api_test.dart \
//     --dart-define=LIVE_TEST=true --dart-define=API_URL=http://localhost:3001 \
//     --dart-define=SOCKET_URL=http://localhost:3001
import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/services/auth_service.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/socket_service.dart';
import 'package:shared_preferences/shared_preferences.dart';

const live = bool.fromEnvironment('LIVE_TEST');
final tag = DateTime.now().millisecondsSinceEpoch.toString().substring(5);

/// Wait until [cond] holds, driven by the store's own change notifications.
Future<void> until(bool Function() cond, {String what = 'condition', Duration timeout = const Duration(seconds: 12)}) async {
  final store = RealtimeStore.instance;
  if (cond()) return;
  final done = Completer<void>();
  void check() {
    if (!done.isCompleted && cond()) done.complete();
  }

  store.addListener(check);
  // Some conditions (callbacks) aren't announced by the store: also look regularly.
  final poll = Timer.periodic(const Duration(milliseconds: 100), (_) => check());
  try {
    await done.future.timeout(timeout, onTimeout: () => throw TestFailure('Timed out waiting for: $what'));
  } finally {
    poll.cancel();
    store.removeListener(check);
  }
}

/// A second, independent connection used to act as the admin.
class Admin {
  final SocketService socket = SocketService();
  late final String token;
  Future<void> connect() async {
    final auth = AuthService();
    final r = await auth.login('admin@somba.app', 'Somba@2026');
    token = r.accessToken;
    final s = socket.connect(() async => token);
    final ready = Completer<void>();
    s.on('ready', (_) => ready.complete());
    await ready.future.timeout(const Duration(seconds: 8));
  }

  Future<dynamic> call(String event, [Map<String, dynamic>? body]) => socket.request(event, body);
  void close() => socket.disconnect();
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = null; // allow real sockets in the test binding

  group('customer app against the real API', () {
    final store = RealtimeStore.instance;
    final email = 'flutter$tag@live.test';
    const password = 'Flutter-Pass-2026';
    late Admin admin;
    late String productId;
    var sessionEnded = false;

    setUpAll(() async {
      SharedPreferences.setMockInitialValues({});
      await ShopState.instance.load();
      admin = Admin();
      await admin.connect();
      final p = await admin.call('products:create', {'name': 'Flutter Test Item $tag', 'price': 40, 'category': 'Electronics', 'stock': 50, 'description': 'Created by the Flutter live test'});
      productId = (p as Map)['id'] as String;
      store.onSessionEnded = () => sessionEnded = true;
    });

    tearDownAll(() async {
      admin.close();
      await store.logout();
    });

    test('register → signed in, data downloaded over the socket', () async {
      await store.register(email: email, password: password, name: 'Flutter Tester', phone: '+243812345678', locale: 'fr');
      expect(store.isSignedIn, isTrue);
      expect(store.user!.role, 'customer');
      await until(() => store.hydrated, what: 'first download');
      expect(store.products.any((p) => p.id == productId), isTrue, reason: 'live catalogue includes the new listing');
      expect(store.categories, isNotEmpty);
      expect(store.zones.map((z) => z.id), containsAll(['gombe', 'limete']), reason: 'delivery zones come from the server');
      expect(store.fxRate, isNotNull);
      expect(store.prefs['market'], 'DRC');
      expect(store.walletBalance, 0);
    });

    test('catalogue updates live (price change pushed, no polling)', () async {
      await admin.call('products:update', {'id': productId, 'patch': {'price': 45}});
      await until(() => store.products.firstWhere((p) => p.id == productId).price == 45, what: 'product:updated push');
      expect(productByUuid(productId)!.price, 45);
      await admin.call('products:update', {'id': productId, 'patch': {'price': 40}});
      await until(() => store.products.firstWhere((p) => p.id == productId).price == 40, what: 'price back to 40');
    });

    test('address book + wishlist are saved on the server', () async {
      await store.addAddress({'label': 'Home', 'line1': '12 Ave du Commerce', 'commune': 'Gombe', 'city': 'Kinshasa', 'phone': '+243812345678'});
      expect(store.addresses, hasLength(1));
      expect(store.addresses.first.isDefault, isTrue);
      await store.toggleWishlist(productId);
      expect(store.wishlistIds, contains(productId));
      await store.toggleWishlist(productId);
      expect(store.wishlistIds, isNot(contains(productId)));
    });

    test('wallet top-up via mobile money: pending first, credited only on confirmation', () async {
      final pay = await store.topUpWallet(60, method: 'airtel_money', phone: '+243812345678');
      expect(pay.status, 'pending');
      expect(pay.purpose, 'topup');
      expect(store.walletBalance, 0, reason: 'not credited before the network confirms');
      await until(() => store.walletBalance == 60, what: 'wallet:updated after confirmation');
      await until(() => store.payments.firstWhere((p) => p.id == pay.id).status == 'succeeded', what: 'payment:updated');
      expect(store.walletTransactions.first.type, 'topup');
    });

    test('place an order paid from the wallet; the SERVER prices it', () async {
      final zone = store.zones.first;
      final order = await store.placeOrder(
        items: [
          {'productId': productId, 'qty': 1},
        ],
        paymentMethod: 'wallet',
        deliveryFeeUsd: 0, // ignored: the zone decides
        zoneId: zone.id,
      );
      expect(order.status, 'confirmed');
      expect(order.subtotalUsd, 40);
      expect(order.deliveryFeeUsd, zone.deliveryFeeUsd);
      expect(order.totalUsd, 40 + zone.deliveryFeeUsd);
      await until(() => store.walletBalance == 60 - order.totalUsd, what: 'wallet debited live');
      expect(store.orders.first.id, order.id);
      expect(store.orders.first.items.single.productName, contains('Flutter Test Item'));
    });

    test('mobile-money order stays pending, then the network confirms it (push)', () async {
      final order = await store.placeOrder(
        items: [
          {'productId': productId, 'qty': 2},
        ],
        paymentMethod: 'orange_money',
        paymentPhone: '+243 81 234 5678',
        zoneId: 'gombe',
      );
      expect(order.status, 'pending');
      expect(store.paymentForOrder(order.id)?.status, 'pending');
      final settled = await store.awaitOrderSettled(order.id);
      expect(settled.status, 'confirmed');
      expect(store.paymentForOrder(order.id)?.status, 'succeeded');
      await store.cancelOrder(order.id); // tidy: refunds to the wallet
      await until(() => store.orderById(order.id)!.status == 'cancelled', what: 'order cancelled');
    });

    test('a declined mobile-money payment cancels the order and frees the stock', () async {
      final stockBefore = (await admin.call('products:get', {'id': productId}) as Map)['stock'] as int;
      final order = await store.placeOrder(
        items: [
          {'productId': productId, 'qty': 1},
        ],
        paymentMethod: 'vodacom_mpesa',
        paymentPhone: '+243810000000', // sandbox: numbers ending 0000 are declined
        zoneId: 'gombe',
      );
      expect(order.status, 'pending');
      final settled = await store.awaitOrderSettled(order.id);
      expect(settled.status, 'cancelled');
      expect(store.paymentForOrder(order.id)?.failureReason, isNotNull);
      expect((await admin.call('products:get', {'id': productId}) as Map)['stock'], stockBefore);
    });

    test('rules the server enforces come back as readable errors', () async {
      expect(
        () => store.placeOrder(items: [
          {'productId': productId, 'qty': 1},
        ], paymentMethod: 'cod', zoneId: 'gombe'),
        throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('not available'))),
      );
      expect(
        () => store.placeOrder(items: [
          {'productId': productId, 'qty': 1},
        ], paymentMethod: 'orange_money', zoneId: 'gombe'),
        throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('phone'))),
      );
      expect(
        () => store.placeOrder(items: [
          {'productId': productId, 'qty': 1},
        ], paymentMethod: 'wallet', zoneId: 'atlantis'),
        throwsA(isA<ApiException>().having((e) => e.message, 'message', contains('zone'))),
      );
    });

    test('promo codes are validated by the server and applied on the order', () async {
      await admin.call('promos:create', {'code': 'FL$tag', 'type': 'percent', 'value': 10, 'minOrder': 10});
      final promos = await store.listPromos();
      expect(promos.any((p) => p['code'] == 'FL$tag'), isTrue);

      final shop = ShopState.instance..clearCart();
      expect(await shop.applyPromo('FL$tag'), contains('Minimum order'), reason: 'an empty cart is below the minimum');
      shop.addToCart(productByUuid(productId)!, qty: 2); // 2 x $40 = $80
      expect(await shop.applyPromo('NOPE$tag'), 'Invalid code.');
      expect(await shop.applyPromo('FL$tag'), isNull);
      expect(shop.promoDiscount(shop.subtotal), 8);

      final order = await store.placeOrder(
        items: shop.cart.map((c) => {'productId': c.product.uuid, 'qty': c.qty}).toList(),
        paymentMethod: 'wallet',
        zoneId: 'gombe',
        promoCode: shop.appliedPromo!.code,
      );
      expect(order.discountUsd, 8);
      expect(order.totalUsd, 80 - 8 + 3);
      await store.cancelOrder(order.id);
      shop.clearCart();
    });

    test('profile, preferences and password', () async {
      await store.updateProfile(name: 'Flutter Renamed');
      expect(store.user!.name, 'Flutter Renamed');
      await store.setPref('sms', true);
      expect(store.prefs['sms'], true);
      await store.changePassword(password, 'Flutter-New-2026');
      // the new credentials work on a fresh login
      final r = await AuthService().login(email, 'Flutter-New-2026');
      expect(r.user.email, email);
      await store.changePassword('Flutter-New-2026', password);
    });

    test('email verification and phone code', () async {
      final token = await store.sendEmailVerification();
      expect(token, isNotNull, reason: 'dev builds of the API return the token');
      await store.verifyEmailToken(token!);
      expect(store.user!.emailVerified, isTrue);

      final code = await store.sendPhoneOtp();
      expect(code, isNotNull);
      await expectLater(store.verifyPhoneOtp('000000'), throwsA(isA<ApiException>()));
      await store.verifyPhoneOtp(code!);
      expect(store.user!.phoneVerified, isTrue);
    });

    test('forgot / reset password through the REST endpoints', () async {
      await store.logout();
      final dev = await store.forgotPassword(email);
      expect(dev, isNotNull);
      await store.resetPassword(dev!, 'Flutter-Reset-2026');
      await expectLater(store.login(email, password), throwsA(isA<ApiException>()), reason: 'old password no longer works');
      await store.login(email, 'Flutter-Reset-2026');
      expect(store.isSignedIn, isTrue);
      await until(() => store.hydrated, what: 'download after login');
    });

    test('push device registration', () async {
      await store.registerDevice('fcm-flutter-$tag', platform: 'android');
    });

    test('an admin suspending the account ends the session in the app', () async {
      sessionEnded = false;
      await admin.call('customers:setActive', {'id': store.user!.id, 'active': false});
      await until(() => sessionEnded, what: 'session ended callback', timeout: const Duration(seconds: 15));
      expect(store.isSignedIn, isFalse);
      expect(store.products, isEmpty, reason: 'nothing of the old session is kept');
    });

    test('a reactivated customer can sign in again and delete their account', () async {
      final users = await admin.call('customers:list') as List;
      final me = users.cast<Map>().firstWhere((u) => u['email'] == email);
      await admin.call('customers:setActive', {'id': me['id'], 'active': true});
      await store.login(email, 'Flutter-Reset-2026');
      await until(() => store.hydrated, what: 'download after login');
      await store.deleteAccount('Flutter-Reset-2026');
      expect(store.isSignedIn, isFalse);
      await expectLater(AuthService().login(email, 'Flutter-Reset-2026'), throwsA(isA<ApiException>()));
    });
  }, skip: live ? false : 'set --dart-define=LIVE_TEST=true with a running API');
}
