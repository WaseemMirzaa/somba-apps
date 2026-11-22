// VAT and who pays the delivery fee: the cart arithmetic (same as the server's), the order / quote / listing payloads, the
// receipt, and the checkout rows for each combination of the admin settings.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/order_after_sale.dart';
import 'package:lipcart/services/delivery_quote.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/cart_totals.dart';
import 'package:lipcart/util/format.dart';

import 'gap_helpers.dart';

const _lines = [TotalsLine(priceUsd: 20, qty: 1, vatPct: 16), TotalsLine(priceUsd: 10, qty: 1, vatPct: 16)];

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(() {
    final store = RealtimeStore.instance;
    store.vatEnabled = false;
    store.feePaidBySeller = false;
    store.showPlatformFee = true;
    gapTearDown();
  });

  group('cartTotals (the server\'s arithmetic)', () {
    test('VAT off (the default): no VAT, today\'s total', () {
      final t = cartTotals(lines: _lines, discountUsd: 0, feeUsd: 3);
      expect([t.vat, t.fee, t.total, t.showFeeLine, t.feeInTotal], [0, 3, 33, true, false]);
    });

    test('VAT on: added per line, one summed amount, inside the total', () {
      final t = cartTotals(lines: _lines, discountUsd: 0, feeUsd: 3, vatEnabled: true);
      expect([t.subtotal, t.vat, t.total], [30, 4.8, 37.8]);
    });

    test('the discount comes off before VAT, each line by its share', () {
      final t = cartTotals(lines: _lines, discountUsd: 3, feeUsd: 0, vatEnabled: true);
      expect(t.vat, 4.32); // (20-2)*16% + (10-1)*16%
      expect(t.total, 31.32);
    });

    test('a store coupon discounts only that store\'s lines', () {
      final t = cartTotals(
          lines: const [TotalsLine(priceUsd: 20, qty: 1, vatPct: 16), TotalsLine(priceUsd: 10, qty: 1, vatPct: 16, discountable: false)],
          discountUsd: 5,
          feeUsd: 0,
          vatEnabled: true);
      expect(t.vat, 4.0); // (20-5)*16% = 2.4 + 10*16% = 1.6
    });

    test('a 0% category and another rate', () {
      final t = cartTotals(lines: const [TotalsLine(priceUsd: 20, qty: 1, vatPct: 0), TotalsLine(priceUsd: 10, qty: 2, vatPct: 8)], discountUsd: 0, feeUsd: 0, vatEnabled: true);
      expect(t.vat, 1.6);
    });

    test('the seller pays the fee: the customer pays none and sees no fee row', () {
      final t = cartTotals(lines: _lines, discountUsd: 0, feeUsd: 3, vatEnabled: true, feePaidBySeller: true);
      expect([t.fee, t.total, t.showFeeLine, t.feeInTotal, t.feePaidBySeller], [0, 34.8, false, false, true]);
    });

    test('a hidden fee is still charged: folded into the total', () {
      final t = cartTotals(lines: _lines, discountUsd: 0, feeUsd: 3, showPlatformFee: false);
      expect([t.fee, t.total, t.showFeeLine, t.feeInTotal], [3, 33, false, true]);
    });

    test('rounds like the server (half a cent goes up) and the parts always add up', () {
      expect(cents(1.005), 1.01);
      expect(allocateCents(1, [1, 1, 1]), [0.34, 0.33, 0.33]);
      expect((allocateCents(7.77, [3.33, 4.44, 1.11, 9.99]).fold<double>(0, (a, b) => a + b) * 100).round(), 777);
    });
  });

  group('payloads', () {
    test('a listing carries vatPct (0 on an older server); an order carries the VAT and the fee rules', () {
      expect(ProductDto.fromJson({'id': 'p', 'name': 'X', 'price': 10, 'vatPct': 16}).vatPct, 16);
      expect(ProductDto.fromJson({'id': 'p', 'name': 'X', 'price': 10}).vatPct, 0);
      expect(productFromDto(ProductDto.fromJson({'id': 'p', 'name': 'X', 'price': 10, 'vatPct': 8})).vatPct, 8);
      final o = OrderDto.fromJson({'id': 'o', 'totalUsd': 34.8, 'vatUsd': 4.8, 'feePaidBySeller': true, 'showFee': false, 'platformFeeUsd': 0});
      expect([o.vatUsd, o.feePaidBySeller, o.showFee, o.platformFeeUsd], [4.8, true, false, 0]);
      final old = OrderDto.fromJson({'id': 'o', 'totalUsd': 33, 'deliveryFeeUsd': 3});
      expect([old.vatUsd, old.feePaidBySeller, old.showFee, old.platformFeeUsd], [0, false, true, 3]);
    });

    test('a quote says who pays', () {
      final q = DeliveryQuote.fromJson({'feeUsd': 0, 'platformFeeUsd': 0, 'feePaidBySeller': true, 'showFee': false});
      expect([q.feePaidBySeller, q.showFee], [true, false]);
      final old = DeliveryQuote.fromJson({'feeUsd': 4});
      expect([old.feePaidBySeller, old.showFee], [false, true]);
    });

    test('the public settings switch the estimate; a key the server did not send keeps its value', () {
      final store = RealtimeStore.instance;
      store.applySettings({'vatEnabled': 'true', 'deliveryFeePaidBy': 'seller', 'showPlatformFee': 'false'});
      expect([store.vatEnabled, store.feePaidBySeller, store.showPlatformFee], [true, true, false]);
      store.applySettings({'fxRate': '2800'});
      expect([store.vatEnabled, store.feePaidBySeller, store.showPlatformFee], [true, true, false]);
      store.applySettings({'vatEnabled': 'false', 'deliveryFeePaidBy': 'customer', 'showPlatformFee': 'true'});
      expect([store.vatEnabled, store.feePaidBySeller, store.showPlatformFee], [false, false, true]);
    });
  });

  group('receipt', () {
    OrderDto order(Map<String, dynamic> over) => OrderDto.fromJson({
          'id': 'o1',
          'reference': 'SOM-2042',
          'customerName': 'Aline',
          'status': 'delivered',
          'paymentMethod': 'wallet',
          'subtotalUsd': 30,
          'items': [
            {'productId': 'p1', 'productName': 'Shoes', 'qty': 1, 'priceUsd': 20},
            {'productId': 'p2', 'productName': 'Socks', 'qty': 1, 'priceUsd': 10},
          ],
          ...over,
        });

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);
      test('VAT line, the fee line, and the total ($lang)', () {
        final t = receiptText(s, order({'vatUsd': 4.8, 'platformFeeUsd': 3, 'deliveryFeeUsd': 3, 'totalUsd': 37.8}));
        expect(t, contains('${s.vat}: ${money(4.8)}'));
        expect(t, contains('${s.platformFee}: ${money(3)}'));
        expect(t, contains('${s.total}: ${money(37.8)}'));
      });

      test('the seller pays the fee: no fee line ($lang)', () {
        final t = receiptText(s, order({'vatUsd': 4.8, 'platformFeeUsd': 0, 'feePaidBySeller': true, 'showFee': false, 'totalUsd': 34.8}));
        expect(t, isNot(contains('${s.platformFee}:')));
        expect(t, contains('${s.total}: ${money(34.8)}'));
        expect(t, isNot(contains(s.totalInclDelivery)));
      });

      test('the fee is hidden: it is in the total, said so ($lang)', () {
        final t = receiptText(s, order({'platformFeeUsd': 3, 'deliveryFeeUsd': 3, 'showFee': false, 'totalUsd': 33}));
        expect(t, isNot(contains('${s.platformFee}:')));
        expect(t, contains('${s.totalInclDelivery}: ${money(33)}'));
        expect(t, isNot(contains('${s.vat}:')), reason: 'no VAT was charged');
      });
    }
  });

  group('checkout rows', () {
    setUp(() async {
      await gapReset(products: [
        ProductDto.fromJson({'id': 'a', 'name': 'Shoes', 'nameFr': 'Chaussures', 'price': 20, 'originalPrice': 20, 'category': 'E', 'image': '', 'stock': 5, 'vatPct': 16}),
        ProductDto.fromJson({'id': 'b', 'name': 'Socks', 'nameFr': 'Chaussettes', 'price': 10, 'originalPrice': 10, 'category': 'E', 'image': '', 'stock': 5, 'vatPct': 16}),
      ]);
      final store = RealtimeStore.instance;
      store.walletBalance = 1000;
      store.addresses.add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue', city: 'Kinshasa', commune: 'Gombe', isDefault: true, geo: (lat: -4.31, lng: 15.31, placeId: null, formatted: null)));
      store.debugCallRequest = gapCalls(quote: (_) => gapQuoteJson(fee: 3));
      ShopState.instance.addToCart(productByUuid('a')!);
      ShopState.instance.addToCart(productByUuid('b')!);
    });

    Future<void> open(WidgetTester tester, {String lang = 'en'}) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    String totalText(WidgetTester tester) => tester.widgetList<Text>(find.descendant(of: find.byKey(const ValueKey('checkout-total-row')), matching: find.byType(Text))).map((t) => t.data).join('|');

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('today\'s behaviour: no VAT row, the fee row, Total ($lang)', (tester) async {
        await open(tester, lang: lang);
        expect(find.byKey(const ValueKey('checkout-vat-row')), findsNothing);
        expect(find.text(s.platformFee), findsOneWidget);
        expect(totalText(tester), '${s.total}|${money(33)}');
      });

      testWidgets('VAT on: one VAT row and the total adds it ($lang)', (tester) async {
        RealtimeStore.instance.vatEnabled = true;
        await open(tester, lang: lang);
        expect(find.byKey(const ValueKey('checkout-vat-row')), findsOneWidget);
        expect(find.text(s.vat), findsOneWidget);
        expect(find.text(money(4.8)), findsOneWidget);
        expect(find.text(s.platformFee), findsOneWidget);
        expect(totalText(tester), '${s.total}|${money(37.8)}');
      });

      testWidgets('the seller pays the fee: no fee row, goods + VAT only ($lang)', (tester) async {
        RealtimeStore.instance
          ..vatEnabled = true
          ..feePaidBySeller = true;
        await open(tester, lang: lang);
        expect(find.text(s.platformFee), findsNothing);
        expect(find.text(s.vat), findsOneWidget);
        expect(totalText(tester), '${s.total}|${money(34.8)}');
      });

      testWidgets('the fee line is hidden: still charged, folded into the total with a note ($lang)', (tester) async {
        RealtimeStore.instance
          ..vatEnabled = true
          ..showPlatformFee = false;
        await open(tester, lang: lang);
        expect(find.text(s.platformFee), findsNothing);
        expect(totalText(tester), '${s.totalInclDelivery}|${money(37.8)}');
      });
    }
  });
}
