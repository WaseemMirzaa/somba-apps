// The cart, checkout and order summaries grouped by store (one section per seller, with its subtotal), the order
// confirmation when one checkout is packed by several stores, and the search box on a store page.
// Every new text is checked in English AND French, and the screens in French at a large text size.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/promos.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/messages.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/more/shop_extra.dart';
import 'package:lipcart/screens/order_success_screen.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/format.dart';

import 'button_rules.dart';
import 'engage_helpers.dart';
import 'gap_helpers.dart';

ProductDto _p(String id, String name, String nameFr, double price, String sellerId, String sellerName, {String category = 'Electronics'}) => ProductDto.fromJson({
      'id': id,
      'name': name,
      'nameFr': nameFr,
      'price': price,
      'originalPrice': price,
      'category': category,
      'categoryFr': category == 'Shoes' ? 'Chaussures' : 'Électronique',
      'image': '',
      'stock': 20,
      'sellerId': sellerId,
      'sellerName': sellerName,
    });

/// Boutique Kin (s1): a phone (20) and a cable (10). Mama Tech (s2): a pair of shoes (30).
List<ProductDto> _catalog() => [
      _p('p1', 'Red Phone', 'Téléphone rouge', 20, 's1', 'Boutique Kin'),
      _p('p2', 'USB Cable', 'Câble USB', 10, 's1', 'Boutique Kin'),
      _p('p3', 'Blue Shoes', 'Chaussures bleues', 30, 's2', 'Mama Tech Électronique Centre', category: 'Shoes'),
    ];

Map<String, dynamic> _line(String id, String name, double price, int qty, String sellerId, String sellerName) => {
      'productId': id,
      'productName': name,
      'variant': 'Default',
      'qty': qty,
      'priceUsd': price,
      'sellerId': sellerId,
      'sellerName': sellerName,
      'fulfilment': 'open',
      'refundedUsd': 0,
    };

OrderDto _order(String id, List<Map<String, dynamic>> items) => OrderDto.fromJson({
      'id': id,
      'reference': 'SOM-$id',
      'customerName': 'Aline',
      'status': 'processing',
      'paymentMethod': 'wallet',
      'subtotalUsd': 80,
      'deliveryFeeUsd': 3,
      'totalUsd': 83,
      'createdAt': '2026-10-01T09:30:00Z',
      'items': items,
    });

/// The id the cart screen puts in its widget keys (`remove-<id>`).
String _id(String uuid) => '${productByUuid(uuid)!.id}';

void _fillCart() {
  final shop = ShopState.instance;
  shop.addToCart(productByUuid('p1')!, qty: 2); // Boutique Kin 40
  shop.addToCart(productByUuid('p3')!); // Mama Tech 30
  shop.addToCart(productByUuid('p2')!); // Boutique Kin 10 (added later: still grouped under its store)
}

final _overflows = <String>[];
void Function(FlutterErrorDetails)? _previousOnError;

/// Fails (listing them) when a layout overflow was reported; puts the framework's error handler back first.
void _expectNoOverflow() {
  FlutterError.onError = _previousOnError;
  expect(_overflows, isEmpty, reason: _overflows.join('\n'));
}


Future<void> _show(WidgetTester tester, Widget screen, {String lang = 'en', double scale = 1, bool phone = false}) async {
  final previous = FlutterError.onError;
  _previousOnError = previous;
  FlutterError.onError = (d) {
    if (d.exceptionAsString().contains('overflowed')) {
      _overflows.add(d.toString().split('\n').where((l) => l.contains('overflowed') || l.contains('creator') || l.contains('→') || l.contains('Row') || l.contains('Text(')).take(8).join(' / '));
    } else {
      previous?.call(d);
    }
  };
  addTearDown(() => FlutterError.onError = previous);
  if (phone) {
    tester.view.physicalSize = const Size(360 * 3, 740 * 3);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
  } else {
    gapTallViewport(tester);
  }
  await tester.pumpWidget(gapAppScaled(screen, lang: lang, scale: scale));
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 400));
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });

  setUp(() async {
    _overflows.clear();
    await engageReset(products: _catalog());
    RealtimeStore.instance.debugCallRequest = gapCalls();
    RealtimeStore.instance.addresses
      ..clear()
      ..add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kinshasa', commune: 'Gombe', isDefault: true));
  });
  tearDown(engageTearDown);

  for (final lang in ['en', 'fr']) {
    final s = Strings(lang);

    group('cart grouped by store ($lang)', () {
      setUp(() => Strings.setLang(lang, persist: false));

      testWidgets('one section per store with its lines and subtotal; the summary keeps the overall totals', (tester) async {
        _fillCart();
        await _show(tester, CartScreen(locale: Locale(lang)), lang: lang);

        final kin = find.byKey(const ValueKey('cart-store-s1'));
        final mama = find.byKey(const ValueKey('cart-store-s2'));
        expect(kin, findsOneWidget);
        expect(mama, findsOneWidget);
        // Header: the store's name and its unit count.
        expect(find.descendant(of: kin, matching: find.text('Boutique Kin')), findsOneWidget);
        expect(find.descendant(of: kin, matching: find.text(s.storeItems(3))), findsOneWidget);
        expect(find.descendant(of: mama, matching: find.text('Mama Tech Électronique Centre')), findsOneWidget);
        expect(find.descendant(of: mama, matching: find.text(s.storeItems(1))), findsOneWidget);
        // The lines sit under their own store, whatever order they were added in.
        expect(find.descendant(of: kin, matching: find.text(lang == 'fr' ? 'Téléphone rouge' : 'Red Phone')), findsOneWidget);
        expect(find.descendant(of: kin, matching: find.text(lang == 'fr' ? 'Câble USB' : 'USB Cable')), findsOneWidget);
        expect(find.descendant(of: mama, matching: find.text(lang == 'fr' ? 'Chaussures bleues' : 'Blue Shoes')), findsOneWidget);
        expect(find.descendant(of: kin, matching: find.text(lang == 'fr' ? 'Chaussures bleues' : 'Blue Shoes')), findsNothing);
        // Per-store subtotals.
        expect(find.descendant(of: kin, matching: find.text(s.storeSubtotal)), findsOneWidget);
        expect(find.byKey(const ValueKey('cart-store-subtotal-s1')), findsOneWidget);
        expect(tester.widget<Text>(find.byKey(const ValueKey('cart-store-subtotal-s1'))).data, money(50));
        expect(tester.widget<Text>(find.byKey(const ValueKey('cart-store-subtotal-s2'))).data, money(30));
        // The summary bar still shows the whole cart: subtotal 80, delivery from the quote (3), total 83.
        expect(find.text(money(80)), findsOneWidget);
        expect(find.text(money(83)), findsOneWidget);
        expect(find.text('${s.checkout}  ·  ${money(83)}'), findsOneWidget);
        // No repeated "Sold by" line: the header says it.
        expect(find.text(s.soldBy('Boutique Kin')), findsNothing);
        _expectNoOverflow();
        expectButtonRules(tester);
      });

      testWidgets('quantity and remove work inside a section and move that store\'s subtotal and the totals', (tester) async {
        _fillCart();
        await _show(tester, CartScreen(locale: Locale(lang)), lang: lang);
        final shop = ShopState.instance;

        // +1 on the cable (Boutique Kin): the store goes from 50 to 60, the cart from 80 to 90.
        await tester.tap(find.descendant(of: find.byKey(ValueKey('${_id('p2')}-Default')), matching: find.byIcon(Icons.add_rounded)));
        await tester.pump();
        expect(shop.cart.firstWhere((c) => c.product.uuid == 'p2').qty, 2);
        expect(tester.widget<Text>(find.byKey(const ValueKey('cart-store-subtotal-s1'))).data, money(60));
        expect(find.text(money(90)), findsOneWidget);

        // Remove Mama Tech's only line: its whole section disappears, with an Undo.
        await tester.tap(find.byKey(ValueKey('remove-${_id('p3')}')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.byKey(const ValueKey('cart-store-s2')), findsNothing);
        expect(find.byKey(const ValueKey('cart-store-s1')), findsOneWidget);
        expect(find.text(s.cartRemoved(lang == 'fr' ? 'Chaussures bleues' : 'Blue Shoes')), findsOneWidget);
        expect(find.text(money(60)), findsNWidgets(2), reason: 'store subtotal and cart subtotal are both 60 now');
        await tester.tap(find.text(s.undo));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.byKey(const ValueKey('cart-store-s2')), findsOneWidget);
        expect(find.text(money(90)), findsOneWidget);
        _expectNoOverflow();
      });

      testWidgets('a coupon still reduces the total, and the store sections are untouched', (tester) async {
        _fillCart();
        ShopState.instance.appliedPromo = AppliedPromo(code: 'SAVE10', discountUsd: 10, forSubtotal: 80);
        await _show(tester, CartScreen(locale: Locale(lang)), lang: lang);
        expect(find.text('- ${money(10)}'), findsOneWidget);
        expect(find.text('${s.checkout}  ·  ${money(73)}'), findsOneWidget);
        expect(tester.widget<Text>(find.byKey(const ValueKey('cart-store-subtotal-s1'))).data, money(50));
        expect(tester.widget<Text>(find.byKey(const ValueKey('cart-store-subtotal-s2'))).data, money(30));
      });

      testWidgets('lines whose listing has no seller get an "Other items" section', (tester) async {
        RealtimeStore.instance.products.add(gapDto('p9'));
        ShopState.instance.addToCart(productByUuid('p9')!);
        await _show(tester, CartScreen(locale: Locale(lang)), lang: lang);
        expect(find.descendant(of: find.byKey(const ValueKey('cart-store-')), matching: find.text(s.storeOtherItems)), findsOneWidget);
      });

      testWidgets('French / large text: no overflow on a small phone', (tester) async {
        _fillCart();
        await _show(tester, CartScreen(locale: Locale(lang)), lang: lang, scale: 1.6, phone: true);
        _expectNoOverflow();
      });
    });

    group('checkout and order summaries per store ($lang)', () {
      setUp(() => Strings.setLang(lang, persist: false));

      testWidgets('checkout lists each store with its lines and subtotal, then the overall totals', (tester) async {
        _fillCart();
        await _show(tester, CheckoutScreen(locale: Locale(lang)), lang: lang);
        await tester.drag(find.byType(ListView), const Offset(0, -3000));
        await tester.pump(const Duration(milliseconds: 300));
        final kin = find.byKey(const ValueKey('checkout-store-s1'));
        final mama = find.byKey(const ValueKey('checkout-store-s2'));
        expect(find.byKey(const ValueKey('checkout-store-name-s1')), findsOneWidget);
        expect(find.descendant(of: kin, matching: find.text('Boutique Kin')), findsOneWidget);
        expect(find.descendant(of: mama, matching: find.text('Mama Tech Électronique Centre')), findsOneWidget);
        expect(find.descendant(of: kin, matching: find.text('2 × ${lang == 'fr' ? 'Téléphone rouge' : 'Red Phone'}')), findsOneWidget);
        expect(find.descendant(of: kin, matching: find.text('1 × ${lang == 'fr' ? 'Câble USB' : 'USB Cable'}')), findsOneWidget);
        expect(find.descendant(of: mama, matching: find.text('1 × ${lang == 'fr' ? 'Chaussures bleues' : 'Blue Shoes'}')), findsOneWidget);
        expect(tester.widget<Text>(find.byKey(const ValueKey('checkout-store-subtotal-s1'))).data, money(50));
        expect(tester.widget<Text>(find.byKey(const ValueKey('checkout-store-subtotal-s2'))).data, money(30));
        expect(find.text(s.checkoutOneDelivery(2)), findsOneWidget);
        expect(find.text(s.soldBy('Boutique Kin')), findsNothing);
        // Overall: subtotal 80, delivery 3 (the quote), total 83 (also on the Place order button).
        expect(find.text(money(80)), findsOneWidget);
        expect(find.text('${s.placeOrder}  ·  ${money(83)}'), findsOneWidget);
        _expectNoOverflow();
      });

      testWidgets('one store: its header, no per-store subtotal (it would repeat the order subtotal), no seller-count note', (tester) async {
        ShopState.instance.addToCart(productByUuid('p1')!);
        ShopState.instance.addToCart(productByUuid('p2')!);
        await _show(tester, CheckoutScreen(locale: Locale(lang)), lang: lang);
        await tester.drag(find.byType(ListView), const Offset(0, -3000));
        await tester.pump(const Duration(milliseconds: 300));
        expect(find.byKey(const ValueKey('checkout-store-s1')), findsOneWidget);
        expect(find.byKey(const ValueKey('checkout-store-subtotal-s1')), findsNothing);
        expect(find.byKey(const ValueKey('checkout-sellers-note')), findsNothing);
      });

      testWidgets('order detail: each store package shows its own subtotal (cancelled lines left out)', (tester) async {
        final cancelled = _line('p2', 'USB Cable', 10, 1, 's1', 'Boutique Kin')..['fulfilment'] = 'cancelled';
        RealtimeStore.instance.orders
          ..clear()
          ..add(_order('o1', [_line('p1', 'Red Phone', 20, 2, 's1', 'Boutique Kin'), cancelled, _line('p3', 'Blue Shoes', 30, 1, 's2', 'Mama Tech')]));
        await _show(tester, OrderDetailScreen(locale: Locale(lang), orderId: 'o1'), lang: lang);
        expect(tester.widget<Text>(find.byKey(const ValueKey('package-subtotal-1'))).data, money(40));
        expect(tester.widget<Text>(find.byKey(const ValueKey('package-subtotal-2'))).data, money(30));
        expect(find.text(s.storeSubtotal), findsNWidgets(2));
      });
    });

    group('order confirmed ($lang)', () {
      setUp(() => Strings.setLang(lang, persist: false));

      testWidgets('one checkout, several stores: ONE order reference plus a package per store', (tester) async {
        RealtimeStore.instance.orders
          ..clear()
          ..add(_order('o1', [_line('p1', 'Red Phone', 20, 2, 's1', 'Boutique Kin'), _line('p3', 'Blue Shoes', 30, 1, 's2', 'Mama Tech')]));
        await _show(tester, OrderSuccessScreen(locale: Locale(lang), orderId: 'o1'), lang: lang, phone: true);
        expect(find.text('SOM-o1'), findsOneWidget);
        expect(find.text(s.orderSplitNote(2)), findsOneWidget);
        expect(find.byKey(const ValueKey('order-split-store-0')), findsOneWidget);
        expect(tester.widget<Text>(find.byKey(const ValueKey('order-split-store-0'))).data, 'Boutique Kin');
        expect(tester.widget<Text>(find.byKey(const ValueKey('order-split-subtotal-0'))).data, money(40));
        expect(tester.widget<Text>(find.byKey(const ValueKey('order-split-subtotal-1'))).data, money(30));
        expect(find.text(s.trackOrder), findsOneWidget);
        _expectNoOverflow();
      });

      testWidgets('one store: no split note; large text still fits (the block scrolls, the buttons stay)', (tester) async {
        RealtimeStore.instance.orders
          ..clear()
          ..add(_order('o2', [_line('p1', 'Red Phone', 20, 2, 's1', 'Boutique Kin')]));
        await _show(tester, OrderSuccessScreen(locale: Locale(lang), orderId: 'o2'), lang: lang, scale: 2, phone: true);
        expect(find.byKey(const ValueKey('order-split-note')), findsNothing);
        expect(find.text(s.continueShopping), findsOneWidget);
        _expectNoOverflow();
      });
    });

    group('store page search ($lang)', () {
      setUp(() async {
        await Strings.setLang(lang, persist: false);
        RealtimeStore.instance.debugCallRequest = gapCalls(extra: {
          'sellers:storefront': (b) => {
                'seller': {'id': b!['id'], 'name': 'Boutique Kin', 'rating': 4.5, 'badge': 'gold'}
              },
          'follows:state': (b) => {'sellerId': b!['sellerId'], 'following': false, 'followers': 3},
        });
      });

      testWidgets('typing narrows the store\'s products only; clearing brings them back; other stores never appear', (tester) async {
        await _show(tester, StoreScreen(locale: Locale(lang), sellerId: 's1', sellerName: 'Boutique Kin'), lang: lang);
        final phone = lang == 'fr' ? 'Téléphone rouge' : 'Red Phone';
        final cable = lang == 'fr' ? 'Câble USB' : 'USB Cable';
        final shoes = lang == 'fr' ? 'Chaussures bleues' : 'Blue Shoes';
        expect(find.text(s.storeSearchHint), findsOneWidget);
        expect(find.text(phone), findsOneWidget);
        expect(find.text(cable), findsOneWidget);
        expect(find.text(shoes), findsNothing, reason: 'it belongs to another store');

        await tester.enterText(find.byKey(const ValueKey('store-search')), 'phone');
        await tester.pump();
        expect(find.text(phone), findsOneWidget);
        expect(find.text(cable), findsNothing);

        // The shopper's other-language name, accents and case do not matter.
        await tester.enterText(find.byKey(const ValueKey('store-search')), 'CABLE');
        await tester.pump();
        expect(find.text(cable), findsOneWidget);
        expect(find.text(phone), findsNothing);
        await tester.enterText(find.byKey(const ValueKey('store-search')), 'cable usb');
        await tester.pump();
        expect(find.text(cable), findsOneWidget);

        // A word that only the other store's product has: nothing here, said in the shopper's language.
        await tester.enterText(find.byKey(const ValueKey('store-search')), 'shoes');
        await tester.pump();
        expect(find.byKey(const ValueKey('store-search-none')), findsOneWidget);
        expect(find.text(s.storeSearchNone('shoes')), findsOneWidget);
        expect(find.text(shoes), findsNothing);

        await tester.enterText(find.byKey(const ValueKey('store-search')), '');
        await tester.pump();
        expect(find.text(phone), findsOneWidget);
        expect(find.text(cable), findsOneWidget);
        expect(find.byKey(const ValueKey('store-search-none')), findsNothing);
        _expectNoOverflow();
      });

      testWidgets('the store page keeps its follow button and has Contact support instead of Message the seller', (tester) async {
        await _show(tester, StoreScreen(locale: Locale(lang), sellerId: 's1', sellerName: 'Boutique Kin'), lang: lang);
        expect(find.byKey(const ValueKey('follow-store')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('follow-store')), matching: find.text(s.follow)), findsOneWidget);
        expect(find.byKey(const ValueKey('message-seller')), findsNothing);
        expect(find.byKey(const ValueKey('contact-support')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('contact-support')), matching: find.text(s.contactSupport)), findsOneWidget);
      });

      testWidgets('a store with no products shows no search box', (tester) async {
        await _show(tester, StoreScreen(locale: Locale(lang), sellerId: 's7', sellerName: 'Empty Shop'), lang: lang);
        expect(find.byKey(const ValueKey('store-search')), findsNothing);
        expect(find.text(s.storeNoProducts), findsOneWidget);
      });
    });
  }

  group('new texts exist in English and French', () {
    const keys = ['store_subtotal', 'store_items_one', 'store_items_many', 'store_other_items', 'store_group_open', 'order_split_note', 'store_search_hint', 'store_search_none'];
    test('each key has a different English and French text with the same placeholders', () {
      for (final k in keys) {
        final v = kMessages[k];
        expect(v, isNotNull, reason: k);
        expect(v!.$1.trim(), isNotEmpty);
        expect(v.$2.trim(), isNotEmpty);
        expect(v.$1, isNot(v.$2), reason: '$k is not translated');
        final p = RegExp(r'\{(\w+)\}');
        expect(p.allMatches(v.$1).map((m) => m.group(1)).toSet(), p.allMatches(v.$2).map((m) => m.group(1)).toSet(), reason: k);
      }
    });

    test('the accessors read both languages', () {
      const en = Strings('en'), fr = Strings('fr');
      expect(en.storeSubtotal, 'Store subtotal');
      expect(fr.storeSubtotal, 'Sous-total boutique');
      expect(en.storeItems(1), '1 item');
      expect(fr.storeItems(3), '3 articles');
      expect(en.orderSplitNote(2), contains('2 packages'));
      expect(fr.orderSplitNote(2), contains('2 colis'));
      expect(fr.storeSearchNone('x'), contains('« x »'));
      expect(en.storeGroupOpen('A'), 'Open A');
    });
  });

  group('groupByStore', () {
    test('groups by seller in first-seen order and sums each group', () async {
      _fillCart();
      final groups = groupByStore(ShopState.instance.cart);
      expect(groups.map((g) => g.key), ['s1', 's2']);
      expect(groups[0].indices, [0, 2]);
      expect(groups[0].subtotal, 50);
      expect(groups[0].units, 3);
      expect(groups[1].subtotal, 30);
    });
  });
}
