// Campaign view/click counting: sent once per product per session, only for promoted products, and never loud.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/screens/deals_screen.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/engage_store.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/widgets/product_actions.dart';

import 'engage_helpers.dart';
import 'gap_helpers.dart';

const _camp = '0b2d6a2c-1111-4222-8333-444455556666';
const _camp2 = '9c1e7b3d-2222-4333-8444-555566667777';

Map<String, dynamic> _promo(String campaignId) => {'campaignId': campaignId, 'priceSource': 'campaign', 'campaignPct': 20, 'originalPrice': 25, 'discount': 20};

class _Tracker {
  final calls = <Map<String, dynamic>>[];
  Object? fail;
  Future<dynamic> handle(String event, [Map<String, dynamic>? body]) async {
    if (event == 'campaigns:track') {
      calls.add({...?body});
      if (fail != null) throw fail!;
      return {'counted': true};
    }
    return const <dynamic>[];
  }

  List<String> kinds(String campaignId) => [for (final c in calls) if (c['campaignId'] == campaignId) c['kind'] as String];
}

Future<_Tracker> _setup(List<dynamic> products) async {
  await engageReset(products: products.cast());
  final t = _Tracker();
  RealtimeStore.instance.debugCallRequest = t.handle;
  return t;
}

Widget _cardApp(String id, {String lang = 'en'}) => gapApp(
      Scaffold(body: Center(child: SizedBox(width: 180, height: 300, child: Builder(builder: (c) => productCard(c, productOf(id), Locale(lang)))))),
      lang: lang,
    );

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(engageTearDown);

  testWidgets('a promoted product on a card is counted as a view once, however often the screen rebuilds', (tester) async {
    final t = await _setup([engageDto('p1', price: 20, extra: _promo(_camp))]);
    await tester.pumpWidget(_cardApp('p1'));
    await tester.pump();
    expect(t.calls, [
      {'campaignId': _camp, 'kind': 'view'}
    ]);
    await tester.pumpWidget(_cardApp('p1'));
    RealtimeStore.instance.debugEmit('store:vacation', {'sellerId': 'zzz', 'onVacation': false}); // rebuilds listeners
    await tester.pump();
    await tester.pump(const Duration(seconds: 5));
    expect(t.kinds(_camp), ['view']);
  });

  testWidgets('opening it counts one click; tapping again does not count again', (tester) async {
    final t = await _setup([engageDto('p1', price: 20, extra: _promo(_camp))]);
    await tester.pumpWidget(_cardApp('p1'));
    await tester.pump();
    await tester.tap(find.text('Item p1'));
    await tester.pumpAndSettle();
    expect(find.byType(ProductDetailScreen), findsOneWidget);
    expect(t.kinds(_camp), ['view', 'click'], reason: 'the product page adds nothing: already counted this session');
    Navigator.of(tester.element(find.byType(ProductDetailScreen))).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Item p1'));
    await tester.pumpAndSettle();
    expect(t.kinds(_camp), ['view', 'click']);
  });

  testWidgets('a product page opened directly (a notice, a link) counts a view and a click', (tester) async {
    final t = await _setup([engageDto('p1', price: 20, extra: _promo(_camp))]);
    gapTallViewport(tester);
    await tester.pumpWidget(gapApp(ProductDetailScreen(product: productOf('p1'), locale: const Locale('en'))));
    await tester.pump();
    expect(t.kinds(_camp), ['view', 'click']);
  });

  testWidgets('a product that is not promoted is never counted', (tester) async {
    final t = await _setup([engageDto('p1')]);
    await tester.pumpWidget(_cardApp('p1'));
    await tester.pump();
    await tester.tap(find.text('Item p1'));
    await tester.pumpAndSettle();
    expect(t.calls, isEmpty);
    expect(EngageStore.instance.trackCalls, 0);
  });

  testWidgets('every promoted product is counted once: a long list of cards does not spam the server', (tester) async {
    final products = [for (var i = 0; i < 12; i++) engageDto('p$i', price: 20, extra: {..._promo('0b2d6a2c-1111-4222-8333-4444555566${i.toString().padLeft(2, '0')}'), 'discount': 30})];
    final t = await _setup(products);
    gapTallViewport(tester);
    await tester.pumpWidget(gapApp(DealsScreen(locale: const Locale('en'))));
    await tester.pump();
    await tester.pump();
    final views = t.calls.where((c) => c['kind'] == 'view').length;
    expect(views, greaterThan(0));
    expect(views, lessThanOrEqualTo(12));
    // Scroll away and back: what was already counted is not sent again.
    final before = t.calls.length;
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -2000));
    await tester.pump();
    await tester.drag(find.byType(CustomScrollView), const Offset(0, 2000));
    await tester.pump();
    final pairs = [for (final c in t.calls) '${c['kind']}|${c['campaignId']}'];
    expect(pairs.toSet().length, pairs.length, reason: 'no campaign is counted twice: $pairs');
    expect(EngageStore.instance.trackCalls, t.calls.length, reason: 'every attempt is one request');
    expect(t.calls.length, lessThanOrEqualTo(12), reason: 'at most one view per product, ${t.calls.length} sent (before scrolling: $before)');
    expect(t.calls.every((c) => c['kind'] == 'view'), isTrue);
  });

  testWidgets('the helper that opens a product counts the click', (tester) async {
    final t = await _setup([engageDto('p1', price: 20, extra: _promo(_camp))]);
    late BuildContext ctx;
    await tester.pumpWidget(gapApp(Scaffold(body: Builder(builder: (c) {
      ctx = c;
      return const SizedBox();
    }))));
    openProduct(ctx, productOf('p1'), const Locale('en'));
    await tester.pump();
    expect(t.kinds(_camp), contains('click'));
    openProduct(ctx, productOf('p1'), const Locale('en'));
    await tester.pump();
    expect(t.kinds(_camp).where((k) => k == 'click'), hasLength(1));
  });

  testWidgets('a failing count is silent: no snackbar, no error, no retry', (tester) async {
    final t = await _setup([engageDto('p1', price: 20, extra: _promo(_camp))]);
    t.fail = ApiException('Too many requests — slow down.');
    await tester.pumpWidget(_cardApp('p1'));
    await tester.pump();
    await tester.tap(find.text('Item p1'));
    await tester.pumpAndSettle();
    expect(t.kinds(_camp), ['view', 'click'], reason: 'one attempt each, no retry');
    expect(find.byType(SnackBar), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('offline (no socket) is silent too', (tester) async {
    await engageReset(products: [engageDto('p1', price: 20, extra: _promo(_camp))]);
    RealtimeStore.instance.debugCallRequest = (event, [body]) async => throw ApiException.local('err_no_connection');
    await tester.pumpWidget(_cardApp('p1'));
    await tester.pump();
    expect(find.byType(SnackBar), findsNothing);
    expect(tester.takeException(), isNull);
  });

  test('counting is once per product and kind per session; signing out starts a new session', () async {
    final t = await _setup([engageDto('p1', price: 20, extra: _promo(_camp)), engageDto('p2', price: 20, extra: _promo(_camp2))]);
    final store = EngageStore.instance;
    store
      ..trackView(productOf('p1'))
      ..trackView(productOf('p1'))
      ..trackClick(productOf('p1'))
      ..trackClick(productOf('p1'))
      ..trackView(productOf('p2'));
    await Future<void>.delayed(Duration.zero);
    expect(t.calls, [
      {'campaignId': _camp, 'kind': 'view'},
      {'campaignId': _camp, 'kind': 'click'},
      {'campaignId': _camp2, 'kind': 'view'},
    ]);
    expect(store.trackCalls, 3);
    store.reset();
    store.trackView(productOf('p1'));
    await Future<void>.delayed(Duration.zero);
    expect(t.calls, hasLength(4));
  });

  test('a product copy without a campaign id (the promotion ended) is not counted', () async {
    final t = await _setup([engageDto('p1', price: 25)]);
    EngageStore.instance
      ..trackView(productOf('p1'))
      ..trackClick(productOf('p1'));
    await Future<void>.delayed(Duration.zero);
    expect(t.calls, isEmpty);
  });
}
