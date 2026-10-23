// Push notifications are optional: they must never break a build or a test, must
// register/refresh the device token once Firebase is available, and a tap must
// open the screen the notification is about.
import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/screens/more/account_more.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/notice_router.dart';
import 'package:lipcart/services/firebase_env.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/push_service.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'gap_helpers.dart';

class _FakeBackend implements PushBackend {
  _FakeBackend({this.configured = true, this.allowed = true, this.launchedBy});

  final bool configured;
  final bool allowed;
  final PushMessage? launchedBy;
  final String? firstToken = 'tok-1';
  final refreshes = StreamController<String>.broadcast();
  final messages = StreamController<PushMessage>.broadcast();
  final opened = StreamController<PushMessage>.broadcast();
  var permissionAsked = 0;

  @override
  Future<bool> initialize() async => configured;
  @override
  Future<bool> requestPermission() async {
    permissionAsked++;
    return allowed;
  }

  @override
  Future<String?> token() async => firstToken;
  @override
  Stream<String> get tokenRefreshes => refreshes.stream;
  @override
  Stream<PushMessage> get foregroundMessages => messages.stream;
  @override
  Stream<PushMessage> get openedMessages => opened.stream;
  @override
  Future<PushMessage?> initialMessage() async => launchedBy;
  @override
  String get platform => 'android';
}

PushMessage _push(String type, [String? entityId, String? notificationId]) => PushMessage(
      title: 'Order update',
      body: 'Your order is on its way',
      data: {
        'type': type,
        if (entityId != null) 'entityId': entityId,
        if (notificationId != null) 'notificationId': notificationId,
        'link': '/shop/orders',
      },
    );

void main() {
  group('PushService', () {
    test('registers the token after sign-in, again when it rotates, and refreshes on a foreground push', () async {
      final backend = _FakeBackend();
      final service = PushService(backend);
      final registered = <String>[];
      final pushes = <PushMessage>[];
      final banners = <PushMessage>[];
      service.foreground.listen(banners.add);

      await service.start(register: (t, p) async => registered.add('$t@$p'), onMessage: pushes.add);
      expect(registered, ['tok-1@android']);
      expect(service.active, isTrue);

      backend.refreshes.add('tok-2');
      await Future<void>.delayed(Duration.zero);
      expect(registered, ['tok-1@android', 'tok-2@android']);

      backend.messages.add(_push('order', 'o1'));
      await Future<void>.delayed(Duration.zero);
      expect(pushes.single.entityId, 'o1');
      expect(banners.single.type, 'order', reason: 'the app shows its own banner for a push while open');

      await service.stop();
      expect(service.active, isFalse);
      backend.refreshes.add('tok-3');
      backend.messages.add(_push('order'));
      await Future<void>.delayed(Duration.zero);
      expect(registered, hasLength(2), reason: 'nothing happens after sign-out');
      expect(pushes, hasLength(1));
    });

    test('a tap in the background is held until the app takes it, and only once', () async {
      final backend = _FakeBackend();
      final service = PushService(backend);
      await service.start(register: (t, p) async {}, onMessage: (_) {});
      expect(service.pendingTap.value, isNull);

      backend.opened.add(_push('delivery', 'o7', 'n1'));
      await Future<void>.delayed(Duration.zero);
      expect(service.pendingTap.value?.entityId, 'o7');
      final taken = service.takeTap();
      expect((taken?.type, taken?.notificationId), ('delivery', 'n1'));
      expect(service.takeTap(), isNull);
    });

    test('the notification that launched the app becomes the pending tap', () async {
      final service = PushService(_FakeBackend(launchedBy: _push('support', 't9')));
      await service.start(register: (t, p) async {}, onMessage: (_) {});
      expect(service.pendingTap.value?.entityId, 't9');
    });

    test('a launch tap is still followed when the permission is declined, and sign-out forgets it', () async {
      final backend = _FakeBackend(allowed: false, launchedBy: _push('order', 'o2'));
      final service = PushService(backend);
      var called = false;
      await service.start(register: (t, p) async => called = true, onMessage: (_) {});
      expect(called, isFalse);
      expect(service.pendingTap.value?.entityId, 'o2');
      await service.stop();
      expect(service.pendingTap.value, isNull);
    });

    test('does nothing, silently, when the build has no Firebase configuration', () async {
      final backend = _FakeBackend(configured: false);
      final service = PushService(backend);
      var called = false;
      await service.start(register: (t, p) async => called = true, onMessage: (_) {});
      expect(called, isFalse);
      expect(backend.permissionAsked, 0, reason: 'no permission prompt without Firebase');
      expect(service.active, isFalse);
    });

    test('a failing registration (offline) never throws into the app', () async {
      final service = PushService(_FakeBackend());
      await service.start(register: (t, p) async => throw StateError('offline'), onMessage: (_) {});
      expect(service.token, 'tok-1');
    });

    test('the real Firebase backend reports "not configured" instead of throwing (no Firebase config here)', () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      expect(await FirebasePushBackend().initialize(), isFalse);
      final service = PushService(FirebasePushBackend());
      await service.start(register: (t, p) async {}, onMessage: (_) {});
      expect(service.active, isFalse);
    });
  });

  group('Firebase settings from --dart-define', () {
    FirebaseOptions? opts(TargetPlatform p, {String ios = 'ios-app', String android = 'android-app'}) =>
        firebaseOptionsFrom(apiKey: 'key', projectId: 'somba', senderId: '123', androidAppId: android, iosAppId: ios, platform: p);

    test('uses the app id of the platform it runs on', () {
      expect(opts(TargetPlatform.android)?.appId, 'android-app');
      expect(opts(TargetPlatform.iOS)?.appId, 'ios-app');
    });

    test('falls back to the native files when a value is missing', () {
      expect(opts(TargetPlatform.iOS, ios: ''), isNull);
      expect(opts(TargetPlatform.android, android: ' '), isNull);
      expect(firebaseOptionsFromDefines(platform: TargetPlatform.android), isNull, reason: 'no defines in tests');
    });
  });

  group('where a notification opens', () {
    bool known(String id) => id == 'o1';

    test('orders, deliveries and payments open the order when it is the customer\'s', () {
      expect(noticeRoute('order', 'o1', hasOrder: known), const NoticeRoute(NoticeDest.order, 'o1'));
      expect(noticeRoute('delivery', 'o1', hasOrder: known), const NoticeRoute(NoticeDest.tracking, 'o1'));
      expect(noticeRoute('payment', 'o1', hasOrder: known), const NoticeRoute(NoticeDest.order, 'o1'));
    });

    test('a top-up payment opens the wallet; an unknown order falls back to the list', () {
      expect(noticeRoute('payment', 'pay-9', hasOrder: known), const NoticeRoute(NoticeDest.wallet));
      expect(noticeRoute('order', 'gone', hasOrder: known), const NoticeRoute(NoticeDest.notifications));
      expect(noticeRoute('delivery', null, hasOrder: known), const NoticeRoute(NoticeDest.notifications));
    });

    test('returns, tickets and after-sale requests', () {
      expect(noticeRoute('return', 'd1', hasOrder: known), const NoticeRoute(NoticeDest.returnStatus, 'd1'));
      expect(noticeRoute('dispute', 'd2', hasOrder: known), const NoticeRoute(NoticeDest.returnStatus, 'd2'));
      expect(noticeRoute('exchange', 'x1', hasOrder: known), const NoticeRoute(NoticeDest.returns));
      expect(noticeRoute('replacement', 'r1', hasOrder: known), const NoticeRoute(NoticeDest.returns));
      expect(noticeRoute('support', 't1', hasOrder: known), const NoticeRoute(NoticeDest.ticket, 't1'));
      expect(noticeRoute('support', null, hasOrder: known), const NoticeRoute(NoticeDest.support));
    });

    test('marketing and anything new open the notifications list', () {
      expect(noticeRoute('marketing', null, hasOrder: known), const NoticeRoute(NoticeDest.notifications));
      expect(noticeRoute('something-new', 'z', hasOrder: known), const NoticeRoute(NoticeDest.notifications));
    });
  });

  group('opening a notification', () {
    setUp(() async {
      await gapReset();
      RealtimeStore.instance.orders
        ..clear()
        ..add(OrderDto.fromJson({
          'id': 'o1',
          'reference': 'SOM-o1',
          'customerName': 'Aline',
          'status': 'processing',
          'paymentMethod': 'wallet',
          'subtotalUsd': 20,
          'deliveryFeeUsd': 3,
          'totalUsd': 23,
          'createdAt': '2026-10-01T09:30:00Z',
          'items': [
            {'productId': 'p1', 'productName': 'Item p1', 'qty': 1, 'priceUsd': 20},
          ],
        }));
    });
    tearDown(gapTearDown);

    Future<NavigatorState> host(WidgetTester tester) async {
      final key = GlobalKey<NavigatorState>();
      await tester.pumpWidget(gapApp(Navigator(key: key, onGenerateRoute: (_) => MaterialPageRoute<void>(builder: (_) => const SizedBox()))));
      return key.currentState!;
    }

    testWidgets('an order push opens that order', (tester) async {
      final nav = await host(tester);
      unawaited(openNotice(nav, const Locale('en'), type: 'order', entityId: 'o1'));
      await tester.pumpAndSettle();
      expect(find.byType(OrderDetailScreen), findsOneWidget);
    });

    testWidgets('a delivery push opens the tracking screen', (tester) async {
      final nav = await host(tester);
      unawaited(openNotice(nav, const Locale('en'), type: 'delivery', entityId: 'o1'));
      await tester.pumpAndSettle();
      expect(find.byType(OrderTrackingScreen), findsOneWidget);
    });

    testWidgets('a marketing push opens the notifications list; from the list itself it stays put', (tester) async {
      final nav = await host(tester);
      unawaited(openNotice(nav, const Locale('en'), type: 'marketing'));
      await tester.pumpAndSettle();
      expect(find.byType(NotificationsScreen), findsOneWidget);
      unawaited(openNotice(nav, const Locale('en'), type: 'marketing', fromInbox: true));
      await tester.pumpAndSettle();
      expect(find.byType(NotificationsScreen), findsOneWidget, reason: 'no second copy of the list');
    });
  });
}
