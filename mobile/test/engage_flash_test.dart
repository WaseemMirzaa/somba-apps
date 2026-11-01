// Flash sales: the countdown widget, the live store, the Deals screen, the Home section and the product page.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/screens/deals_screen.dart';
import 'package:lipcart/screens/home_screen.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/services/engage_store.dart';
import 'package:lipcart/services/feature_hooks.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/widgets/common.dart';
import 'package:lipcart/l10n/strings.dart';

import 'engage_helpers.dart';
import 'gap_helpers.dart';

Finder get _countdownText => find.byKey(const ValueKey('countdown-text'));

String _shown(WidgetTester tester) => tester.widget<Text>(_countdownText).data!;

/// Moves the fake clock and lets the widgets' one-second timers run.
Future<void> _tick(WidgetTester tester, Duration d) async {
  engageClock.advance(d);
  await tester.pump(d);
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });

  group('CountdownTo', () {
    Widget host(DateTime end, {VoidCallback? onEnd, bool boxed = false, String lang = 'en'}) =>
        gapApp(Scaffold(body: Center(child: CountdownTo(end: end, now: engageClock.call, onEnd: onEnd, boxed: boxed))), lang: lang);

    setUp(() => engageClock.t = DateTime.utc(2026, 10, 25, 12));

    testWidgets('shows hours:minutes:seconds and ticks every second', (tester) async {
      await tester.pumpWidget(host(engageClock.t.add(const Duration(hours: 2, minutes: 14, seconds: 9))));
      expect(_shown(tester), '02:14:09');
      await _tick(tester, const Duration(seconds: 1));
      expect(_shown(tester), '02:14:08');
      await _tick(tester, const Duration(seconds: 1));
      await _tick(tester, const Duration(seconds: 1));
      expect(_shown(tester), '02:14:06');
      await _tick(tester, const Duration(minutes: 1));
      expect(_shown(tester), '02:13:06');
    });

    testWidgets('calls onEnd once when the end is reached, then stays at zero', (tester) async {
      var ended = 0;
      await tester.pumpWidget(host(engageClock.t.add(const Duration(seconds: 3)), onEnd: () => ended++));
      expect(_shown(tester), '00:00:03');
      await _tick(tester, const Duration(seconds: 1));
      await _tick(tester, const Duration(seconds: 1));
      expect(_shown(tester), '00:00:01');
      expect(ended, 0);
      await _tick(tester, const Duration(seconds: 1));
      expect(_shown(tester), '00:00:00');
      expect(ended, 1);
      await _tick(tester, const Duration(seconds: 5));
      expect(ended, 1, reason: 'one call only, and the timer stopped');
      expect(_shown(tester), '00:00:00', reason: 'it never goes negative and never loops');
    });

    testWidgets('an end that has already passed calls onEnd right away', (tester) async {
      var ended = 0;
      await tester.pumpWidget(host(engageClock.t.subtract(const Duration(minutes: 5)), onEnd: () => ended++));
      await tester.pump();
      expect(ended, 1);
      expect(_shown(tester), '00:00:00');
    });

    testWidgets('days come first from one day up (English and French)', (tester) async {
      await tester.pumpWidget(host(engageClock.t.add(const Duration(days: 2, hours: 3, minutes: 14, seconds: 9))));
      expect(_shown(tester), '2d 03:14:09');
      await tester.pumpWidget(host(engageClock.t.add(const Duration(days: 2, hours: 3, minutes: 14, seconds: 9)), lang: 'fr'));
      await tester.pump();
      expect(_shown(tester), '2 j 03:14:09');
    });

    testWidgets('the time is worked out from the clock, not from counting ticks (app in the background)', (tester) async {
      await tester.pumpWidget(host(engageClock.t.add(const Duration(hours: 3))));
      expect(_shown(tester), '03:00:00');
      engageClock.advance(const Duration(hours: 1, minutes: 30)); // the timer did not run
      await tester.pump(const Duration(seconds: 1));
      expect(_shown(tester), '01:30:00');
      await _tick(tester, const Duration(seconds: 1));
      expect(_shown(tester), '01:29:59');
    });

    testWidgets('a new end date restarts it and re-arms onEnd', (tester) async {
      var ended = 0;
      Widget h(DateTime end) => host(end, onEnd: () => ended++);
      await tester.pumpWidget(h(engageClock.t.add(const Duration(seconds: 2))));
      await _tick(tester, const Duration(seconds: 2));
      expect(ended, 1);
      await tester.pumpWidget(h(engageClock.t.add(const Duration(minutes: 10))));
      expect(_shown(tester), '00:10:00');
      await _tick(tester, const Duration(minutes: 10));
      expect(ended, 2);
    });

    testWidgets('boxed: one cell for each part', (tester) async {
      await tester.pumpWidget(host(engageClock.t.add(const Duration(hours: 1, minutes: 2, seconds: 3)), boxed: true));
      expect(find.byKey(const ValueKey('countdown-boxes')), findsOneWidget);
      expect(find.text('01'), findsOneWidget);
      expect(find.text('02'), findsOneWidget);
      expect(find.text('03'), findsOneWidget);
      await _tick(tester, const Duration(seconds: 1));
      expect(find.text('02'), findsNWidgets(2));
    });
  });

  group('EngageStore: flash sales', () {
    setUp(() => engageReset(products: [engageDto('p1', price: 12, extra: {'originalPrice': 20, 'discount': 40, 'priceSource': 'flash'}), engageDto('p2')]));
    tearDown(engageTearDown);

    test('flashsales:list keeps the running sales and leaves out scheduled and ended ones', () async {
      await loadSales([
        flashJson('f1', 'p1'),
        flashJson('f2', 'p2', phase: 'scheduled'),
        flashJson('f3', 'p3', phase: 'ended'),
      ]);
      expect(EngageStore.instance.flashSales.map((s) => s.id), ['f1']);
      expect(EngageStore.instance.flashFor('p1')!.flashPrice, 12);
      expect(EngageStore.instance.flashFor('p2'), isNull);
    });

    test('the sale ending first comes first', () async {
      await loadSales([flashJson('late', 'p2', endsInMs: 9000000), flashJson('soon', 'p1', endsInMs: 60000)]);
      expect(EngageStore.instance.flashSales.map((s) => s.id), ['soon', 'late']);
    });

    test('a malformed row does not blank the others', () async {
      await loadSales([
        {'id': 7},
        flashJson('f1', 'p1')
      ]);
      expect(EngageStore.instance.flashSales.map((s) => s.id), ['f1']);
    });

    test('flashsale:updated adds a running sale, replaces one, and drops one that ended', () async {
      final store = EngageStore.instance;
      var changes = 0;
      store.addListener(() => changes++);
      RealtimeStore.instance.debugEmit('flashsale:updated', flashJson('f1', 'p1', endsInMs: 600000));
      expect(store.flashSales.single.endsAt, engageClock.t.add(const Duration(minutes: 10)));
      RealtimeStore.instance.debugEmit('flashsale:updated', flashJson('f1', 'p1', endsInMs: 1800000, flashPrice: 10));
      expect(store.flashSales.single.endsAt, engageClock.t.add(const Duration(minutes: 30)));
      expect(store.flashFor('p1')!.flashPrice, 10);
      RealtimeStore.instance.debugEmit('flashsale:updated', flashJson('f1', 'p1', phase: 'ended'));
      expect(store.flashSales, isEmpty);
      expect(changes, 3);
      // An update about a sale we never held and that is not running changes nothing.
      RealtimeStore.instance.debugEmit('flashsale:updated', flashJson('zzz', 'p2', phase: 'scheduled'));
      expect(changes, 3);
    });

    test('flashsale:removed takes the sale away by id (or by product when it has no id)', () async {
      await loadSales([flashJson('f1', 'p1'), flashJson('f2', 'p2')]);
      RealtimeStore.instance.debugEmit('flashsale:removed', {'id': 'f1', 'productId': 'p1'});
      expect(EngageStore.instance.flashSales.map((s) => s.id), ['f2']);
      RealtimeStore.instance.debugEmit('flashsale:removed', {'productId': 'p2'});
      expect(EngageStore.instance.flashSales, isEmpty);
      RealtimeStore.instance.debugEmit('flashsale:removed', 'junk'); // ignored
    });

    test('a sale is over when its end time passes, even if no push says so', () async {
      await loadSales([flashJson('f1', 'p1', endsInMs: 5000)]);
      expect(EngageStore.instance.flashSales, hasLength(1));
      engageClock.advance(const Duration(seconds: 5));
      expect(EngageStore.instance.flashSales, isEmpty);
    });

    test('expireSale (a countdown reached zero) removes the sale and tells the listeners', () async {
      await loadSales([flashJson('f1', 'p1')]);
      var changes = 0;
      EngageStore.instance.addListener(() => changes++);
      EngageStore.instance.expireSale('f1');
      expect(EngageStore.instance.flashSales, isEmpty);
      expect(changes, 1);
      EngageStore.instance.expireSale('f1');
      expect(changes, 1);
    });

    test('the module is wired in: its hook binds the pushes, hydrates after sign-in and resets on sign-out', () async {
      final hook = buildFeatureHooks().firstWhere((h) => h.name == 'engage');
      expect(hook.pushes.keys, containsAll(['flashsale:updated', 'flashsale:removed', 'store:vacation', 'question:created', 'question:updated']));
      RealtimeStore.instance.debugCallRequest = (event, [body]) async => event == 'flashsales:list' ? [flashJson('f1', 'p1')] : const <dynamic>[];
      await hook.hydrate!(RealtimeStore.instance);
      expect(EngageStore.instance.flashSales, hasLength(1));
      hook.reset!();
      expect(EngageStore.instance.flashSales, isEmpty);
    });

    test('a failing list call leaves the sales as they were (the hydrate swallows it)', () async {
      await loadSales([flashJson('f1', 'p1')]);
      RealtimeStore.instance.debugCallRequest = (event, [body]) async => throw StateError('offline');
      await expectLater(EngageStore.instance.loadFlashSales(), throwsA(isA<StateError>()));
      expect(EngageStore.instance.flashSales, hasLength(1));
    });
  });

  group('Deals screen', () {
    final catalogue = [
      engageDto('p1', price: 12, extra: {'originalPrice': 20, 'discount': 40, 'priceSource': 'flash'}),
      engageDto('p2', price: 80, extra: {'originalPrice': 100, 'discount': 20}),
      engageDto('p3', price: 10),
    ];
    setUp(() => engageReset(products: catalogue));
    tearDown(engageTearDown);

    testWidgets('without a running sale it is the normal deals page: no timer, no flash header', (tester) async {
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(DealsScreen(locale: const Locale('en'))));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-header')), findsNothing);
      expect(find.byKey(const ValueKey('countdown-boxes')), findsNothing);
      expect(find.byKey(const ValueKey('flash-timer')), findsNothing);
      expect(find.text('Item p1'), findsOneWidget, reason: 'the discounted products are still listed');
      expect(find.text('Item p2'), findsOneWidget);
      expect(find.text('Item p3'), findsNothing);
    });

    testWidgets('with a running sale: header, live countdown, the flash price and the crossed-out normal price', (tester) async {
      gapTallViewport(tester);
      await loadSales([flashJson('f1', 'p1', endsInMs: 2 * 3600000 + 14 * 60000 + 9000)]);
      await tester.pumpWidget(gapApp(DealsScreen(locale: const Locale('en'))));
      await tester.pump();
      expect(find.byKey(const ValueKey('deals-flash')), findsOneWidget);
      expect(find.text('Flash Sale'), findsOneWidget);
      expect(find.text('Ends in'), findsOneWidget);
      expect(find.text('Prices go back up when the timer ends.'), findsOneWidget);
      // The header counts down in boxes, the product card carries its own pill.
      expect(find.text('02'), findsOneWidget);
      expect(find.text('14'), findsOneWidget);
      expect(find.text('09'), findsNWidgets(1));
      expect(find.byKey(const ValueKey('flash-timer')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('flash-timer')), matching: find.text('02:14:09')), findsOneWidget);
      // Flash price, crossed-out normal price, discount.
      expect(find.text(r'$12'), findsWidgets);
      expect(find.text(r'$20'), findsOneWidget);
      expect(find.text('-40%'), findsOneWidget);
      // It is under "Flash Sale", not repeated in the other deals.
      expect(find.text('Item p1'), findsOneWidget);
      expect(find.text('More deals'), findsOneWidget);
      expect(find.text('Item p2'), findsOneWidget);
      await _tick(tester, const Duration(seconds: 2));
      expect(find.descendant(of: find.byKey(const ValueKey('flash-timer')), matching: find.text('02:14:07')), findsOneWidget);
      expect(find.text('07'), findsOneWidget);
    });

    testWidgets('the same page in French', (tester) async {
      gapTallViewport(tester);
      await engageReset(products: catalogue, lang: 'fr');
      await loadSales([flashJson('f1', 'p1', endsInMs: 3 * 86400000 + 3600000)]);
      await tester.pumpWidget(gapApp(DealsScreen(locale: const Locale('fr')), lang: 'fr'));
      await tester.pump();
      expect(find.text('Vente flash'), findsOneWidget);
      expect(find.text('Se termine dans'), findsOneWidget);
      expect(find.text('Les prix remontent à la fin du compte à rebours.'), findsOneWidget);
      expect(find.text('3 j'), findsOneWidget, reason: 'days cell in the header');
      expect(find.text('Autres offres'), findsOneWidget);
    });

    testWidgets('a sale that ends disappears without a restart, and the page goes back to the normal deals', (tester) async {
      gapTallViewport(tester);
      await loadSales([flashJson('f1', 'p1', endsInMs: 3000)]);
      await tester.pumpWidget(gapApp(DealsScreen(locale: const Locale('en'))));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-header')), findsOneWidget);
      await _tick(tester, const Duration(seconds: 1));
      await _tick(tester, const Duration(seconds: 1));
      expect(find.byKey(const ValueKey('flash-header')), findsOneWidget);
      await _tick(tester, const Duration(seconds: 1));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-header')), findsNothing);
      expect(find.byKey(const ValueKey('countdown-boxes')), findsNothing);
      expect(find.byKey(const ValueKey('flash-timer')), findsNothing);
      expect(EngageStore.instance.flashSales, isEmpty);
      expect(find.text('Item p1'), findsOneWidget, reason: 'its 40% still lists it as a normal deal');
    });

    testWidgets('with two sales the header counts to the one ending first, then to the next', (tester) async {
      gapTallViewport(tester);
      await loadSales([flashJson('late', 'p2', endsInMs: 3600000, flashPrice: 70, basePrice: 100, discount: 30), flashJson('soon', 'p1', endsInMs: 2000)]);
      await tester.pumpWidget(gapApp(DealsScreen(locale: const Locale('en'))));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-header-soon')), findsOneWidget);
      await _tick(tester, const Duration(seconds: 1));
      await _tick(tester, const Duration(seconds: 1));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-header-soon')), findsNothing);
      expect(find.byKey(const ValueKey('flash-header-late')), findsOneWidget);
      expect(find.text('59'), findsOneWidget, reason: 'the next sale has 59 minutes left');
    });

    testWidgets('flashsale:updated adds a sale while the page is open; flashsale:removed takes it away', (tester) async {
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(DealsScreen(locale: const Locale('en'))));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-header')), findsNothing);
      RealtimeStore.instance.debugEmit('flashsale:updated', flashJson('f1', 'p1', endsInMs: 600000));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-header')), findsOneWidget);
      expect(find.byKey(const ValueKey('flash-timer')), findsOneWidget);
      RealtimeStore.instance.debugEmit('flashsale:removed', {'id': 'f1', 'productId': 'p1'});
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-header')), findsNothing);
      expect(find.byKey(const ValueKey('flash-timer')), findsNothing);
    });

    testWidgets('a product:updated that flips the price shows on the card at once', (tester) async {
      gapTallViewport(tester);
      await loadSales([flashJson('f1', 'p1')]);
      pushProduct({
        'id': 'p1', 'name': 'Item p1', 'nameFr': 'Article p1', 'price': 20, 'originalPrice': 20, 'discount': 0, 'category': 'Electronics', 'image': '', 'stock': 5, //
      });
      await tester.pumpWidget(gapApp(DealsScreen(locale: const Locale('en'))));
      await tester.pump();
      expect(find.text(r'$20'), findsOneWidget, reason: 'before the flip: the normal price');
      // The server flips the price when the sale starts.
      pushProduct({
        'id': 'p1', 'name': 'Item p1', 'nameFr': 'Article p1', 'price': 12, 'originalPrice': 20, 'discount': 40, 'category': 'Electronics', 'image': '', 'stock': 5,
        'basePrice': 20, 'priceSource': 'flash', //
      });
      await tester.pump();
      expect(find.text(r'$12'), findsWidgets);
      expect(find.text('-40%'), findsOneWidget);
      expect(productByUuid('p1')!.price, 12);
    });

    testWidgets('a sale on a product that is not in the catalogue is not shown (no card without a product)', (tester) async {
      gapTallViewport(tester);
      await loadSales([flashJson('f1', 'gone')]);
      await tester.pumpWidget(gapApp(DealsScreen(locale: const Locale('en'))));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-header')), findsNothing);
    });
  });

  group('Home: flash sale section', () {
    setUp(() => engageReset(products: [
          engageDto('p1', price: 12, extra: {'originalPrice': 20, 'discount': 40, 'priceSource': 'flash'}),
          engageDto('p2', price: 80, extra: {'originalPrice': 100, 'discount': 20}),
        ]));
    tearDown(engageTearDown);

    testWidgets('there is no flash section and no timer when no sale is running', (tester) async {
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(HomeScreen(locale: const Locale('en'), onLocaleChanged: (_) {})));
      await tester.pump();
      expect(find.byKey(const ValueKey('home-flash')), findsNothing);
      expect(find.byKey(const ValueKey('countdown-boxes')), findsNothing);
      expect(find.text('Deals'), findsWidgets);
    });

    testWidgets('a running sale: the section with its live countdown; it goes away when the sale ends', (tester) async {
      gapTallViewport(tester);
      await loadSales([flashJson('f1', 'p1', endsInMs: 3000)]);
      await tester.pumpWidget(gapApp(HomeScreen(locale: const Locale('en'), onLocaleChanged: (_) {})));
      await tester.pump();
      expect(find.byKey(const ValueKey('home-flash')), findsOneWidget);
      expect(find.text('Flash Sale'), findsWidgets);
      expect(find.byKey(const ValueKey('countdown-boxes')), findsOneWidget);
      expect(find.byKey(const ValueKey('flash-timer')), findsOneWidget);
      await _tick(tester, const Duration(seconds: 1));
      expect(find.text('02'), findsWidgets);
      await _tick(tester, const Duration(seconds: 1));
      await _tick(tester, const Duration(seconds: 1));
      await tester.pump();
      expect(find.byKey(const ValueKey('home-flash')), findsNothing);
      expect(find.byKey(const ValueKey('flash-timer')), findsNothing);
    });
  });

  group('Product page: flash badge', () {
    setUp(() => engageReset(products: [engageDto('p1', price: 12, extra: {'originalPrice': 20, 'discount': 40, 'priceSource': 'flash'})]));
    tearDown(engageTearDown);

    testWidgets('"Flash sale · ends in 01:00:00" counts down and goes when the sale ends', (tester) async {
      gapTallViewport(tester);
      RealtimeStore.instance.debugCallRequest = (event, [body]) async => event == 'flashsales:list' ? [flashJson('f1', 'p1', endsInMs: 3000)] : const <dynamic>[];
      await EngageStore.instance.loadFlashSales();
      await tester.pumpWidget(gapApp(ProductDetailScreen(product: productOf('p1'), locale: const Locale('en'))));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-badge')), findsOneWidget);
      expect(find.text('Flash sale · ends in 00:00:03'), findsOneWidget);
      expect(find.text(r'$12'), findsWidgets);
      expect(find.text(r'$20'), findsOneWidget);
      await _tick(tester, const Duration(seconds: 1));
      expect(find.text('Flash sale · ends in 00:00:02'), findsOneWidget);
      await _tick(tester, const Duration(seconds: 1));
      await _tick(tester, const Duration(seconds: 1));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-badge')), findsNothing);
    });

    testWidgets('French wording', (tester) async {
      gapTallViewport(tester);
      await engageReset(products: [engageDto('p1', price: 12, extra: {'originalPrice': 20, 'discount': 40, 'priceSource': 'flash'})], lang: 'fr');
      await loadSales([flashJson('f1', 'p1', endsInMs: 3661000)]);
      await tester.pumpWidget(gapApp(ProductDetailScreen(product: productOf('p1'), locale: const Locale('fr')), lang: 'fr'));
      await tester.pump();
      expect(find.text('Vente flash · fin dans 01:01:01'), findsOneWidget);
    });

    testWidgets('no badge when no real sale exists (the generic flash pill stays for an unknown source)', (tester) async {
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(ProductDetailScreen(product: productOf('p1'), locale: const Locale('en'))));
      await tester.pump();
      expect(find.byKey(const ValueKey('flash-badge')), findsNothing);
      expect(find.byKey(const ValueKey('price-source')), findsOneWidget);
    });
  });

  test('strings used by the flash UI exist in both languages', () {
    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);
      expect(s.flashSale, isNotEmpty);
      expect(s.endsIn, isNotEmpty);
      expect(s.flashMoreDeals, isNotEmpty);
      expect(s.flashDealsHint, isNotEmpty);
    }
  });
}
