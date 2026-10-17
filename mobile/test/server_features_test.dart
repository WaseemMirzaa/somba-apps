// Campaign prices, the verification policy and seller replies, in both languages.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/format.dart';
import 'package:lipcart/widgets/verify_prompt.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:shared_preferences/shared_preferences.dart';

Map<String, dynamic> _json({Map<String, dynamic> extra = const {}}) => {
      'id': 'p-camp',
      'name': 'Camp phone',
      'nameFr': 'Téléphone promo',
      'price': 80.0, // effective (campaign) price
      'originalPrice': 100.0,
      'discount': 20,
      'basePrice': 100.0,
      'campaignPct': 20,
      'priceSource': 'campaign',
      'category': 'Electronics',
      'categoryFr': 'Électronique',
      'image': '',
      'stock': 10,
      'rating': 4.0,
      'reviewsCount': 3,
      ...extra,
    };

Widget _app(Locale locale, Widget home) => MaterialApp(
      locale: locale,
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      home: home,
    );

void main() {
  setUpAll(() => initializeDateFormatting());

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    marketNotifier.value = MarketProfileId.france; // show USD amounts
    final store = RealtimeStore.instance;
    store.products
      ..clear()
      ..add(ProductDto.fromJson(_json()));
    store.hydrated = false;
    store.user = null;
    store.requireVerifiedForCheckout = false;
    ShopState.instance.cart.clear();
    await Strings.setLang('en', persist: false);
  });

  tearDown(() {
    final store = RealtimeStore.instance;
    store.products.clear();
    store.user = null;
    store.requireVerifiedForCheckout = false;
    ShopState.instance.cart.clear();
    marketNotifier.value = MarketProfileId.drc;
  });

  test('the product keeps the effective price, the base price and where the price comes from', () {
    final d = ProductDto.fromJson(_json());
    expect((d.price, d.basePrice, d.campaignPct, d.priceSource), (80.0, 100.0, 20, 'campaign'));
    final p = productFromDto(d);
    expect(p.price, 80);
    expect(p.strikePrice, 100);
    expect((p.priceSource, p.campaignPct), ('campaign', 20));
    // An old payload without the new fields still works.
    final old = ProductDto.fromJson({'id': 'x', 'name': 'x', 'price': 5, 'stock': 1});
    expect((old.basePrice, old.campaignPct, old.priceSource), (5.0, 0, 'base'));
    expect(productFromDto(old).strikePrice, isNull);
  });

  test('order lines and the order carry list prices and the campaign discount', () {
    final o = OrderDto.fromJson({
      'id': 'o1', 'reference': 'SOM-1', 'status': 'pending', 'paymentMethod': 'wallet',
      'subtotalUsd': 80, 'totalUsd': 83, 'campaignDiscountUsd': 20,
      'items': [
        {'productId': 'p', 'productName': 'x', 'qty': 1, 'priceUsd': 80, 'listPriceUsd': 100},
        {'productId': 'q', 'productName': 'y', 'qty': 1, 'priceUsd': 5},
      ],
    });
    expect(o.campaignDiscountUsd, 20);
    expect(o.items[0].listPriceUsd, 100);
    expect(o.items[1].listPriceUsd, 5, reason: 'no list price sent: same as charged');
  });

  testWidgets('cart: struck-through old price, savings, and totals use the charged price', (tester) async {
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final p = productByUuid('p-camp')!;
    ShopState.instance.addToCart(p, qty: 2);

    for (final lang in ['en', 'fr']) {
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(_app(Locale(lang), const CartScreen(locale: Locale('en'))));
      await tester.pump();
      expect(find.text(money(80)), findsWidgets, reason: 'charged unit price');
      expect(find.text(money(100)), findsOneWidget, reason: 'old price, struck through');
      final savings = tester.widget<Text>(find.byKey(const ValueKey('cart-savings'))).data;
      expect(savings, Strings(lang).youSave(money(40)));
      // subtotal = 2 x 80, never 2 x 100
      expect(find.text(money(160)), findsWidgets);
      expect(find.text(money(200)), findsNothing);
    }
  });

  testWidgets('product page names the campaign in both languages', (tester) async {
    tester.view.physicalSize = const Size(1080, 3000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final p = productByUuid('p-camp')!;
    await Strings.setLang('fr', persist: false);
    await tester.pumpWidget(_app(const Locale('fr'), ProductDetailScreen(product: p, locale: const Locale('fr'))));
    await tester.pump();
    expect(tester.widget<Text>(find.descendant(of: find.byKey(const ValueKey('price-source')), matching: find.byType(Text))).data, const Strings('fr').priceCampaign(20));
    expect(find.text(const Strings('fr').priceCampaign(20)), findsOneWidget);
    expect(find.text('Promotion −20 %'.replaceAll(' %', ' %')), findsNothing, reason: 'the % uses the generated text, whatever the space');
  });

  testWidgets('a review shows the seller reply under it, localised', (tester) async {
    final review = ReviewDto.fromJson({'id': 'r1', 'author': 'Aline', 'rating': 4, 'text': 'Très bien', 'sellerReply': 'Merci Aline !'});
    expect(review.sellerReply, 'Merci Aline !');
    expect(ReviewDto.fromJson({'id': 'r2', 'author': 'B', 'rating': 5, 'text': 'x', 'sellerReply': null}).sellerReply, isNull);
    expect(ReviewDto.fromJson({'id': 'r3', 'author': 'B', 'rating': 5, 'text': 'x', 'sellerReply': '  '}).sellerReply, isNull);

    for (final lang in ['en', 'fr']) {
      await tester.pumpWidget(_app(Locale(lang), Scaffold(body: reviewTile(review, Strings(lang)))));
      expect(find.byKey(const ValueKey('seller-reply')), findsOneWidget);
      expect(find.text(Strings(lang).reviewSellerReply), findsOneWidget);
      expect(find.text('Merci Aline !'), findsOneWidget);
    }
    await tester.pumpWidget(_app(const Locale('fr'), Scaffold(body: reviewTile(ReviewDto.fromJson({'id': 'r2', 'author': 'B', 'rating': 5, 'text': 'x'}), const Strings('fr')))));
    expect(find.byKey(const ValueKey('seller-reply')), findsNothing);
  });

  group('verification policy', () {
    BackendUser user({bool phone = false, bool email = false}) => BackendUser.fromJson({
          'id': 'u', 'email': 'a@b.cd', 'name': 'A', 'role': 'customer', 'phone': '+243812345678', 'phoneVerified': phone, 'emailVerified': email,
        });

    test('needsVerification only when the setting is on and neither phone nor email is verified', () {
      final store = RealtimeStore.instance;
      store.user = user();
      expect(store.needsVerification, isFalse, reason: 'setting off');
      store.requireVerifiedForCheckout = true;
      expect(store.needsVerification, isTrue);
      store.user = user(phone: true);
      expect(store.needsVerification, isFalse);
      store.user = user(email: true);
      expect(store.needsVerification, isFalse);
      store.user = null;
      expect(store.needsVerification, isFalse);
    });

    test('the server refusal is recognised and translated', () {
      // The exact refusal the API sends (api/src/realtime/realtime.gateway.ts).
      final e = ApiException('Verify your phone number or email address first: open Profile > Verification, confirm a code or link, then try again.');
      expect(isVerificationError(e), isTrue);
      expect(isVerificationError(StateError('x')), isFalse);
      expect(const Strings('fr').serverError(e.message), startsWith('Vérifiez d’abord'));
    });

    for (final lang in ['en', 'fr']) {
      testWidgets('checkout / top-up prompt in $lang offers the verification screens instead of a raw error', (tester) async {
        await Strings.setLang(lang, persist: false);
        final s = Strings(lang);
        RealtimeStore.instance
          ..user = user()
          ..requireVerifiedForCheckout = true;
        var result = true;
        await tester.pumpWidget(_app(
            Locale(lang),
            Builder(
                builder: (ctx) => Scaffold(
                    body: Column(children: [
                  TextButton(onPressed: () async => result = await ensureVerified(ctx, forTopUp: false), child: const Text('order')),
                  TextButton(onPressed: () async => result = await ensureVerified(ctx, forTopUp: true), child: const Text('topup')),
                ])))));

        await tester.tap(find.text('order'));
        await tester.pumpAndSettle();
        expect(find.byKey(const ValueKey('verify-prompt')), findsOneWidget);
        expect(find.text(s.verifyTitle), findsOneWidget);
        expect(find.text(s.verifyBodyOrder), findsOneWidget);
        expect(find.text(s.verifyPhoneBtn), findsOneWidget);
        expect(find.text(s.verifyEmailBtn), findsOneWidget);
        await tester.tap(find.text(s.verifyLater));
        await tester.pumpAndSettle();
        expect(result, isFalse, reason: 'the order is not sent');

        await tester.tap(find.text('topup'));
        await tester.pumpAndSettle();
        expect(find.text(s.verifyBodyTopup), findsOneWidget);
        await tester.tap(find.byKey(const ValueKey('verify-email-btn')));
        await tester.pumpAndSettle();
        expect(find.text(s.veTitle), findsWidgets, reason: 'the existing email verification screen opened');
        await tester.pump(const Duration(seconds: 1));
      });
    }

    testWidgets('no prompt when the account is verified or the policy is off', (tester) async {
      var result = false;
      RealtimeStore.instance
        ..user = user(phone: true)
        ..requireVerifiedForCheckout = true;
      await tester.pumpWidget(_app(const Locale('en'), Builder(builder: (ctx) => TextButton(onPressed: () async => result = await ensureVerified(ctx, forTopUp: false), child: const Text('go')))));
      await tester.tap(find.text('go'));
      await tester.pumpAndSettle();
      expect(result, isTrue);
      expect(find.byKey(const ValueKey('verify-prompt')), findsNothing);
    });
  });
}
