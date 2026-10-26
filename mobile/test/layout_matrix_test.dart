// The main screens at two phone widths (360 and 402 pt), in English and French, at text scale 1.0 and 1.3, with
// the app's real fonts and Congolese-franc prices (the longest amounts). Fails on any overflow or layout error, a
// button label that wraps or is cut, a price cut short, or a button or text drawn over other text.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/screens/account_screen.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/categories_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/home_screen.dart';
import 'package:lipcart/screens/more/account_more.dart';
import 'package:lipcart/screens/more/browse.dart';
import 'package:lipcart/screens/more/catalog_extra.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/more/search_screen.dart';
import 'package:lipcart/screens/order_success_screen.dart';
import 'package:lipcart/screens/orders_screen.dart';
import 'package:lipcart/screens/payment_pending_screen.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/screens/wallet_screen.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/util/format.dart';

import 'gap_helpers.dart';
import 'layout_checks.dart';

const _variants = '[{"name":"Size","options":["41","42","43","44"]},{"name":"Colour","options":["Black","White","Navy blue"]}]';
const _variantLabels =
    '{"fr":[{"name":"Pointure","options":["41","42","43","44"]},{"name":"Couleur","options":["Noir","Blanc","Bleu marine"]}]}';

ProductDto _product(String id, {required String name, required String nameFr, double price = 49.9, double? was, int stock = 12, bool options = false}) =>
    ProductDto.fromJson({
      'id': id,
      'name': name,
      'nameFr': nameFr,
      'price': price,
      'originalPrice': was ?? price,
      'discount': was == null ? 0 : (100 * (was - price) / was).round(),
      'category': 'Fashion & shoes',
      'categoryFr': 'Mode et chaussures',
      'categoryId': 'c1',
      'image': '',
      'stock': stock,
      'rating': 4.6,
      'reviewsCount': 1284,
      'sellerId': 's1',
      'sellerName': 'Kinshasa Traders',
      'description': 'Breathable mesh upper, cushioned sole and a reinforced heel for long days on the move.',
      'descriptionFr': 'Dessus en maille respirante, semelle amortie et talon renforcé pour les longues journées.',
      'deliveryDays': 3,
      if (was != null) 'campaignPct': 20,
      if (was != null) 'priceSource': 'campaign',
      if (options) 'variants': _variants,
      if (options) 'variantLabels': _variantLabels,
    });

final _products = [
  _product('p1', name: 'Running shoes Air Comfort Pro', nameFr: 'Chaussures de course Air Comfort Pro', price: 49.9, was: 70.25, stock: 3, options: true),
  _product('p2', name: 'Wireless earbuds with charging case', nameFr: 'Écouteurs sans fil avec boîtier de recharge', price: 129.5, was: 159),
  _product('p3', name: 'Cotton wax print dress', nameFr: 'Robe en wax de coton imprimé', price: 35),
  _product('p4', name: 'Stainless steel kettle 1.7 L', nameFr: 'Bouilloire en acier inoxydable 1,7 L', price: 24.75, stock: 0),
];

Map<String, dynamic> _line(String id, String name, String nameFr, double price, {String? seller, String? fulfilment, String? cancelReason}) => {
      'productId': id,
      'productName': name,
      'productNameFr': nameFr,
      'qty': 2,
      'priceUsd': price,
      'listPriceUsd': price * 1.4,
      'variant': 'Size: 42 · Colour: Navy blue',
      'variantFr': 'Pointure : 42 · Couleur : Bleu marine',
      'sellerId': seller == null ? 's1' : 's2',
      'sellerName': seller ?? 'Kinshasa Traders',
      if (fulfilment != null) 'fulfilment': fulfilment,
      if (cancelReason != null) 'cancelReason': cancelReason,
      if (cancelReason != null) 'refundedUsd': price * 2,
    };

OrderDto _order(String status, {bool multi = false}) => OrderDto.fromJson({
      'id': 'o-$status${multi ? '-multi' : ''}',
      'reference': 'SOM-104${multi ? 3 : 2}',
      'customerName': 'Aline',
      'status': status,
      'paymentMethod': 'airtel_money',
      'subtotalUsd': 358.8,
      'deliveryFeeUsd': 3,
      'discountUsd': 5,
      'promoCode': 'BIENVENUE',
      'totalUsd': 356.8,
      'campaignDiscountUsd': 40.7,
      'estimatedDeliveryDate': '2026-10-28',
      'createdAt': '2026-10-24T09:30:00Z',
      'shippingAddress': '{"label":"Maison","line1":"12, avenue du Commerce","commune":"Gombe","city":"Kinshasa","phone":"+243812345678"}',
      if (status == 'out_for_delivery') 'rider': {'name': 'Jean-Pierre Mukendi', 'phone': '+243 810 000 000'},
      'items': [
        _line('p1', 'Running shoes Air Comfort Pro', 'Chaussures de course Air Comfort Pro', 49.9),
        _line('p2', 'Wireless earbuds with charging case', 'Écouteurs sans fil avec boîtier de recharge', 129.5),
        if (multi)
          _line('p3', 'Cotton wax print dress', 'Robe en wax de coton imprimé', 35,
              seller: 'Mama Tech Électronique Centre', fulfilment: 'cancelled', cancelReason: 'Article épuisé chez le vendeur'),
      ],
    });

Future<void> _seed(String lang) async {
  await gapReset(products: _products, lang: lang);
  marketNotifier.value = MarketProfileId.drc; // franc amounts: the longest prices
  final store = RealtimeStore.instance;
  store.user = gapUser(phone: '+243812345678');
  store.walletBalance = 1250.5;
  store.addresses
    ..clear()
    ..add(AddressDto.fromJson({
      'id': 'a1',
      'label': 'Maison',
      'line1': '12, avenue du Commerce, près du marché central',
      'city': 'Kinshasa',
      'commune': 'Gombe',
      'phone': '+243812345678',
      'isDefault': true,
    }));
  store.categories
    ..clear()
    ..addAll([
      CategoryDto.fromJson({'id': 'c1', 'name': 'Fashion & shoes', 'nameFr': 'Mode et chaussures', 'image': '', 'productCount': 128}),
      CategoryDto.fromJson({'id': 'c2', 'name': 'Phones & tablets', 'nameFr': 'Téléphones et tablettes', 'image': '', 'productCount': 64}),
      CategoryDto.fromJson({'id': 'c3', 'name': 'Home & kitchen appliances', 'nameFr': 'Maison et électroménager', 'image': '', 'productCount': 37}),
    ]);
  store.banners
    ..clear()
    ..add(BannerDto.fromJson({
      'title': 'Free delivery this weekend',
      'body': 'On every order over 50 dollars in Kinshasa.',
      'titleFr': 'Livraison gratuite ce week-end',
      'bodyFr': 'Sur toute commande de plus de 50 dollars à Kinshasa.',
    }));
  store.orders
    ..clear()
    ..addAll([
      _order('pending'),
      _order('confirmed'),
      _order('processing', multi: true),
      _order('out_for_delivery'),
      _order('delivered'),
      _order('cancelled'),
    ]);
  store.payments
    ..clear()
    ..add(PaymentDto.fromJson(
        {'id': 'pay1', 'reference': 'PAY-77', 'orderId': 'o-pending', 'orderReference': 'SOM-1042', 'method': 'airtel_money', 'amountUsd': 356.8}));
  store.riderLocations['o-out_for_delivery'] = RiderLocationDto(orderId: 'o-out_for_delivery', lat: -4.3217, lng: 15.3125);
  store.notifications
    ..clear()
    ..addAll([
      NotificationDto.fromJson({
        'id': 'n1',
        'title': 'Your order SOM-1042 is out for delivery',
        'titleFr': 'Votre commande SOM-1042 est en cours de livraison',
        'body': 'Jean-Pierre is on the way. Keep your delivery code ready.',
        'bodyFr': 'Jean-Pierre est en route. Gardez votre code de livraison à portée de main.',
        'type': 'order',
        'createdAt': '2026-10-24T09:30:00Z',
      }),
      NotificationDto.fromJson({
        'id': 'n2',
        'title': 'Refund to your wallet',
        'titleFr': 'Remboursement sur votre portefeuille',
        'body': 'A cancelled item was refunded.',
        'bodyFr': 'Un article annulé a été remboursé.',
        'type': 'wallet',
        'read': true,
      }),
    ]);
  store.debugCallRequest = (event, [body]) async => switch (event) {
        'reviews:list' => [
            {
              'id': 'r1',
              'author': 'Bénédicte Kalala',
              'rating': 5,
              'text': 'Very comfortable, true to size. Delivered in two days to Limete.',
              'sellerReply': 'Thank you! Enjoy your runs.',
            },
            {'id': 'r2', 'author': 'Patrick', 'rating': 4, 'text': 'Good value.'},
          ],
        'questions:list' => [
            {'id': 'q1', 'question': 'Does the 42 fit a wide foot?', 'answer': 'Yes, the toe box is wide.'},
          ],
        'delivery:quote' => gapQuoteJson(fee: 5, transfer: 1.5),
        _ => const <dynamic>[],
      };
  final p = productByUuid('p1')!;
  ShopState.instance
    ..addToCart(p, variant: 'Size: 42 · Colour: Navy blue', qty: 2)
    ..addToCart(productByUuid('p2')!, qty: 1);
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });

  tearDown(() {
    RealtimeStore.instance
      ..debugCallRequest = null
      ..categories.clear()
      ..banners.clear()
      ..payments.clear()
      ..notifications.clear()
      ..riderLocations.clear();
    gapTearDown();
  });

  final screens = <String, Widget Function(Locale l)>{
    'home': (l) => HomeScreen(locale: l, onLocaleChanged: (_) {}),
    'categories': (l) => CategoriesScreen(locale: l),
    'category products': (l) => ProductListScreen(locale: l, categoryId: 'c1', title: l.languageCode == 'fr' ? 'Mode et chaussures' : 'Fashion & shoes'),
    'search': (l) => SearchScreen(locale: l, initialText: 'a'),
    'product detail (options, seller, reviews)': (l) => ProductDetailScreen(product: productByUuid('p1')!, locale: l),
    'product detail (out of stock)': (l) => ProductDetailScreen(product: productByUuid('p4')!, locale: l),
    'cart': (l) => CartScreen(locale: l),
    'checkout': (l) => CheckoutScreen(locale: l),
    'payment pending': (l) => PaymentPendingScreen(locale: l, orderId: 'o-pending'),
    'order success': (l) => OrderSuccessScreen(locale: l, orderId: 'o-confirmed'),
    'order list': (l) => OrdersScreen(locale: l),
    'order detail (pending)': (l) => OrderDetailScreen(locale: l, orderId: 'o-pending'),
    'order detail (confirmed)': (l) => OrderDetailScreen(locale: l, orderId: 'o-confirmed'),
    'order detail (multi-seller)': (l) => OrderDetailScreen(locale: l, orderId: 'o-processing-multi'),
    'order detail (delivered)': (l) => OrderDetailScreen(locale: l, orderId: 'o-delivered'),
    'order tracking': (l) => OrderTrackingScreen(locale: l, orderId: 'o-out_for_delivery'),
    'account': (l) => AccountScreen(locale: l, onLocaleChanged: (_) {}),
    'notifications': (l) => NotificationsScreen(locale: l),
    'wallet': (l) => WalletScreen(locale: l),
    'stores directory': (l) => SellersDirectoryScreen(locale: l),
  };

  for (final e in screens.entries) {
    testWidgets('layout matrix: ${e.key}', (tester) async {
      addTearDown(tester.view.reset);
      final found = <String>[];
      for (final c in layoutConfigs) {
        await _seed(c.lang);
        final locale = Locale(c.lang);
        final app = MaterialApp(
          theme: AppTheme.light(),
          locale: locale,
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          builder: scaleText(c),
          home: e.value(locale),
        );
        for (final p in await layoutProblems(tester, c, app)) {
          found.add('[$c] $p');
        }
      }
      expect(found, isEmpty, reason: found.join('\n'));
    });
  }
}
