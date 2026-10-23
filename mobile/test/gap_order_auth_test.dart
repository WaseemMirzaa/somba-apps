// Order detail after delivery (buy again, replace/exchange, receipt, review prompt, estimated delivery)
// and the phone-code sign-in screen.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/more/auth_screens.dart';
import 'package:lipcart/screens/more/order_after_sale.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/delivery_estimate.dart';
import 'package:lipcart/util/format.dart';

import 'gap_helpers.dart';

OrderDto _order(
  String status, {
  String? estimate,
  String id = 'o1',
  double discount = 0,
  String? promo,
  List<Map<String, dynamic>>? items,
  String? shipping,
}) =>
    OrderDto.fromJson({
      'id': id,
      'reference': 'SOM-2042',
      'customerName': 'Aline Mbuyi',
      'status': status,
      'paymentMethod': 'wallet',
      'subtotalUsd': 60,
      'deliveryFeeUsd': 3,
      'discountUsd': discount,
      if (promo != null) 'promoCode': promo,
      'totalUsd': 63 - discount,
      'createdAt': '2026-10-01T09:30:00',
      if (estimate != null) 'estimatedDeliveryDate': estimate,
      if (shipping != null) 'shippingAddress': shipping,
      'items': items ??
          [
            {'productId': 'p1', 'productName': 'Phone case', 'variant': 'Size: 42 · Colour: Black', 'qty': 2, 'priceUsd': 20},
            {'productId': 'p2', 'productName': 'Charger', 'qty': 1, 'priceUsd': 20},
          ],
    });

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() => gapReset());
  tearDown(gapTearDown);

  group('receiptText', () {
    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      test('has the reference, date, customer, every item, the totals and the payment method ($lang)', () {
        final t = receiptText(s, _order('delivered', shipping: '{"line1":"12 Avenue de la Paix","commune":"Gombe","city":"Kinshasa"}'));
        expect(t, contains('${s.receiptOrder}: SOM-2042'));
        expect(t, contains('${s.receiptDate}: 01/10/2026 09:30'));
        expect(t, contains('${s.receiptCustomer}: Aline Mbuyi'));
        expect(t, contains('${s.receiptDeliverTo}: 12 Avenue de la Paix, Gombe, Kinshasa'));
        expect(t, contains('2 × Phone case (Size: 42 · Colour: Black) — ${money(40)}'));
        expect(t, contains('1 × Charger — ${money(20)}'), reason: 'the Default variant is not printed');
        expect(t, isNot(contains('(Default)')));
        expect(t, contains('${s.subtotal}: ${money(60)}'));
        expect(t, contains('${s.delivery}: ${money(3)}'));
        expect(t, contains('${s.total}: ${money(63)}'));
        expect(t, contains('${s.receiptPaidWith}: ${s.paymentLabel('wallet')}'));
        expect(t, contains(s.receiptTitle));
        expect(t.indexOf('SOM-2042') < t.indexOf('Phone case'), isTrue, reason: 'header before the lines');
        expect(t.indexOf('Charger') < t.indexOf('${s.total}:'), isTrue, reason: 'lines before the total');
      });
    }

    test('a promo code shows as a discount line; no discount line without one', () {
      const s = Strings('en');
      expect(receiptText(s, _order('delivered', discount: 5, promo: 'WELCOME5')), contains('${s.receiptDiscount} (WELCOME5): -${money(5)}'));
      expect(receiptText(s, _order('delivered')), isNot(contains(s.receiptDiscount)));
    });

    test('cancelled lines are marked and refunds are listed', () {
      const s = Strings('en');
      final o = _order('processing', items: [
        {'productId': 'p1', 'productName': 'Phone case', 'qty': 1, 'priceUsd': 20},
        {'productId': 'p2', 'productName': 'Charger', 'qty': 1, 'priceUsd': 20, 'fulfilment': 'cancelled', 'refundedUsd': 20},
      ]);
      final t = receiptText(s, o);
      expect(t, contains('Charger — ${money(20)} (${s.receiptCancelled})'));
      expect(t, contains('${s.receiptRefunded}: -${money(20)}'));
    });

    test('without an address or a date the receipt still builds', () {
      const s = Strings('en');
      final o = OrderDto(id: 'x', reference: 'SOM-1', customerName: 'A', status: 'delivered', paymentMethod: 'wallet', totalUsd: 1);
      final t = receiptText(s, o);
      expect(t, contains('${s.receiptDate}: —'));
      expect(t, isNot(contains(s.receiptDeliverTo)));
    });
  });

  group('Order detail', () {
    Future<void> open(WidgetTester tester, OrderDto o, {String lang = 'en'}) async {
      RealtimeStore.instance.orders
        ..clear()
        ..add(o);
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(OrderDetailScreen(locale: Locale(lang), orderId: o.id), lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('a delivered order offers buy again, replace/exchange, receipt and the review prompt ($lang)', (tester) async {
        await open(tester, _order('delivered'), lang: lang);
        expect(find.byKey(const ValueKey('buy-again')), findsOneWidget);
        expect(find.byKey(const ValueKey('item-issue')), findsOneWidget);
        expect(find.byKey(const ValueKey('order-receipt')), findsOneWidget);
        expect(find.byKey(const ValueKey('review-prompt')), findsOneWidget);
        expect(find.text(s.buyAgain), findsOneWidget);
        expect(find.text(s.issueOpen), findsOneWidget);
        expect(find.text(s.receiptTitle), findsOneWidget);
        expect(find.text(s.reviewPromptTitle), findsOneWidget);
        expect(find.byKey(const ValueKey('review-p1')), findsOneWidget);
        expect(find.byKey(const ValueKey('review-p2')), findsOneWidget);
      });

      testWidgets('the estimated delivery day shows as a row ($lang)', (tester) async {
        await open(tester, _order('processing', estimate: '2026-10-23'), lang: lang);
        expect(find.byKey(const ValueKey('order-estimate-row')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('order-estimate-row')), matching: find.text(s.estimatedDelivery)), findsOneWidget);
        expect(find.text(dayLabel('2026-10-23', lang)!), findsOneWidget);
      });
    }

    testWidgets('each order line shows the size/colour the shopper chose; a plain product shows none', (tester) async {
      await open(tester, _order('processing'));
      expect(find.byKey(const ValueKey('order-line-variant-p1')), findsOneWidget);
      expect(find.text('Size: 42 · Colour: Black'), findsOneWidget);
      expect(find.byKey(const ValueKey('order-line-variant-p2')), findsNothing, reason: 'no variant / "Default" → no line');
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('tracking a delivered order says it was delivered, not that the rider has not left ($lang)', (tester) async {
        final s = Strings(lang);
        RealtimeStore.instance.orders
          ..clear()
          ..add(_order('delivered'));
        gapTallViewport(tester);
        await Strings.setLang(lang, persist: false);
        await tester.pumpWidget(gapApp(OrderTrackingScreen(locale: Locale(lang), orderId: 'o1'), lang: lang));
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.widget<Text>(find.byKey(const ValueKey('track-headline'))).data, s.trackDone);
        expect(find.text(s.trackDoneHint), findsOneWidget);
        expect(find.text(s.trackNotYet), findsNothing);
        expect(find.text(s.trackLiveHint), findsNothing);
      });
    }

    testWidgets('no estimate, no row; a malformed one is ignored rather than crashing', (tester) async {
      await open(tester, _order('processing'));
      expect(find.byKey(const ValueKey('order-estimate-row')), findsNothing);
      await open(tester, _order('processing', estimate: 'soon'));
      expect(find.byKey(const ValueKey('order-estimate-row')), findsNothing);
    });

    testWidgets('before delivery there is no buy again, issue or review prompt', (tester) async {
      for (final status in ['confirmed', 'processing', 'out_for_delivery']) {
        await open(tester, _order(status));
        expect(find.byKey(const ValueKey('buy-again')), findsNothing, reason: status);
        expect(find.byKey(const ValueKey('item-issue')), findsNothing, reason: status);
        expect(find.byKey(const ValueKey('review-prompt')), findsNothing, reason: status);
        expect(find.byKey(const ValueKey('order-receipt')), findsOneWidget, reason: '$status: a paid order has a receipt');
      }
    });

    testWidgets('an unpaid (pending) order has no receipt yet', (tester) async {
      await open(tester, _order('pending'));
      expect(find.byKey(const ValueKey('order-receipt')), findsNothing);
    });

    testWidgets('the review prompt skips cancelled lines and repeated products', (tester) async {
      await open(tester, _order('delivered', items: [
        {'productId': 'p1', 'productName': 'Phone case', 'qty': 1, 'priceUsd': 20},
        {'productId': 'p1', 'productName': 'Phone case', 'variant': 'Size: 41', 'qty': 1, 'priceUsd': 20},
        {'productId': 'p2', 'productName': 'Charger', 'qty': 1, 'priceUsd': 20, 'fulfilment': 'cancelled'},
      ]));
      expect(find.byKey(const ValueKey('review-p1')), findsOneWidget);
      expect(find.byKey(const ValueKey('review-p2')), findsNothing);
    });

    testWidgets('the review prompt is empty when every line was cancelled', (tester) async {
      await tester.pumpWidget(gapApp(Scaffold(
          body: ReviewPromptCard(
              order: _order('delivered', items: [
                {'productId': 'p1', 'productName': 'X', 'qty': 1, 'priceUsd': 1, 'fulfilment': 'cancelled'}
              ]),
              locale: const Locale('en')))));
      expect(find.byKey(const ValueKey('review-prompt')), findsNothing);
    });

    testWidgets('Buy again puts the available lines in the cart (stock-capped), says so and opens the cart', (tester) async {
      // p1 has stock 5, p2 only 2; the order is 2 × p1 + 1 × p2, and p2 is bought out meanwhile.
      await open(tester, _order('delivered'));
      await tester.tap(find.byKey(const ValueKey('buy-again')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
      final cart = ShopState.instance.cart;
      expect(cart.map((c) => (c.product.uuid, c.variant, c.qty)), [('p1', 'Size: 42 · Colour: Black', 2), ('p2', 'Default', 1)]);
      expect(find.byType(CartScreen), findsOneWidget);
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text(const Strings('en').buyAgainAdded(3))), findsOneWidget);
    });

    testWidgets('Buy again with a line gone from the catalogue reports it and still adds the rest', (tester) async {
      RealtimeStore.instance.products.removeWhere((p) => p.id == 'p2');
      await open(tester, _order('delivered'));
      await tester.tap(find.byKey(const ValueKey('buy-again')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
      expect(ShopState.instance.cart.map((c) => c.product.uuid), ['p1']);
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text(const Strings('en').buyAgainPartial(2, 'Charger'))), findsOneWidget);
    });

    testWidgets('Buy again with nothing available says so and stays on the order', (tester) async {
      RealtimeStore.instance.products.clear();
      await open(tester, _order('delivered'));
      await tester.tap(find.byKey(const ValueKey('buy-again')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(ShopState.instance.cart, isEmpty);
      expect(find.byType(CartScreen), findsNothing);
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text(const Strings('en').buyAgainNone)), findsOneWidget);
    });

    testWidgets('Receipt opens the receipt screen with the text of the order', (tester) async {
      final o = _order('delivered');
      await open(tester, o);
      await tester.tap(find.byKey(const ValueKey('order-receipt')));
      await tester.pumpAndSettle();
      expect(find.byType(OrderReceiptScreen), findsOneWidget);
      final shown = tester.widget<SelectableText>(find.byKey(const ValueKey('receipt-text'))).data;
      expect(shown, receiptText(const Strings('en'), o));
      expect(find.byKey(const ValueKey('receipt-share')), findsOneWidget);
    });

    testWidgets('Replace or exchange opens the issue form', (tester) async {
      await open(tester, _order('delivered'));
      await tester.tap(find.byKey(const ValueKey('item-issue')));
      await tester.pumpAndSettle();
      expect(find.byType(ItemIssueScreen), findsOneWidget);
      expect(find.byKey(const ValueKey('issue-submit')), findsOneWidget);
    });

    testWidgets('the issue form asks for the item first, then for a reason (snackbars)', (tester) async {
      const s = Strings('en');
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(ItemIssueScreen(order: _order('delivered'))));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('issue-submit')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.issuePickItem)), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('issue-item-p1')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('issue-submit')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.issueSayWhy)), findsOneWidget);
    });
  });

  group('Phone-code sign-in', () {
    Future<void> open(WidgetTester tester, Widget screen, String lang) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      RealtimeStore.instance.user = null;
      await tester.pumpWidget(gapApp(screen, lang: lang));
      await tester.pump(const Duration(milliseconds: 400));
    }

    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);

      testWidgets('the sign-in screen links to the phone-code sign-in ($lang)', (tester) async {
        await open(tester, const LoginScreen(), lang);
        expect(find.byKey(const ValueKey('go-phone-login')), findsOneWidget);
        expect(find.text(s.phoneLoginLink), findsOneWidget);
        await tester.ensureVisible(find.byKey(const ValueKey('go-phone-login')));
        await tester.tap(find.byKey(const ValueKey('go-phone-login')));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 600));
        expect(find.byType(PhoneLoginScreen), findsOneWidget);
        expect(find.text(s.phoneLoginTitle), findsWidgets);
      });

      testWidgets('an invalid phone shows the error and sends nothing ($lang)', (tester) async {
        await open(tester, const PhoneLoginScreen(), lang);
        expect(find.text(s.phoneLoginSend), findsOneWidget);
        expect(find.byKey(const ValueKey('phone-login-code')), findsNothing, reason: 'the code field comes after the code was sent');
        await tester.tap(find.text(s.phoneLoginSend));
        await tester.pump();
        // Shown inline under the field AND in a snackbar (every handled failure gets a snackbar).
        expect(find.text(s.mmInvalid), findsNWidgets(2));
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.mmInvalid)), findsOneWidget);
        expect(find.byKey(const ValueKey('phone-login-code')), findsNothing);
      });

      testWidgets('a number that is too short or contains letters is rejected ($lang)', (tester) async {
        await open(tester, const PhoneLoginScreen(), lang);
        for (final bad in ['+243 12', 'abc', '+243 81 234 56ab', '']) {
          await tester.enterText(find.descendant(of: find.byKey(const ValueKey('phone-login-phone')), matching: find.byType(TextField)), bad);
          await tester.tap(find.text(s.phoneLoginSend));
          await tester.pump();
          expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.mmInvalid)), findsOneWidget, reason: '"$bad"');
        }
      });

      testWidgets('the phone field starts with the +243 prefix ($lang)', (tester) async {
        await open(tester, const PhoneLoginScreen(), lang);
        final tf = tester.widget<TextField>(find.descendant(of: find.byKey(const ValueKey('phone-login-phone')), matching: find.byType(TextField)));
        expect(tf.controller!.text, '+243 ');
        expect(find.text(s.phoneLoginSubtitle), findsOneWidget);
      });
    }
  });
}
