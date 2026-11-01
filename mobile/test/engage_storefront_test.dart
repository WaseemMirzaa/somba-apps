// Storefront: a store on vacation (page, cards, the shared add-to-cart helper, the live push, the bilingual error),
// handling time in the delivery estimate, and the store page (policies, vacation banner, handling time).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/chat_entry.dart';
import 'package:lipcart/screens/more/shop_extra.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/delivery_estimate.dart';
import 'package:lipcart/widgets/product_actions.dart';

import 'button_rules.dart';
import 'engage_helpers.dart';
import 'gap_helpers.dart';

Map<String, dynamic> _productJson(String id, {Map<String, dynamic> extra = const {}, double price = 20}) => {
      'id': id,
      'name': 'Item $id',
      'nameFr': 'Article $id',
      'price': price,
      'originalPrice': price,
      'category': 'Electronics',
      'image': '',
      'stock': 5,
      'sellerId': 's1',
      'sellerName': 'Kinshasa Traders',
      'deliveryDays': 3,
      ...extra,
    };

Future<void> _page(WidgetTester tester, String id, {String lang = 'en'}) async {
  gapTallViewport(tester);
  await tester.pumpWidget(gapApp(ProductDetailScreen(product: productOf(id), locale: Locale(lang)), lang: lang));
  await tester.pump();
}

Finder get _buy => find.byKey(const ValueKey('pd-buy-now'));
Finder get _addIcon => find.byKey(const ValueKey('pd-add-to-cart'));

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(engageTearDown);

  group('product page: store on vacation', () {
    testWidgets('an open store: add to cart works and there is no notice', (tester) async {
      await engageReset(products: [engageDto('p1')]);
      await _page(tester, 'p1');
      expect(find.byKey(const ValueKey('vacation-banner')), findsNothing);
      expect(_addIcon, findsOneWidget);
      await tester.tap(_addIcon);
      await tester.pump();
      expect(ShopState.instance.cart, hasLength(1));
    });

    testWidgets('on vacation: the server notice in English, no add to cart, the buy button says why and nothing can be bought', (tester) async {
      await engageReset(products: [engageDto('p1', extra: vacationFields())]);
      await _page(tester, 'p1');
      expect(find.byKey(const ValueKey('vacation-banner')), findsOneWidget);
      expect(find.text('Kinshasa Traders is on vacation until 12 Nov 2026 and is not taking new orders.'), findsOneWidget);
      expect(_addIcon, findsNothing);
      expect(tester.widget<FilledButton>(_buy).onPressed, isNull);
      expect(find.text('Store on vacation'), findsOneWidget);
      expect(find.textContaining('Buy now'), findsNothing);
      expect(ShopState.instance.cart, isEmpty);
      expectButtonRules(tester);
    });

    testWidgets('on vacation, in French', (tester) async {
      await engageReset(products: [engageDto('p1', extra: vacationFields())], lang: 'fr');
      await _page(tester, 'p1', lang: 'fr');
      expect(find.text('Kinshasa Traders est en vacances jusqu’au 12 nov. 2026 et ne prend pas de nouvelles commandes.'), findsOneWidget);
      expect(find.text('Boutique en vacances'), findsOneWidget);
      expect(_addIcon, findsNothing);
    });

    testWidgets('no server notice: "on vacation until {date}" in the language, else the generic sentence', (tester) async {
      await engageReset(products: [engageDto('p1', extra: vacationFields(withNotice: false))]);
      await _page(tester, 'p1');
      final until = productOf('p1').sellerVacationUntil!;
      expect(find.text(const Strings('en').vacUntil(const Strings('en').date(until))), findsOneWidget);
      await engageReset(products: [engageDto('p1', extra: vacationFields(withNotice: false))], lang: 'fr');
      await _page(tester, 'p1', lang: 'fr');
      expect(find.text(const Strings('fr').vacUntil(const Strings('fr').date(until))), findsOneWidget);
      // No return date either.
      await engageReset(products: [engageDto('p1', extra: {'sellerOnVacation': true})]);
      await _page(tester, 'p1');
      expect(find.text('This store is on vacation and is not taking new orders.'), findsOneWidget);
    });

    testWidgets('a notice written in the other language only falls back to the dated sentence', (tester) async {
      await engageReset(products: [
        engageDto('p1', extra: {...vacationFields(withNotice: false), 'sellerVacationNotice': {'en': 'Back soon, thank you.'}})
      ], lang: 'fr');
      await _page(tester, 'p1', lang: 'fr');
      expect(find.text('Back soon, thank you.'), findsNothing);
      expect(find.textContaining('En vacances jusqu’au'), findsOneWidget);
    });

    testWidgets('store:vacation closes the page live and reopens it, and a newer product copy beats an older push', (tester) async {
      await engageReset(products: [engageDto('p1')]);
      await _page(tester, 'p1');
      expect(_addIcon, findsOneWidget);

      RealtimeStore.instance.debugEmit('store:vacation', {
        'sellerId': 's1',
        'onVacation': true,
        'vacationUntil': '2026-11-12T22:59:59.000Z',
        'notice': {'en': 'We are away until the 12th.', 'fr': 'Nous sommes absents jusqu’au 12.'},
      });
      await tester.pump();
      expect(find.text('We are away until the 12th.'), findsOneWidget);
      expect(_addIcon, findsNothing);
      expect(tester.widget<FilledButton>(_buy).onPressed, isNull);

      // The store is back: the push says so.
      RealtimeStore.instance.debugEmit('store:vacation', {'sellerId': 's1', 'onVacation': false, 'vacationUntil': null});
      await tester.pump();
      expect(find.byKey(const ValueKey('vacation-banner')), findsNothing);
      expect(_addIcon, findsOneWidget);
      expect(tester.widget<FilledButton>(_buy).onPressed, isNotNull);

      // Away again, then a product update that arrives AFTER the push and says "open" wins (it is newer).
      RealtimeStore.instance.debugEmit('store:vacation', {'sellerId': 's1', 'onVacation': true, 'vacationUntil': '2026-11-12T22:59:59.000Z'});
      await tester.pump();
      expect(find.byKey(const ValueKey('vacation-banner')), findsOneWidget);
      pushProduct(_productJson('p1'));
      await tester.pump();
      expect(find.byKey(const ValueKey('vacation-banner')), findsNothing, reason: 'the product payload is newer than the push');

      // And the other way round: a product copy that says "away" is overruled by a later "back" push.
      pushProduct(_productJson('p1', extra: vacationFields()));
      await tester.pump();
      expect(find.byKey(const ValueKey('vacation-banner')), findsOneWidget);
      RealtimeStore.instance.debugEmit('store:vacation', {'sellerId': 's1', 'onVacation': false});
      await tester.pump();
      expect(find.byKey(const ValueKey('vacation-banner')), findsNothing);
    });

    testWidgets('a push about another store changes nothing', (tester) async {
      await engageReset(products: [engageDto('p1')]);
      await _page(tester, 'p1');
      RealtimeStore.instance.debugEmit('store:vacation', {'sellerId': 'other', 'onVacation': true, 'vacationUntil': '2026-11-12T22:59:59.000Z'});
      await tester.pump();
      expect(find.byKey(const ValueKey('vacation-banner')), findsNothing);
      expect(_addIcon, findsOneWidget);
    });

    testWidgets('a vacation whose return date has passed counts as over, before the server says so', (tester) async {
      await engageReset(products: [engageDto('p1', extra: vacationFields(until: '2026-10-25T12:00:30.000Z'))]);
      await _page(tester, 'p1');
      expect(find.byKey(const ValueKey('vacation-banner')), findsOneWidget);
      engageClock.advance(const Duration(minutes: 1));
      RealtimeStore.instance.debugEmit('store:vacation', {'sellerId': 'unrelated', 'onVacation': false}); // any change rebuilds the page
      await tester.pump();
      expect(find.byKey(const ValueKey('vacation-banner')), findsNothing);
      expect(_addIcon, findsOneWidget);
    });
  });

  group('cards and the shared add-to-cart helper', () {
    Future<void> card(WidgetTester tester, String id, {String lang = 'en'}) async {
      await tester.pumpWidget(gapApp(
        Scaffold(body: Center(child: SizedBox(width: 180, height: 300, child: Builder(builder: (c) => productCard(c, productOf(id), Locale(lang)))))),
        lang: lang,
      ));
      await tester.pump();
    }

    testWidgets('an open store: "+" adds to the cart', (tester) async {
      await engageReset(products: [engageDto('p1')]);
      await card(tester, 'p1');
      expect(find.byKey(const ValueKey('vacation-tag')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('card-add')));
      await tester.pump();
      expect(ShopState.instance.cart, hasLength(1));
    });

    testWidgets('a store on vacation: tag on the card, the "+" is muted and explains instead of adding', (tester) async {
      await engageReset(products: [engageDto('p1', extra: vacationFields())]);
      await card(tester, 'p1');
      expect(find.byKey(const ValueKey('vacation-tag')), findsOneWidget);
      expect(find.text('On vacation'), findsOneWidget);
      expect(find.byKey(const ValueKey('card-add-muted')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('card-add-muted')));
      await tester.pump();
      expect(ShopState.instance.cart, isEmpty);
      expect(find.text('Kinshasa Traders is on vacation until 12 Nov 2026 and is not taking new orders.'), findsOneWidget);
    });

    testWidgets('the card follows store:vacation live', (tester) async {
      await engageReset(products: [engageDto('p1')]);
      await card(tester, 'p1');
      RealtimeStore.instance.debugEmit('store:vacation', {'sellerId': 's1', 'onVacation': true, 'vacationUntil': '2026-11-12T22:59:59.000Z'});
      await tester.pump();
      expect(find.byKey(const ValueKey('vacation-tag')), findsOneWidget);
      RealtimeStore.instance.debugEmit('store:vacation', {'sellerId': 's1', 'onVacation': false});
      await tester.pump();
      expect(find.byKey(const ValueKey('vacation-tag')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('card-add')));
      await tester.pump();
      expect(ShopState.instance.cart, hasLength(1));
    });

    testWidgets('the French card', (tester) async {
      await engageReset(products: [engageDto('p1', extra: vacationFields())], lang: 'fr');
      await card(tester, 'p1', lang: 'fr');
      expect(find.text('En vacances'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('card-add-muted')));
      await tester.pump();
      expect(find.text('Kinshasa Traders est en vacances jusqu’au 12 nov. 2026 et ne prend pas de nouvelles commandes.'), findsOneWidget);
    });

    testWidgets('addProductToCart (wishlist, home, deals…) refuses a product of a store on vacation and says why', (tester) async {
      await engageReset(products: [engageDto('p1', extra: vacationFields()), engageDto('p2')]);
      late BuildContext ctx;
      await tester.pumpWidget(gapApp(Scaffold(body: Builder(builder: (c) {
        ctx = c;
        return const SizedBox();
      }))));
      addProductToCart(ctx, productOf('p1'), const Locale('en'));
      await tester.pump();
      expect(ShopState.instance.cart, isEmpty);
      expect(find.textContaining('is on vacation until 12 Nov 2026'), findsOneWidget);
      addProductToCart(ctx, productOf('p2'), const Locale('en'));
      await tester.pump();
      expect(ShopState.instance.cart, hasLength(1));
      expect(blockedByVacation(ctx, productOf('p1'), const Locale('en')), isTrue);
      expect(blockedByVacation(ctx, productOf('p2'), const Locale('en')), isFalse);
    });
  });

  group('the bilingual server error reaches the shopper in one language', () {
    testWidgets('showError from the add-to-cart / checkout path', (tester) async {
      await engageReset();
      const raw = 'Kinshasa Traders is on vacation until 12 Nov 2026 and is not taking new orders. / '
          'Kinshasa Traders est en vacances jusqu’au 12 nov. 2026 et ne prend pas de nouvelles commandes.';
      await Strings.setLang('en', persist: false);
      expect(Strings.current.errorText(ApiException(raw)), 'Kinshasa Traders is on vacation until 12 Nov 2026 and is not taking new orders.');
      await Strings.setLang('fr', persist: false);
      expect(Strings.current.errorText(ApiException(raw)), 'Kinshasa Traders est en vacances jusqu’au 12 nov. 2026 et ne prend pas de nouvelles commandes.');
    });
  });

  group('delivery estimate with the store\'s handling time', () {
    testWidgets('the page uses totalDeliveryDays and says the preparation is included', (tester) async {
      await engageReset(products: [engageDto('p1', extra: {'deliveryDays': 3, 'sellerHandlingDays': 2, 'totalDeliveryDays': 5})]);
      await _page(tester, 'p1');
      final day = dayLabel(localDayPlus(5), 'en');
      expect(find.text('Delivery in 5 days · expected $day'), findsOneWidget);
      expect(find.textContaining('Includes 2 d for the seller to prepare your order'), findsOneWidget);
    });

    testWidgets('without handling time the page is as before', (tester) async {
      await engageReset(products: [engageDto('p1', extra: {'deliveryDays': 4})]);
      await _page(tester, 'p1');
      expect(find.text('Delivery in 4 days · expected ${dayLabel(localDayPlus(4), 'en')}'), findsOneWidget);
      expect(find.textContaining('prepare your order'), findsNothing);
    });

    testWidgets('French, and a total beyond 30 days is not cut', (tester) async {
      await engageReset(products: [engageDto('p1', extra: {'deliveryDays': 30, 'sellerHandlingDays': 14, 'totalDeliveryDays': 44})], lang: 'fr');
      await _page(tester, 'p1', lang: 'fr');
      expect(find.text('Livraison en 44 jours · prévue le ${dayLabel(localDayPlus(44), 'fr')}'), findsOneWidget);
      expect(find.textContaining('Dont 14 j de préparation par le vendeur'), findsOneWidget);
    });
  });

  group('brand, sku and message the seller on the product page', () {
    testWidgets('brand and SKU lines, in both languages', (tester) async {
      await engageReset(products: [engageDto('p1', extra: {'brand': 'Somba Sport', 'sku': 'SHOE-42'})]);
      await _page(tester, 'p1');
      expect(find.text('Brand: Somba Sport'), findsOneWidget);
      expect(find.text('SKU: SHOE-42'), findsOneWidget);
      await engageReset(products: [engageDto('p1', extra: {'brand': 'Somba Sport', 'sku': 'SHOE-42'})], lang: 'fr');
      await _page(tester, 'p1', lang: 'fr');
      expect(find.text('Marque : Somba Sport'), findsOneWidget);
      expect(find.text('Réf. : SHOE-42'), findsOneWidget);
    });

    testWidgets('no brand and no SKU: no lines', (tester) async {
      await engageReset(products: [engageDto('p1')]);
      await _page(tester, 'p1');
      expect(find.byKey(const ValueKey('pd-brand')), findsNothing);
      expect(find.byKey(const ValueKey('pd-sku')), findsNothing);
    });

    testWidgets('the seller card carries the message-the-seller entry with the product', (tester) async {
      await engageReset(products: [engageDto('p1')]);
      await _page(tester, 'p1');
      final b = tester.widget<MessageSellerButton>(find.byType(MessageSellerButton));
      expect(b.sellerId, 's1');
      expect(b.storeName, 'Kinshasa Traders');
      expect(b.productId, 'p1');
    });
  });

  group('store page', () {
    Map<String, dynamic> storefront({Map<String, dynamic> extra = const {}}) => {
          'seller': {
            'id': 's1',
            'name': 'Kinshasa Traders',
            'rating': 4.6,
            'badge': 'gold',
            'description': 'Shoes and more.',
            'descriptionFr': 'Chaussures et plus.',
            'returnsPolicy': 'Returns within 7 days, unworn.',
            'returnsPolicyFr': 'Retours sous 7 jours, non portés.',
            'shippingPolicy': 'Parcels leave on Mondays and Thursdays.',
            'shippingPolicyFr': 'Les colis partent le lundi et le jeudi.',
            'handlingDays': 3,
            'onVacation': false,
            'vacationUntil': null,
            ...extra,
          },
        };

    Future<void> open(WidgetTester tester, {String lang = 'en', Map<String, dynamic>? payload, Object? fail}) async {
      gapTallViewport(tester);
      RealtimeStore.instance.debugCallRequest = (event, [body]) async {
        if (event == 'sellers:storefront') {
          if (fail != null) throw fail;
          return payload ?? storefront();
        }
        return const <dynamic>[];
      };
      await tester.pumpWidget(gapApp(StoreScreen(locale: Locale(lang), sellerId: 's1', sellerName: 'Kinshasa Traders'), lang: lang));
      await tester.pump();
      await tester.pump();
    }

    setUp(() => engageReset(products: [engageDto('p1'), engageDto('p2', extra: vacationFields())]));

    testWidgets('policies are collapsible sections in the shopper\'s language, with the handling time', (tester) async {
      await open(tester);
      expect(find.text('Returns policy'), findsOneWidget);
      expect(find.text('Shipping policy'), findsOneWidget);
      expect(find.text('Handling time: 3 days'), findsOneWidget);
      // Collapsed until opened.
      expect(find.text('Returns within 7 days, unworn.'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('policy-returns')));
      await tester.pumpAndSettle();
      expect(find.text('Returns within 7 days, unworn.'), findsOneWidget);
      expect(find.text('Parcels leave on Mondays and Thursdays.'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('policy-shipping')));
      await tester.pumpAndSettle();
      expect(find.text('Parcels leave on Mondays and Thursdays.'), findsOneWidget);
      expect(find.byKey(const ValueKey('vacation-banner')), findsNothing);
    });

    testWidgets('the same page in French', (tester) async {
      await engageReset(products: [engageDto('p1')], lang: 'fr');
      await open(tester, lang: 'fr');
      expect(find.text('Politique de retour'), findsOneWidget);
      expect(find.text('Politique d’expédition'), findsOneWidget);
      expect(find.text('Délai de préparation : 3 jours'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('policy-returns')));
      await tester.pumpAndSettle();
      expect(find.text('Retours sous 7 jours, non portés.'), findsOneWidget);
    });

    testWidgets('a policy that is not translated yet shows the original; a missing policy shows no section', (tester) async {
      await engageReset(products: [engageDto('p1')], lang: 'fr');
      await open(tester, lang: 'fr', payload: storefront(extra: {'shippingPolicyFr': null, 'returnsPolicy': null, 'returnsPolicyFr': null}));
      expect(find.text('Politique de retour'), findsNothing);
      await tester.tap(find.byKey(const ValueKey('policy-shipping')));
      await tester.pumpAndSettle();
      expect(find.text('Parcels leave on Mondays and Thursdays.'), findsOneWidget);
    });

    testWidgets('one day reads in the singular', (tester) async {
      await open(tester, payload: storefront(extra: {'handlingDays': 1}));
      expect(find.text('Handling time: 1 day'), findsOneWidget);
    });

    testWidgets('no handling time shows no line', (tester) async {
      await open(tester, payload: storefront(extra: {'handlingDays': 0}));
      expect(find.byKey(const ValueKey('store-handling')), findsNothing);
    });

    testWidgets('a store on vacation: banner with the return date, and live changes by store:vacation', (tester) async {
      await open(tester, payload: storefront(extra: {'onVacation': true, 'vacationUntil': '2026-11-12T22:59:59.000Z'}));
      expect(find.byKey(const ValueKey('vacation-banner')), findsOneWidget);
      expect(find.textContaining('On vacation until'), findsOneWidget);
      RealtimeStore.instance.debugEmit('store:vacation', {'sellerId': 's1', 'onVacation': false});
      await tester.pump();
      expect(find.byKey(const ValueKey('vacation-banner')), findsNothing);
      RealtimeStore.instance.debugEmit('store:vacation', {
        'sellerId': 's1',
        'onVacation': true,
        'vacationUntil': '2026-12-01T22:59:59.000Z',
        'notice': {'en': 'Closed for stocktaking.', 'fr': 'Fermé pour inventaire.'}
      });
      await tester.pump();
      expect(find.text('Closed for stocktaking.'), findsOneWidget);
    });

    testWidgets('the listings of a store on vacation say so even when the storefront details could not be loaded', (tester) async {
      await open(tester, fail: ApiException('Store not found.'));
      expect(find.byKey(const ValueKey('vacation-banner')), findsOneWidget, reason: 'p2 of this store is away, so the page says so');
    });

    testWidgets('a failing storefront call shows the error in a snackbar and keeps the listings', (tester) async {
      await open(tester, fail: ApiException('Store not found.'));
      expect(find.text('Store not found.'), findsOneWidget);
      expect(find.text('Item p1'), findsOneWidget);
      expect(find.byKey(const ValueKey('policy-returns')), findsNothing);
    });

    testWidgets('the French error', (tester) async {
      await engageReset(products: [engageDto('p1')], lang: 'fr');
      await open(tester, lang: 'fr', fail: ApiException('Store not found.'));
      expect(find.text('Boutique introuvable.'), findsOneWidget);
    });

    testWidgets('the store page carries the message-the-seller entry', (tester) async {
      await open(tester);
      final b = tester.widget<MessageSellerButton>(find.byType(MessageSellerButton));
      expect(b.sellerId, 's1');
      expect(b.storeName, 'Kinshasa Traders');
    });

    testWidgets('the vacation state of the listings follows on the cards of the store page', (tester) async {
      await open(tester);
      expect(find.byKey(const ValueKey('vacation-tag')), findsOneWidget, reason: 'p2 only');
    });
  });
}
