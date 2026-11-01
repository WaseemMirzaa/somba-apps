// Multi-seller orders: one cart, one payment, one delivery, but each seller packs (or cancels)
// their own lines. The customer sees the packages, who cancelled what and what was refunded.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/orders_screen.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/util/format.dart';
import 'package:shared_preferences/shared_preferences.dart';

ProductDto _dto(String id, String sellerId, String sellerName) => ProductDto.fromJson({
      'id': id,
      'name': 'Item $id',
      'nameFr': 'Article $id',
      'price': 20,
      'originalPrice': 20,
      'category': 'Electronics',
      'categoryFr': 'Électronique',
      'image': '',
      'stock': 5,
      'sellerId': sellerId,
      'sellerName': sellerName,
    });

Map<String, dynamic> _line(String id, String sellerId, String sellerName, {String fulfilment = 'open', String? reason, double refunded = 0}) => {
      'productId': id,
      'productName': 'Item $id',
      'variant': 'Default',
      'qty': 1,
      'priceUsd': 20,
      'sellerId': sellerId,
      'sellerName': sellerName,
      'fulfilment': fulfilment,
      'cancelReason': reason,
      'refundedUsd': refunded,
    };

OrderDto _order(String id, String status, List<Map<String, dynamic>> items, {String method = 'wallet'}) => OrderDto.fromJson({
      'id': id,
      'reference': 'SOM-$id',
      'customerName': 'Aline',
      'status': status,
      'paymentMethod': method,
      'subtotalUsd': 60,
      'deliveryFeeUsd': 3,
      'totalUsd': 63,
      'createdAt': '2026-10-01T09:30:00Z',
      'items': items,
    });

/// Two sellers: Boutique Kin has packed (ready); Mama Tech cancelled one of its two lines.
OrderDto _multi() => _order('multi', 'processing', [
      _line('p1', 's1', 'Boutique Kin', fulfilment: 'ready'),
      _line('p2', 's2', 'Mama Tech', fulfilment: 'cancelled', reason: 'Out of stock', refunded: 20),
      _line('p3', 's2', 'Mama Tech'),
    ]);

OrderDto _single() => _order('single', 'processing', [_line('p1', 's1', 'Boutique Kin')]);

Widget _app(Widget home, String lang) => MaterialApp(
      theme: AppTheme.light(),
      locale: Locale(lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      home: home,
    );

void main() {
  final overflows = <String>[];

  setUpAll(() async {
    await initializeDateFormatting();
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  setUp(() async {
    overflows.clear();
    SharedPreferences.setMockInitialValues({});
    await ShopState.instance.load();
    await Strings.setLang('en', persist: false);
    marketNotifier.value = MarketProfileId.france; // USD amounts
    final store = RealtimeStore.instance;
    store.products
      ..clear()
      ..addAll([_dto('p1', 's1', 'Boutique Kin'), _dto('p2', 's2', 'Mama Tech'), _dto('p3', 's2', 'Mama Tech')]);
    store.orders
      ..clear()
      ..addAll([_multi(), _single()]);
    store.hydrated = true;
    store.walletBalance = 100;
    store.debugCallRequest = (event, [body]) async => event == 'delivery:quote' ? {'feeUsd': 3, 'pinned': true} : const <dynamic>[];
    store.addresses
      ..clear()
      ..add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kinshasa', commune: 'Gombe', isDefault: true));
    ShopState.instance.cart.clear();
    ShopState.instance.appliedPromo = null;
  });

  tearDown(() {
    final store = RealtimeStore.instance;
    store.products.clear();
    store.orders.clear();
    store.addresses.clear();
    store.debugCallRequest = null;
    store.hydrated = false;
    store.walletBalance = 0;
    ShopState.instance.cart.clear();
    marketNotifier.value = MarketProfileId.drc;
  });

  Future<void> show(WidgetTester tester, Widget screen, String lang) async {
    final previous = FlutterError.onError;
    FlutterError.onError = (d) {
      if (d.exceptionAsString().contains('overflowed')) {
        overflows.add(d.exceptionAsString().split('\n').first);
      } else {
        previous?.call(d);
      }
    };
    addTearDown(() => FlutterError.onError = previous);
    tester.view.physicalSize = const Size(360 * 3, 740 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(screen, lang));
    await tester.pump(const Duration(milliseconds: 600));
  }

  group('parsing', () {
    test('new line fields are read', () {
      final i = OrderItemDto.fromJson({
        'productId': 'p',
        'productName': 'X',
        'qty': 2,
        'priceUsd': 5,
        'sellerId': 's9',
        'sellerName': 'Shop 9',
        'fulfilment': 'cancelled',
        'readyAt': '2026-10-01T10:00:00Z',
        'receivedAt': '2026-10-01T11:00:00Z',
        'cancelReason': 'Damaged',
        'refundedUsd': 10,
      });
      expect(i.sellerId, 's9');
      expect(i.sellerName, 'Shop 9');
      expect(i.fulfilment, 'cancelled');
      expect(i.isCancelled, isTrue);
      expect(i.readyAt, isNotNull);
      expect(i.receivedAt, isNotNull);
      expect(i.cancelReason, 'Damaged');
      expect(i.refundedUsd, 10);
    });

    test('missing keys fall back to null / open / 0', () {
      final i = OrderItemDto.fromJson({'productId': 'p', 'productName': 'X', 'qty': 1, 'priceUsd': 5});
      expect(i.sellerId, isNull);
      expect(i.sellerName, isNull);
      expect(i.fulfilment, 'open');
      expect(i.readyAt, isNull);
      expect(i.receivedAt, isNull);
      expect(i.cancelReason, isNull);
      expect(i.refundedUsd, 0);
      expect(i.isCancelled, isFalse);
    });
  });

  group('package grouping and status', () {
    test('lines are grouped by seller, in order', () {
      final pk = packagesOf(_multi());
      expect(pk.map((p) => p.sellerName), ['Boutique Kin', 'Mama Tech']);
      expect(pk.map((p) => p.items.length), [1, 2]);
      expect(pk.map((p) => p.status), ['ready', 'to_pack']);
    });

    test('old orders without sellers make a single package', () {
      final o = _order('old', 'delivered', [
        {'productId': 'a', 'productName': 'A', 'qty': 1, 'priceUsd': 1},
        {'productId': 'b', 'productName': 'B', 'qty': 1, 'priceUsd': 1},
      ]);
      final pk = packagesOf(o);
      expect(pk, hasLength(1));
      expect(pk.single.sellerName, isNull);
      expect(pk.single.items, hasLength(2));
    });

    String statusOf(String orderStatus, List<String> fulfilments, {String method = 'wallet'}) {
      final o = _order('x', orderStatus, [for (var i = 0; i < fulfilments.length; i++) _line('p$i', 's1', 'S', fulfilment: fulfilments[i])], method: method);
      return packageStatusOf(o, o.items);
    }

    test('all lines cancelled, or the order cancelled, is cancelled', () {
      expect(statusOf('processing', ['cancelled', 'cancelled']), 'cancelled');
      expect(statusOf('cancelled', ['open']), 'cancelled');
    });

    test('an unpaid pending order that is not cash on delivery is pending', () {
      expect(statusOf('pending', ['open']), 'pending');
      expect(statusOf('pending', ['open'], method: 'cod'), 'to_pack');
    });

    test('open lines are to pack; ready and received mix is ready', () {
      expect(statusOf('processing', ['open', 'ready']), 'to_pack');
      expect(statusOf('processing', ['ready', 'ready']), 'ready');
      expect(statusOf('processing', ['ready', 'received']), 'ready');
      expect(statusOf('processing', ['ready', 'cancelled']), 'ready');
    });

    test('everything at the hub follows the order status once it ships', () {
      expect(statusOf('processing', ['received', 'received']), 'at_hub');
      expect(statusOf('confirmed', ['received']), 'at_hub');
      expect(statusOf('shipped', ['received']), 'shipped');
      expect(statusOf('out_for_delivery', ['received', 'cancelled']), 'out_for_delivery');
      expect(statusOf('delivered', ['received']), 'delivered');
      expect(statusOf('returned', ['received']), 'returned');
    });

    test('order totals helpers', () {
      final o = _multi();
      expect(o.cancelledLineCount, 1);
      expect(o.refundedUsd, 20);
    });
  });

  for (final lang in ['en', 'fr']) {
    final s = Strings(lang);

    group('order detail ($lang)', () {
      setUp(() => Strings.setLang(lang, persist: false));

      testWidgets('shows one block per seller with its own progress', (tester) async {
        await show(tester, OrderDetailScreen(locale: Locale(lang), orderId: 'multi'), lang);
        expect(find.text(s.orderPackageOf(1, 2, 'Boutique Kin')), findsOneWidget);
        expect(find.text(s.orderPackageOf(2, 2, 'Mama Tech')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('package-status-1')), matching: find.text(s.pkgStatusReady)), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('package-status-2')), matching: find.text(s.pkgStatusToPack)), findsOneWidget);
        expect(find.byKey(const ValueKey('order-sold-by')), findsNothing, reason: 'grouped view replaces the single line');
        expect(overflows, isEmpty);
      });

      testWidgets('a cancelled line is struck through with the reason and the refund', (tester) async {
        await show(tester, OrderDetailScreen(locale: Locale(lang), orderId: 'multi'), lang);
        final name = tester.widget<Text>(find.text('Item p2'));
        expect(name.style?.decoration, TextDecoration.lineThrough);
        expect(find.text(s.lineCancelledReason('Out of stock')), findsOneWidget);
        expect(find.text(s.lineRefundedWallet(money(20))), findsOneWidget);
        // Live lines are not struck through.
        expect(tester.widget<Text>(find.text('Item p1')).style?.decoration, isNot(TextDecoration.lineThrough));
        expect(overflows, isEmpty);
      });

      testWidgets('totals get a Refunded row only when something was refunded', (tester) async {
        await show(tester, OrderDetailScreen(locale: Locale(lang), orderId: 'multi'), lang);
        await tester.scrollUntilVisible(find.byKey(const ValueKey('order-refunded-row')), 200, scrollable: find.byType(Scrollable).first);
        expect(find.byKey(const ValueKey('order-refunded-row')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('order-refunded-row')), matching: find.text(money(20))), findsOneWidget);

        await show(tester, OrderDetailScreen(locale: Locale(lang), orderId: 'single'), lang);
        await tester.drag(find.byType(ListView), const Offset(0, -600));
        await tester.pump();
        expect(find.byKey(const ValueKey('order-refunded-row')), findsNothing);
      });

      testWidgets('a single-seller order keeps the plain list with "Sold by" once', (tester) async {
        await show(tester, OrderDetailScreen(locale: Locale(lang), orderId: 'single'), lang);
        expect(find.text(s.soldBy('Boutique Kin')), findsOneWidget);
        expect(find.byKey(const ValueKey('order-package-1')), findsNothing);
        expect(overflows, isEmpty);
      });
    });

    group('cart, checkout and list ($lang)', () {
      setUp(() => Strings.setLang(lang, persist: false));

      testWidgets('cart shows "Sold by" under each line and keeps lines from several sellers', (tester) async {
        final shop = ShopState.instance;
        shop.addToCart(productByUuid('p1')!);
        shop.addToCart(productByUuid('p2')!);
        expect(shop.cart, hasLength(2), reason: 'adding from another seller never clears the cart');
        await show(tester, CartScreen(locale: Locale(lang)), lang);
        expect(find.text(s.soldBy('Boutique Kin')), findsOneWidget);
        expect(find.text(s.soldBy('Mama Tech')), findsOneWidget);
        expect(overflows, isEmpty);
      });

      testWidgets('checkout shows "Sold by" and the one-delivery note for 2+ sellers', (tester) async {
        final shop = ShopState.instance;
        shop.addToCart(productByUuid('p1')!);
        shop.addToCart(productByUuid('p2')!);
        shop.addToCart(productByUuid('p3')!);
        await show(tester, CheckoutScreen(locale: Locale(lang)), lang);
        await tester.drag(find.byType(ListView), const Offset(0, -3000));
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.text(s.soldBy('Boutique Kin')), findsOneWidget);
        expect(find.text(s.soldBy('Mama Tech')), findsNWidgets(2));
        expect(find.text(s.checkoutOneDelivery(2)), findsOneWidget);
        expect(overflows, isEmpty);
      });

      testWidgets('checkout shows no seller-count note for a single seller', (tester) async {
        final shop = ShopState.instance;
        shop.addToCart(productByUuid('p2')!);
        shop.addToCart(productByUuid('p3')!);
        await show(tester, CheckoutScreen(locale: Locale(lang)), lang);
        await tester.drag(find.byType(ListView), const Offset(0, -3000));
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.byKey(const ValueKey('checkout-sellers-note')), findsNothing);
        expect(find.text(s.soldBy('Mama Tech')), findsNWidgets(2));
      });

      testWidgets('the order list hints at cancelled items only on orders that are not cancelled', (tester) async {
        RealtimeStore.instance.orders.add(_order('gone', 'cancelled', [_line('p1', 's1', 'Boutique Kin', fulfilment: 'cancelled', refunded: 20)]));
        await show(tester, OrdersScreen(locale: Locale(lang)), lang);
        expect(find.byKey(const ValueKey('order-cancelled-hint-SOM-multi')), findsOneWidget);
        expect(find.text(s.ordersCancelledOne), findsOneWidget);
        expect(find.byKey(const ValueKey('order-cancelled-hint-SOM-single')), findsNothing);
        expect(find.byKey(const ValueKey('order-cancelled-hint-SOM-gone')), findsNothing);
        expect(overflows, isEmpty);
      });
    });
  }
}
