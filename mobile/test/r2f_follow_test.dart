// Following a store (customer app): the follow store (list, toggle, the other device's push, reset), the Follow /
// Following button on the store page (snackbars for every outcome, French, who sees it), the Following list in the
// account (rows, empty, failure + retry, unfollow, open the store) and the notice for a followed store's new product.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/screens/account_screen.dart';
import 'package:lipcart/screens/more/following_screen.dart';
import 'package:lipcart/screens/more/shop_extra.dart';
import 'package:lipcart/screens/notice_router.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/feature_hooks.dart';
import 'package:lipcart/services/follow_store.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'button_rules.dart';
import 'engage_helpers.dart';
import 'gap_helpers.dart';

/// A pretend server: remembers who follows what, records every call.
class FakeFollowServer {
  final followed = <String>{'s2'};
  final calls = <String>[];
  Object? toggleError;
  Object? listError;
  int followers = 7;
  final names = {'s1': 'Kinshasa Traders', 's2': 'Goma Goods', 's3': 'Lubumbashi Bikes'};

  Map<String, dynamic> _row(String id, int i) => {'id': id, 'name': names[id], 'logoUrl': null, 'rating': 4.5, 'productCount': id == 's2' ? 1 : 12, 'followedAt': '2026-11-0${i + 1}T10:00:00.000Z'};

  Future<dynamic> handle(String event, [Map<String, dynamic>? body]) async {
    calls.add(event);
    switch (event) {
      case 'follows:list':
        if (listError != null) throw listError!;
        var i = 0;
        return [for (final id in followed) _row(id, i++)];
      case 'follows:state':
        return {'sellerId': body!['sellerId'], 'following': followed.contains(body['sellerId']), 'followers': followers};
      case 'follows:toggle':
        if (toggleError != null) throw toggleError!;
        final id = body!['sellerId'] as String;
        final want = body['following'] as bool? ?? !followed.contains(id);
        want ? followed.add(id) : followed.remove(id);
        return {'sellerId': id, 'following': want, 'followers': followers + (want ? 1 : 0)};
      case 'sellers:storefront':
        final id = body!['id'] as String;
        return {'seller': {'id': id, 'name': names[id], 'rating': 4.6, 'badge': 'gold'}};
      default:
        return const <dynamic>[];
    }
  }
}

late FakeFollowServer server;

Future<void> _show(WidgetTester tester, Widget screen, {String lang = 'en', double scale = 1}) async {
  gapTallViewport(tester);
  await tester.pumpWidget(gapAppScaled(screen, lang: lang, scale: scale));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 300));
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() async {
    await engageReset(lang: 'en');
    FollowStore.instance.reset();
    server = FakeFollowServer();
    RealtimeStore.instance.debugCallRequest = server.handle;
  });
  tearDown(() {
    FollowStore.instance.reset();
    engageTearDown();
  });

  group('the follow store', () {
    test('is plugged into the session: it loads after sign-in, listens for the other device and forgets on sign-out', () {
      final hook = buildFeatureHooks().firstWhere((h) => h.name == 'follows');
      expect(hook.pushes.keys, ['follows:updated']);
      expect(hook.hydrate, isNotNull);
      expect(hook.reset, isNotNull);
    });

    test('load reads the list, most recent first as the server sent it', () async {
      await FollowStore.instance.load();
      expect(FollowStore.instance.stores.map((s) => s.name), ['Goma Goods']);
      expect(FollowStore.instance.loaded, isTrue);
      expect(FollowStore.instance.isFollowing('s2'), isTrue);
      expect(FollowStore.instance.isFollowing('s1'), isFalse);
      expect(FollowStore.instance.stores.single.productCount, 1);
    });

    test('toggle follows and unfollows, keeps the list in step and returns the new state', () async {
      await FollowStore.instance.load();
      final on = await FollowStore.instance.toggle('s1');
      expect(on.following, isTrue);
      expect(on.followers, 8);
      expect(FollowStore.instance.isFollowing('s1'), isTrue);
      final off = await FollowStore.instance.toggle('s2', following: false);
      expect(off.following, isFalse);
      expect(FollowStore.instance.stores, isEmpty, reason: 'unfollowed stores leave the list at once');
      expect(server.followed, {'s1'});
    });

    test('a refusal is thrown with the server\'s words and changes nothing', () async {
      server.toggleError = ApiException('This is your own store.');
      await expectLater(FollowStore.instance.toggle('s1'), throwsA(isA<ApiException>()));
      expect(FollowStore.instance.isFollowing('s1'), isFalse);
    });

    test('the other device\'s push updates this one (an unfollow removes the row, a follow reloads the list)', () async {
      await FollowStore.instance.load();
      final push = buildFeatureHooks().firstWhere((h) => h.name == 'follows').pushes['follows:updated']!;
      server.followed.remove('s2');
      push({'sellerId': 's2', 'following': false, 'followers': 3});
      expect(FollowStore.instance.stores, isEmpty);
      server.followed.add('s3');
      push({'sellerId': 's3', 'following': true, 'followers': 9});
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(FollowStore.instance.stores.map((s) => s.id), ['s3']);
      push('garbage');
      push({'sellerId': '', 'following': true});
      expect(FollowStore.instance.stores.map((s) => s.id), ['s3']);
    });

    test('sign-out forgets everything', () async {
      await FollowStore.instance.load();
      await FollowStore.instance.stateOf('s1');
      FollowStore.instance.reset();
      expect(FollowStore.instance.stores, isEmpty);
      expect(FollowStore.instance.loaded, isFalse);
      expect(FollowStore.instance.known('s1'), isNull);
    });

    test('FollowedStore and FollowState read what the server sends, tolerating gaps', () {
      final s = FollowedStore.fromJson({'id': 's9', 'name': 'X', 'rating': 4, 'productCount': 2, 'logoUrl': ''});
      expect([s.id, s.name, s.rating, s.productCount, s.logoUrl], ['s9', 'X', 4.0, 2, null]);
      final st = FollowState.fromJson({'sellerId': 's9', 'following': true, 'followers': 5});
      expect([st.following, st.followers], [true, 5]);
      expect(FollowState.fromJson(const {}).following, isFalse);
    });
  });

  group('the button on the store page', () {
    testWidgets('Follow, then Following: a snackbar each time, the server hears the store, the count follows', (tester) async {
      await _show(tester, StoreScreen(sellerId: 's1', sellerName: 'Kinshasa Traders'));
      expect(find.descendant(of: find.byKey(const ValueKey('follow-store')), matching: find.text('Follow')), findsOneWidget);
      expect(find.byType(FilledButton), findsOneWidget, reason: 'the call to follow is the one filled button');
      expect(find.text('7 followers'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const ValueKey('follow-store')));
      await tester.tap(find.byKey(const ValueKey('follow-store')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(server.followed, contains('s1'));
      expect(find.text('You now follow Kinshasa Traders.'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('follow-store')), matching: find.text('Following')), findsOneWidget);
      expect(find.byType(FilledButton), findsNothing, reason: 'Following is outlined: no filled button left');
      expect(find.text('8 followers'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
      await tester.tap(find.byKey(const ValueKey('follow-store')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(server.followed, isNot(contains('s1')));
      expect(find.text('You no longer follow Kinshasa Traders.'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('follow-store')), matching: find.text('Follow')), findsOneWidget);
    });

    testWidgets('already following: the page says Following from the start', (tester) async {
      server.followed.add('s1');
      await _show(tester, StoreScreen(sellerId: 's1', sellerName: 'Kinshasa Traders'));
      expect(find.descendant(of: find.byKey(const ValueKey('follow-store')), matching: find.text('Following')), findsOneWidget);
    });

    testWidgets('a refusal is a snackbar and the label does not change', (tester) async {
      server.toggleError = ApiException('You can follow up to 200 stores. Unfollow one first.');
      await _show(tester, StoreScreen(sellerId: 's1', sellerName: 'Kinshasa Traders'));
      await tester.ensureVisible(find.byKey(const ValueKey('follow-store')));
      await tester.tap(find.byKey(const ValueKey('follow-store')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('You can follow up to 200 stores. Unfollow one first.'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('follow-store')), matching: find.text('Follow')), findsOneWidget);
    });

    testWidgets('in French: label, count and snackbars; the server\'s refusal is translated', (tester) async {
      await engageReset(lang: 'fr');
      RealtimeStore.instance.debugCallRequest = server.handle;
      await _show(tester, StoreScreen(sellerId: 's1', sellerName: 'Kinshasa Traders'), lang: 'fr');
      expect(find.text('Suivre'), findsOneWidget);
      expect(find.text('7 abonnés'), findsOneWidget);
      await tester.ensureVisible(find.byKey(const ValueKey('follow-store')));
      await tester.tap(find.byKey(const ValueKey('follow-store')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Vous suivez désormais Kinshasa Traders.'), findsOneWidget);
      await tester.pump(const Duration(seconds: 5));
      server.toggleError = ApiException('This is your own store.');
      await tester.tap(find.byKey(const ValueKey('follow-store')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('C’est votre propre boutique.'), findsOneWidget);
    });

    testWidgets('nobody who is not a signed-in shopper is offered it', (tester) async {
      RealtimeStore.instance.user = null;
      await _show(tester, StoreScreen(sellerId: 's1', sellerName: 'Kinshasa Traders'));
      expect(find.byKey(const ValueKey('follow-store')), findsNothing);
      RealtimeStore.instance.user = gapUser(role: 'seller');
      await _show(tester, StoreScreen(sellerId: 's1', sellerName: 'Kinshasa Traders'));
      expect(find.byKey(const ValueKey('follow-store')), findsNothing);
    });

    testWidgets('follows the button rules on the store page', (tester) async {
      await _show(tester, StoreScreen(sellerId: 's1', sellerName: 'Kinshasa Traders'));
      expectButtonRules(tester);
    });
  });

  group('Account → Following', () {
    testWidgets('lists the stores with rating and product count; a row opens the store', (tester) async {
      server.followed.add('s3');
      await _show(tester, const FollowingScreen());
      expect(find.text('Stores you follow'), findsOneWidget);
      expect(find.text('Goma Goods'), findsOneWidget);
      expect(find.text('Lubumbashi Bikes'), findsOneWidget);
      expect(find.text('4.5★ · 1 product'), findsOneWidget);
      expect(find.text('4.5★ · 12 products'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('following-s2')));
      await tester.pumpAndSettle();
      expect(find.byType(StoreScreen), findsOneWidget);
    });

    testWidgets('unfollow removes the row and says so; a failure keeps it and says why', (tester) async {
      server.followed.add('s3');
      await _show(tester, const FollowingScreen());
      await tester.tap(find.byKey(const ValueKey('unfollow-s2')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Goma Goods'), findsNothing);
      expect(find.text('You no longer follow Goma Goods.'), findsOneWidget);
      expect(server.followed, {'s3'});
      await tester.pump(const Duration(seconds: 5));
      server.toggleError = ApiException('Store not found.');
      await tester.tap(find.byKey(const ValueKey('unfollow-s3')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Lubumbashi Bikes'), findsOneWidget);
      expect(find.text('Store not found.'), findsOneWidget);
    });

    testWidgets('nothing followed yet: a friendly empty state', (tester) async {
      server.followed.clear();
      await _show(tester, const FollowingScreen());
      expect(find.byKey(const ValueKey('following-empty')), findsOneWidget);
      expect(find.text('You don’t follow any store yet.'), findsOneWidget);
      expect(find.text('Tap Follow on a store page to hear about its new products.'), findsOneWidget);
    });

    testWidgets('the list cannot load: a message and Try again, which loads it', (tester) async {
      server.listError = ApiException('offline');
      await _show(tester, const FollowingScreen());
      expect(find.text('Couldn’t load the stores you follow.'), findsOneWidget);
      server.listError = null;
      await tester.tap(find.byKey(const ValueKey('following-retry')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Goma Goods'), findsOneWidget);
      expect(find.text('Couldn’t load the stores you follow.'), findsNothing);
    });

    testWidgets('in French at 130% text on a narrow phone: no overflow, the button rules hold', (tester) async {
      tester.view.physicalSize = const Size(360 * 3, 780 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await engageReset(lang: 'fr');
      RealtimeStore.instance.debugCallRequest = server.handle;
      server.names['s2'] = 'Grande Boutique Électronique et Maison de Goma Centre';
      server.followed.add('s3');
      await tester.pumpWidget(gapAppScaled(const FollowingScreen(), lang: 'fr', scale: 1.3));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Boutiques suivies'), findsOneWidget);
      expect(find.text('Ne plus suivre'), findsNWidgets(2));
      expect(find.text('4.5★ · 1 produit'.replaceFirst('4.5', '4,5')), findsOneWidget);
      expect(tester.takeException(), isNull);
      expectButtonRules(tester);
    });

    testWidgets('the account menu has a Following entry that opens the list', (tester) async {
      await _show(tester, AccountScreen(locale: const Locale('en'), onLocaleChanged: (_) {}));
      final entry = find.byKey(const ValueKey('menu-following'));
      expect(entry, findsOneWidget);
      expect(find.descendant(of: entry, matching: find.text('Stores you follow')), findsOneWidget);
      await tester.ensureVisible(entry);
      await tester.tap(entry);
      await tester.pumpAndSettle();
      expect(find.byType(FollowingScreen), findsOneWidget);
    });
  });

  group('the new-product notice', () {
    test('a notice of type store opens the product, like a question\'s answer', () {
      expect(noticeRoute('store', 'p1', hasOrder: (_) => false), const NoticeRoute(NoticeDest.product, 'p1'));
      expect(noticeRoute('store', null, hasOrder: (_) => false), const NoticeRoute(NoticeDest.notifications));
    });

    test('its French text is the server\'s own wording', () {
      final n = NotificationDto.fromJson({
        'id': 'n1',
        'title': 'New from a store you follow',
        'body': 'Goma Goods: Phone',
        'titleFr': 'Nouveau chez une boutique que vous suivez',
        'bodyFr': 'Goma Goods : Téléphone',
        'type': 'store',
        'entityId': 'p1',
        'createdAt': '2026-11-03T10:00:00Z',
        'read': false,
      });
      expect(n.type, 'store');
      expect(n.titleFr, 'Nouveau chez une boutique que vous suivez');
    });
  });
}
