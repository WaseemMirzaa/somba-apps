// The screens of the engagement features at two phone widths (360 and 402 pt), in English and French, at text scale
// 1.0 and 1.3, with the app's real fonts and Congolese-franc prices: product page (gallery, flash badge, Q&A, store
// on vacation, handling time), cards, Deals with and without flash sales, the Home flash section, the store page
// (policies, vacation banner), the full-screen gallery and the ask-a-question sheet. Fails on any overflow, a button
// label that wraps, a price cut short, text over text, an icon on a label button, or two filled buttons.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/screens/deals_screen.dart';
import 'package:lipcart/screens/home_screen.dart';
import 'package:lipcart/screens/more/engage_gallery.dart';
import 'package:lipcart/screens/more/shop_extra.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/services/engage_store.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/theme/app_theme.dart';
import 'package:lipcart/util/format.dart';

import 'button_rules.dart';
import 'engage_helpers.dart';
import 'gap_helpers.dart';
import 'layout_checks.dart';

const _pictures = ['https://img.example.com/a.png', 'https://img.example.com/b.png', 'https://img.example.com/c.png'];

Map<String, dynamic> _item(String id, String name, String nameFr, double price, {double? was, int stock = 12, Map<String, dynamic> extra = const {}}) => {
      'id': id,
      'name': name,
      'nameFr': nameFr,
      'price': price,
      'originalPrice': was ?? price,
      'discount': was == null ? 0 : (100 * (was - price) / was).round(),
      'category': 'Fashion & shoes',
      'categoryFr': 'Mode et chaussures',
      'categoryId': 'c1',
      'image': _pictures.first,
      'images': _pictures,
      'stock': stock,
      'rating': 4.6,
      'reviewsCount': 1284,
      'sellerId': 's1',
      'sellerName': 'Kinshasa Traders',
      'description': 'Breathable mesh upper, cushioned sole and a reinforced heel for long days on the move.',
      'descriptionFr': 'Dessus en maille respirante, semelle amortie et talon renforcé pour les longues journées.',
      'deliveryDays': 3,
      'sku': 'SHOE-42/BLK',
      'brand': 'Somba Sport',
      ...extra,
    };

final _catalogue = [
  // p1: a flash sale is running on it
  _item('p1', 'Running shoes Air Comfort Pro', 'Chaussures de course Air Comfort Pro', 49.9, was: 70.25, extra: {'priceSource': 'flash', 'sellerHandlingDays': 3, 'totalDeliveryDays': 6}),
  // p2: a store on vacation
  _item('p2', 'Wireless earbuds with charging case', 'Écouteurs sans fil avec boîtier de recharge', 129.5, was: 159, extra: {...vacationFields(), 'sellerId': 's2', 'sellerName': 'Mama Tech Électronique Centre'}),
  _item('p3', 'Cotton wax print dress', 'Robe en wax de coton imprimé', 35, was: 50, extra: {'campaignId': '0b2d6a2c-1111-4222-8333-444455556666', 'priceSource': 'campaign', 'campaignPct': 30}),
  _item('p4', 'Stainless steel kettle 1.7 L', 'Bouilloire en acier inoxydable 1,7 L', 24.75, was: 40),
];

Future<void> _seed(String lang, {bool sales = true}) async {
  await engageReset(products: [for (final j in _catalogue) ProductDto.fromJson(j)], lang: lang);
  marketNotifier.value = MarketProfileId.drc; // franc amounts: the longest prices
  final store = RealtimeStore.instance;
  store.user = gapUser(phone: '+243812345678');
  store.categories
    ..clear()
    ..add(CategoryDto.fromJson({'id': 'c1', 'name': 'Fashion & shoes', 'nameFr': 'Mode et chaussures', 'image': '', 'productCount': 128}));
  store.debugCallRequest = (event, [body]) async => switch (event) {
        'flashsales:list' => sales
            ? [
                flashJson('f1', 'p1', endsInMs: 2 * 86400000 + 3 * 3600000 + 14 * 60000 + 9000, flashPrice: 49.9, basePrice: 70.25, discount: 29),
                flashJson('f2', 'p4', endsInMs: 5400000, flashPrice: 24.75, basePrice: 40, discount: 38),
              ]
            : const <dynamic>[],
        'reviews:list' => [
            {'id': 'r1', 'author': 'Bénédicte Kalala', 'rating': 5, 'text': 'Very comfortable, true to size. Delivered in two days to Limete.', 'sellerReply': 'Thank you! Enjoy your runs.'},
          ],
        'questions:list' => [
            {
              'id': 'q1',
              'productId': 'p1',
              'askerId': 'u1',
              'question': 'Does the 42 fit a wide foot with an orthopaedic insole?',
              'answer': 'Yes, the toe box is wide and the insole can be removed.',
              'answeredAt': '2026-10-25T10:30:00.000Z',
            },
            {'id': 'q2', 'productId': 'p1', 'askerId': 'u9', 'question': 'Is it waterproof?', 'answer': null},
          ],
        'sellers:storefront' => {
            'seller': {
              'id': 's1',
              'name': 'Kinshasa Traders',
              'rating': 4.6,
              'badge': 'gold',
              'description': 'Shoes and more, straight from the Kinshasa workshops.',
              'descriptionFr': 'Chaussures et plus, directement des ateliers de Kinshasa.',
              'returnsPolicy': 'Returns are accepted within 7 days if the shoes are unworn and in their box.',
              'returnsPolicyFr': 'Les retours sont acceptés sous 7 jours si les chaussures sont non portées et dans leur boîte.',
              'shippingPolicy': 'Parcels leave on Mondays and Thursdays from our Gombe workshop.',
              'shippingPolicyFr': 'Les colis partent le lundi et le jeudi depuis notre atelier de la Gombe.',
              'handlingDays': 3,
              'onVacation': true,
              'vacationUntil': '2026-11-12T22:59:59.000Z',
            },
          },
        _ => const <dynamic>[],
      };
  await EngageStore.instance.loadFlashSales();
}

Widget _app(Widget home, LayoutConfig c) => MaterialApp(
      theme: AppTheme.light(),
      locale: Locale(c.lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      builder: scaleText(c),
      home: home,
    );

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });

  tearDown(() {
    RealtimeStore.instance.categories.clear();
    engageTearDown();
  });

  /// [interact] runs after the first pump (open a sheet, expand a section…).
  final screens = <String, ({Widget Function(Locale l) build, Future<void> Function(WidgetTester t)? interact, bool sales})>{
    'product page: gallery, flash badge, brand and SKU, handling time, Q&A': (build: (l) => ProductDetailScreen(product: productByUuid('p1')!, locale: l), interact: null, sales: true),
    'product page: no flash sale': (build: (l) => ProductDetailScreen(product: productByUuid('p1')!, locale: l), interact: null, sales: false),
    'product page: store on vacation': (build: (l) => ProductDetailScreen(product: productByUuid('p2')!, locale: l), interact: null, sales: true),
    'deals: running flash sales': (build: (l) => DealsScreen(locale: l), interact: null, sales: true),
    'deals: no flash sale': (build: (l) => DealsScreen(locale: l), interact: null, sales: false),
    'home: flash sale section': (build: (l) => HomeScreen(locale: l, onLocaleChanged: (_) {}), interact: null, sales: true),
    'home: no flash sale': (build: (l) => HomeScreen(locale: l, onLocaleChanged: (_) {}), interact: null, sales: false),
    'store page: policies, handling time, vacation banner': (build: (l) => StoreScreen(locale: l, sellerId: 's1', sellerName: 'Kinshasa Traders'), interact: null, sales: true),
    'store page: policies expanded': (
      build: (l) => StoreScreen(locale: l, sellerId: 's1', sellerName: 'Kinshasa Traders'),
      interact: (t) async {
        await t.tap(find.byKey(const ValueKey('policy-returns')));
        await t.pump(const Duration(milliseconds: 400));
        await t.tap(find.byKey(const ValueKey('policy-shipping')));
        await t.pump(const Duration(milliseconds: 400));
      },
      sales: true
    ),
    'store page: a store on vacation (cards tagged)': (build: (l) => StoreScreen(locale: l, sellerId: 's2', sellerName: 'Mama Tech Électronique Centre'), interact: null, sales: true),
    'full-screen gallery': (build: (l) => GalleryScreen(product: productByUuid('p1')!, initial: 1), interact: null, sales: true),
  };

  for (final e in screens.entries) {
    testWidgets('layout matrix: ${e.key}', (tester) async {
      addTearDown(tester.view.reset);
      final found = <String>[];
      for (final c in layoutConfigs) {
        await _seed(c.lang, sales: e.value.sales);
        final locale = Locale(c.lang);
        final app = _app(e.value.build(locale), c);
        final interact = e.value.interact;
        for (final p in await layoutProblems(tester, c, app, interact: interact == null ? () async => expectButtonRules(tester) : () => interact(tester))) {
          found.add('[$c] $p');
        }
      }
      expect(found, isEmpty, reason: found.join('\n'));
    });
  }

  // The ask-a-question sheet sits over the page, so the overlap check (which reads every text on screen, including
  // the page behind the dimmed barrier) does not apply: look for layout errors and button rules, with the keyboard up.
  testWidgets('layout matrix: ask a question sheet, keyboard open', (tester) async {
    addTearDown(tester.view.reset);
    addTearDown(tester.view.resetViewInsets);
    final found = <String>[];
    for (final c in layoutConfigs) {
      await _seed(c.lang);
      tester.view.physicalSize = c.size * 3;
      tester.view.devicePixelRatio = 3;
      tester.view.resetViewInsets();
      final previous = FlutterError.onError;
      FlutterError.onError = (d) => found.add('[$c] ${d.exceptionAsString().split('\n').first}');
      try {
        await tester.pumpWidget(KeyedSubtree(key: UniqueKey(), child: _app(ProductDetailScreen(product: productByUuid('p1')!, locale: Locale(c.lang)), c)));
        await tester.pump(const Duration(milliseconds: 600));
        await tester.ensureVisible(find.byKey(const ValueKey('qa-ask')));
        await tester.pump();
        await tester.tap(find.byKey(const ValueKey('qa-ask')));
        await tester.pump(const Duration(milliseconds: 600));
        if (find.byKey(const ValueKey('qa-field')).evaluate().isEmpty) found.add('[$c] the sheet did not open');
        tester.view.viewInsets = const FakeViewPadding(bottom: 300 * 3);
        await tester.pump(const Duration(milliseconds: 300));
        // Type something long, so the field grows to its three lines.
        await tester.enterText(find.byKey(const ValueKey('qa-field')), 'Does the 42 fit a wide foot with an orthopaedic insole and thick winter socks, please?');
        await tester.pump();
        expectButtonRules(tester);
      } finally {
        FlutterError.onError = previous;
      }
    }
    expect(found, isEmpty, reason: found.join('\n'));
  });
}
