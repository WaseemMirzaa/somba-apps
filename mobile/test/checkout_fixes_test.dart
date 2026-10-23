// The checkout / cart bugs of docs/CUSTOMER-APP-GAP-ANALYSIS.md §0 (B1–B5): every "Place order" tap
// either sends the order or says why not, the zone shown is the zone sent, verifying from the prompt
// carries on with the order, iOS reaches the local API by default, and the cart never exceeds stock.
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/env.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/util/format.dart';
import 'package:lipcart/widgets/verify_prompt.dart';
import 'package:shared_preferences/shared_preferences.dart';

ProductDto _dto(String id, {int stock = 5, double price = 20}) => ProductDto.fromJson({
      'id': id,
      'name': 'Item $id',
      'nameFr': 'Article $id',
      'price': price,
      'originalPrice': price,
      'category': 'Electronics',
      'categoryFr': 'Électronique',
      'image': '',
      'stock': stock,
    });

BackendUser _user({bool verified = true, String phone = ''}) => BackendUser.fromJson({
      'id': 'u1',
      'email': 'customer@somba.app',
      'name': 'Aline',
      'role': 'customer',
      'phone': phone,
      'phoneVerified': verified,
      'emailVerified': verified,
    });

const _zones = [
  Zone(id: 'zone-gombe', name: 'Gombe', nameFr: 'Gombe', city: 'Kinshasa', deliveryFeeUsd: 3),
  Zone(id: 'zone-limete', name: 'Limete', nameFr: 'Limete', city: 'Kinshasa', deliveryFeeUsd: 5),
];

Widget _app(Widget home, {String lang = 'en'}) => MaterialApp(
      theme: AppTheme.light(),
      locale: Locale(lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      home: home,
    );

/// Every `orders:create` the checkout sent, answered like the server would (a confirmed wallet order).
final _sent = <Map<String, dynamic>>[];
Object? _nextFailure;

Future<dynamic> _fakeServer(String event, [Map<String, dynamic>? body]) async {
  _sent.add(body!);
  final failure = _nextFailure;
  _nextFailure = null;
  if (failure != null) throw failure;
  return {'id': 'o-${_sent.length}', 'reference': 'SOM-${_sent.length}', 'status': 'confirmed', 'paymentMethod': body['paymentMethod'], 'items': const []};
}

void main() {
  setUpAll(() => initializeDateFormatting());

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await ShopState.instance.load();
    await Strings.setLang('en', persist: false);
    marketNotifier.value = MarketProfileId.france; // USD amounts
    _sent.clear();
    _nextFailure = null;
    final store = RealtimeStore.instance;
    store.products
      ..clear()
      ..addAll([_dto('p1'), _dto('p2', stock: 2)]);
    store.hydrated = true;
    store.user = _user();
    store.requireVerifiedForCheckout = false;
    store.walletBalance = 1000;
    store.zones = List.of(_zones);
    store.addresses
      ..clear()
      ..add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kinshasa', commune: 'Gombe', isDefault: true));
    store.debugPlaceOrderRequest = _fakeServer;
    final shop = ShopState.instance;
    shop.cart.clear();
    shop.stockNotices.clear();
    shop.selectedZoneId = null;
    shop.appliedPromo = null;
  });

  tearDown(() {
    final store = RealtimeStore.instance;
    store.products.clear();
    store.addresses.clear();
    store.zones = [];
    store.user = null;
    store.hydrated = false;
    store.walletBalance = 0;
    store.requireVerifiedForCheckout = false;
    store.debugPlaceOrderRequest = null;
    ShopState.instance.cart.clear();
    ShopState.instance.stockNotices.clear();
    marketNotifier.value = MarketProfileId.drc;
  });

  // Tall viewport: the whole checkout (address, zone, delivery time, payment) is built, so the tests reach every control.
  Future<void> openCheckout(WidgetTester tester, {String lang = 'en'}) async {
    tester.view.physicalSize = const Size(390 * 3, 1500 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(_app(CheckoutScreen(locale: Locale(lang)), lang: lang));
    await tester.pump(const Duration(milliseconds: 300));
  }

  Future<void> placeOrder(WidgetTester tester) async {
    await tester.tap(find.byKey(const ValueKey('place-order')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  group('B1 · Place order with a missing mobile-money number', () {
    for (final lang in ['en', 'fr']) {
      testWidgets('says why next to the button and brings the phone field into focus ($lang)', (tester) async {
        await Strings.setLang(lang, persist: false);
        final s = Strings(lang);
        ShopState.instance.addToCart(productByUuid('p1')!);
        await openCheckout(tester, lang: lang);
        // Airtel Money is the default method and the account has no phone: the number is empty.
        // Scrolled down to the summary, the way a shopper reaches the pinned button.
        await tester.drag(find.byType(ListView), const Offset(0, -2000));
        await tester.pump(const Duration(milliseconds: 300));
        await placeOrder(tester);

        expect(_sent, isEmpty, reason: 'nothing goes to the server');
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.checkoutFixPhone)), findsOneWidget);
        expect(find.text(s.mmInvalid), findsOneWidget, reason: 'the inline error stays as well');
        final field = tester.widget<TextField>(find.byKey(const ValueKey('mm-phone')));
        expect(field.focusNode!.hasFocus, isTrue);
        expect(tester.getRect(find.byKey(const ValueKey('mm-phone'))).top, greaterThanOrEqualTo(0), reason: 'scrolled back into view');
      });
    }

    testWidgets('an invalid number shows the validation text in the snackbar', (tester) async {
      ShopState.instance.addToCart(productByUuid('p1')!);
      await openCheckout(tester);
      await tester.enterText(find.byKey(const ValueKey('mm-phone')), '12');
      await placeOrder(tester);
      expect(_sent, isEmpty);
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text(const Strings('en').mmInvalid)), findsOneWidget);
    });

    testWidgets('a valid number places the order', (tester) async {
      ShopState.instance.addToCart(productByUuid('p1')!);
      await openCheckout(tester);
      await tester.enterText(find.byKey(const ValueKey('mm-phone')), '+243 81 234 5678');
      await placeOrder(tester);
      expect(_sent, hasLength(1));
      expect(_sent.single['paymentPhone'], '+243 81 234 5678');
    });
  });

  group('B2 · the zone sent is the address\'s zone', () {
    testWidgets('a Gombe address sends the Gombe zone and its fee', (tester) async {
      ShopState.instance.addToCart(productByUuid('p1')!);
      await openCheckout(tester);
      await tester.tap(find.byKey(const ValueKey('pay-wallet')));
      await tester.pump();
      await placeOrder(tester);
      expect(_sent, hasLength(1));
      expect(_sent.single['zoneId'], 'zone-gombe');
      expect(_sent.single['deliveryFeeUsd'], 3);
      expect(_sent.single['shippingAddress'], contains('"zone":"zone-gombe"'));
    });

    testWidgets('a stale saved zone is replaced by the address\'s zone, never sent', (tester) async {
      ShopState.instance.selectedZoneId = 'zone-that-was-removed';
      ShopState.instance.addToCart(productByUuid('p1')!);
      await openCheckout(tester);
      await tester.tap(find.byKey(const ValueKey('pay-wallet')));
      await tester.pump();
      await placeOrder(tester);
      expect(_sent.single['zoneId'], 'zone-gombe');
    });

    testWidgets('a Limete address sends the Limete zone and its fee', (tester) async {
      RealtimeStore.instance.addresses
        ..clear()
        ..add(AddressDto(id: 'a2', label: 'Office', line1: '5 Boulevard du 30 Juin', city: 'Kinshasa', commune: 'Limete', isDefault: true));
      ShopState.instance.addToCart(productByUuid('p1')!);
      await openCheckout(tester);
      await tester.tap(find.byKey(const ValueKey('pay-wallet')));
      await tester.pump();
      await placeOrder(tester);
      expect(_sent.single['zoneId'], 'zone-limete');
      expect(_sent.single['deliveryFeeUsd'], 5);
    });
  });

  group('B3 · verifying from the checkout prompt', () {
    Future<void> pickEmailAndVerify(WidgetTester tester) async {
      await tester.tap(find.byKey(const ValueKey('verify-email-btn')));
      await tester.pumpAndSettle();
      // The email screen reports success the way it does after "I've verified": pop(true) with the profile refreshed.
      RealtimeStore.instance.user = _user(verified: true);
      tester.state<NavigatorState>(find.byType(Navigator)).pop(true);
      await tester.pumpAndSettle();
    }

    testWidgets('the order is placed right after verification (app-side check)', (tester) async {
      RealtimeStore.instance
        ..user = _user(verified: false)
        ..requireVerifiedForCheckout = true;
      ShopState.instance.addToCart(productByUuid('p1')!);
      await openCheckout(tester);
      await tester.tap(find.byKey(const ValueKey('pay-wallet')));
      await tester.pump();
      await placeOrder(tester);
      expect(find.byKey(const ValueKey('verify-prompt')), findsOneWidget);
      expect(_sent, isEmpty);
      await pickEmailAndVerify(tester);
      expect(_sent, hasLength(1), reason: 'no second tap needed');
      expect(ShopState.instance.cart, isEmpty, reason: 'the order now owns the lines');
    });

    testWidgets('the order is retried after the server refused an unverified account', (tester) async {
      // The app thought the account was fine (stale profile); the server says otherwise.
      _nextFailure = ApiException('Verify your phone number or email address first: open Profile > Verification, confirm a code or link, then try again.');
      ShopState.instance.addToCart(productByUuid('p1')!);
      await openCheckout(tester);
      await tester.tap(find.byKey(const ValueKey('pay-wallet')));
      await tester.pump();
      await placeOrder(tester);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('verify-prompt')), findsOneWidget);
      await pickEmailAndVerify(tester);
      expect(_sent, hasLength(2), reason: 'refused once, then placed');
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('"Later" says why nothing happened ($lang)', (tester) async {
        await Strings.setLang(lang, persist: false);
        final s = Strings(lang);
        RealtimeStore.instance
          ..user = _user(verified: false)
          ..requireVerifiedForCheckout = true;
        ShopState.instance.addToCart(productByUuid('p1')!);
        await openCheckout(tester, lang: lang);
        await tester.tap(find.byKey(const ValueKey('pay-wallet')));
        await tester.pump();
        await placeOrder(tester);
        await tester.tap(find.text(s.verifyLater));
        await tester.pumpAndSettle();
        expect(_sent, isEmpty);
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.verifyLaterNote)), findsOneWidget);
      });
    }

    testWidgets('backing out of the verify screen without verifying does not place the order', (tester) async {
      RealtimeStore.instance
        ..user = _user(verified: false)
        ..requireVerifiedForCheckout = true;
      var result = true;
      await tester.pumpWidget(_app(Builder(
          builder: (ctx) => Scaffold(body: TextButton(onPressed: () async => result = await ensureVerified(ctx, forTopUp: false), child: const Text('go'))))));
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('verify-email-btn')));
      await tester.pumpAndSettle();
      tester.state<NavigatorState>(find.byType(Navigator)).pop();
      await tester.pumpAndSettle();
      expect(result, isFalse);
      expect(find.text(const Strings('en').verifyLaterNote), findsOneWidget);
    });
  });

  group('B4 · default API host', () {
    test('Android emulator uses 10.0.2.2, iOS simulator / desktop / web use localhost', () {
      expect(Env.defaultUrlFor(TargetPlatform.android), 'http://10.0.2.2:3001');
      expect(Env.defaultUrlFor(TargetPlatform.iOS), 'http://localhost:3001');
      expect(Env.defaultUrlFor(TargetPlatform.macOS), 'http://localhost:3001');
      expect(Env.defaultUrlFor(TargetPlatform.android, web: true), 'http://localhost:3001');
    });

    test('without --dart-define the running platform picks the default, and the socket follows the API', () {
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      expect(Env.apiUrl, 'http://localhost:3001');
      expect(Env.socketUrl, Env.apiUrl);
    });
  });

  group('B5 · the cart never exceeds stock', () {
    test('adding the same product again is capped at the stock left', () {
      final shop = ShopState.instance;
      final p = productByUuid('p2')!; // stock 2
      expect(shop.addToCart(p), 1);
      expect(shop.addToCart(p, qty: 5), 1, reason: 'only one more unit exists');
      expect(shop.addToCart(p), 0);
      expect(shop.cart.single.qty, 2);
    });

    test('a sold-out product is not added at all', () {
      RealtimeStore.instance.products.add(_dto('p0', stock: 0));
      expect(ShopState.instance.addToCart(productByUuid('p0')!), 0);
      expect(ShopState.instance.cart, isEmpty);
    });

    test('sync drops lines whose stock fell to 0 and reduces lines above the stock, with a notice each', () {
      final shop = ShopState.instance;
      shop.addToCart(productByUuid('p1')!, qty: 4);
      shop.addToCart(productByUuid('p2')!, qty: 2);
      final store = RealtimeStore.instance;
      store.products
        ..clear()
        ..addAll([_dto('p1', stock: 3), _dto('p2', stock: 0)]);
      shop.syncWithCatalog();
      expect(shop.cart.map((c) => (c.product.uuid, c.qty)), [('p1', 3)]);
      expect(shop.takeStockNotices(), [
        const Strings('en').cartQtyReduced(3, 'Item p1'),
        const Strings('en').cartSoldOutRemoved('Item p2'),
      ]);
      expect(shop.stockNotices, isEmpty, reason: 'shown once');
      shop.syncWithCatalog();
      expect(shop.stockNotices, isEmpty, reason: 'nothing new to report');
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('the cart shows which line was removed, until dismissed ($lang)', (tester) async {
        await Strings.setLang(lang, persist: false);
        final s = Strings(lang);
        final shop = ShopState.instance;
        shop.addToCart(productByUuid('p1')!);
        shop.addToCart(productByUuid('p2')!);
        RealtimeStore.instance.products
          ..clear()
          ..addAll([_dto('p1'), _dto('p2', stock: 0)]);
        await tester.pumpWidget(_app(CartScreen(locale: Locale(lang)), lang: lang));
        await tester.pump();
        expect(find.byKey(const ValueKey('cart-stock-notice')), findsOneWidget);
        expect(find.text(s.cartSoldOutRemoved(lang == 'fr' ? 'Article p2' : 'Item p2')), findsOneWidget);
        expect(shop.cart.map((c) => c.product.uuid), ['p1']);
        await tester.tap(find.byKey(const ValueKey('cart-stock-notice-close')));
        await tester.pump();
        expect(find.byKey(const ValueKey('cart-stock-notice')), findsNothing);
      });
    }

    testWidgets('the notice stays visible when the last line sold out', (tester) async {
      ShopState.instance.addToCart(productByUuid('p2')!);
      RealtimeStore.instance.products
        ..clear()
        ..add(_dto('p2', stock: 0));
      await tester.pumpWidget(_app(const CartScreen(locale: Locale('en'))));
      await tester.pump();
      expect(find.text(const Strings('en').cartEmpty), findsOneWidget);
      expect(find.byKey(const ValueKey('cart-stock-notice')), findsOneWidget);
    });
  });
}
