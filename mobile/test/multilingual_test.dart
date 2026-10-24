// EN / FR content: the new API fields parse (and old payloads still do), the screens show the shopper's language,
// searching ignores accents, the purchase key stays canonical, and "See translation" works on reviews and Q&A.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/catalog_models.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/notification_text.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/account_more.dart';
import 'package:lipcart/screens/more/browse.dart';
import 'package:lipcart/screens/more/catalog_extra.dart';
import 'package:lipcart/screens/more/order_after_sale.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/more/shop_extra.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/screens/wallet_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/push_service.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/text_fold.dart';
import 'package:lipcart/widgets/translatable_text.dart';

import 'gap_helpers.dart';

const _variants = '[{"name":"Size","options":["41","42"]},{"name":"Colour","options":["Black","White"]}]';
const _labels = {
  'en': [
    {'name': 'Size', 'options': ['41', '42']},
    {'name': 'Colour', 'options': ['Black', 'White']},
  ],
  'fr': [
    {'name': 'Taille', 'options': ['41', '42']},
    {'name': 'Couleur', 'options': ['Noir', 'Blanc']},
  ],
};

Map<String, dynamic> _product({Map<String, dynamic> extra = const {}}) => {
      'id': 'shoe',
      'name': 'Running shoe',
      'nameFr': 'Chaussure de course',
      'description': 'Light and soft.',
      'descriptionFr': 'Légère et douce.',
      'price': 40,
      'originalPrice': 40,
      'category': 'Fashion',
      'categoryFr': 'Mode',
      'categoryId': 'c-fashion',
      'image': '',
      'stock': 9,
      'variants': _variants,
      'variantLabels': _labels,
      'sourceLang': 'en',
      'machineTranslated': ['nameFr', 'descriptionFr', 'variantLabels'],
      'translationStatus': 'done',
      ...extra,
    };

/// A listing the way an older server sends it: no French description, no labels, no ids.
Map<String, dynamic> _oldProduct() => {
      'id': 'old',
      'name': 'Old lamp',
      'nameFr': 'Vieille lampe',
      'description': 'Only English here.',
      'price': 10,
      'category': 'Home',
      'categoryFr': 'Maison',
      'image': '',
      'stock': 3,
      'variants': _variants,
    };

Map<String, dynamic> _orderJson() => {
      'id': 'o1',
      'reference': 'SOM-77',
      'customerName': 'Aline',
      'status': 'delivered',
      'paymentMethod': 'wallet',
      'subtotalUsd': 40,
      'totalUsd': 43,
      'items': [
        {
          'productId': 'shoe',
          'productName': 'Running shoe',
          'productNameFr': 'Chaussure de course',
          'variant': 'Size: 42 · Colour: Black',
          'variantFr': 'Taille : 42 · Couleur : Noir',
          'qty': 1,
          'priceUsd': 40,
        },
        {'productId': 'old', 'productName': 'Old lamp', 'variant': 'Default', 'qty': 2, 'priceUsd': 5},
      ],
    };

/// Every `translate:text` the screens sent, answered by the test.
final _asked = <Map<String, dynamic>>[];
Future<dynamic> Function(Map<String, dynamic> body) _answer = (_) async => {'text': '?', 'sourceLang': 'fr', 'same': false};

Future<dynamic> _fakeTranslate(String event, [Map<String, dynamic>? body]) async {
  expect(event, 'translate:text');
  _asked.add(body!);
  return _answer(body);
}

/// Every `orders:create` the checkout sent.
final _sent = <Map<String, dynamic>>[];
Future<dynamic> _fakeOrders(String event, [Map<String, dynamic>? body]) async {
  _sent.add(body!);
  return {'id': 'o-1', 'reference': 'SOM-1', 'status': 'confirmed', 'paymentMethod': body['paymentMethod'], 'items': const []};
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(() {
    gapTearDown();
    final store = RealtimeStore.instance;
    store.debugTranslateRequest = null;
    store.categories.clear();
    store.notifications.clear();
    store.walletTransactions.clear();
  });

  group('DTO parsing', () {
    test('a new product payload keeps every new field', () {
      final d = ProductDto.fromJson(_product());
      expect(d.descriptionFr, 'Légère et douce.');
      expect(d.categoryId, 'c-fashion');
      expect(d.sourceLang, 'en');
      expect(d.machineTranslated, ['nameFr', 'descriptionFr', 'variantLabels']);
      expect(d.translationStatus, 'done');
      expect(d.variants.map((g) => g.name), ['Size', 'Colour']);
      expect(d.variantLabels['fr']!.map((g) => g.name), ['Taille', 'Couleur']);
      expect(d.variantLabels['fr']![1].options, ['Noir', 'Blanc']);
      final p = productFromDto(d);
      expect(p.descriptionFr, 'Légère et douce.');
      expect(p.categoryId, 'c-fashion');
      expect(p.machineTranslated, contains('descriptionFr'));
      expect(p.variantLabels['en']![0].name, 'Size');
    });

    test('an old payload without the new fields still parses, with safe defaults', () {
      final d = ProductDto.fromJson(_oldProduct());
      expect(d.descriptionFr, isNull);
      expect(d.categoryId, isNull);
      expect(d.variantLabels, isEmpty);
      expect(d.sourceLang, 'en');
      expect(d.machineTranslated, isEmpty);
      expect(d.translationStatus, 'off');
      final p = productFromDto(d);
      expect(p.displayDescription('fr'), 'Only English here.', reason: 'no French yet: the English text');
      expect(p.variantOptionLabel(1, 0, 'fr'), 'Black', reason: 'no labels: the canonical option');
      expect(ProductDto.fromJson({'id': 'x', 'name': 'x', 'price': 5, 'stock': 1}).displayDescription('fr'), '');
    });

    test('variantLabels accepts JSON text and drops a language whose shape does not match', () {
      final text = ProductDto.fromJson(_product(extra: {
        'variantLabels': '{"fr":[{"name":"Taille","options":["41","42"]},{"name":"Couleur","options":["Noir","Blanc"]}]}',
      }));
      expect(text.variantLabels.keys, ['fr']);

      final bad = ProductDto.fromJson(_product(extra: {
        'variantLabels': {
          'fr': [
            {'name': 'Taille', 'options': ['41']}, // one option short
            {'name': 'Couleur', 'options': ['Noir', 'Blanc']},
          ],
          'en': [
            {'name': 'Size', 'options': ['41', '42']},
          ], // one group short
        },
      }));
      expect(bad.variantLabels, isEmpty, reason: 'C-I4: a misaligned label set is ignored');
      expect(ProductDto.fromJson(_product(extra: {'variantLabels': 'not json'})).variantLabels, isEmpty);
      expect(ProductDto.fromJson(_product(extra: {'machineTranslated': 'oops'})).machineTranslated, isEmpty);
    });

    test('categories carry productCount, and an old category still parses', () {
      final c = CategoryDto.fromJson({'id': 'c1', 'name': 'Fashion', 'nameFr': 'Mode', 'image': '', 'productCount': 12, 'sourceLang': 'fr'});
      expect((c.productCount, c.sourceLang), (12, 'fr'));
      final old = CategoryDto.fromJson({'id': 'c2', 'name': 'Home', 'image': ''});
      expect((old.productCount, old.nameFr, old.sourceLang), (null, 'Home', 'en'));
    });

    test('order lines carry the French snapshot, and an old order falls back to the stored name', () {
      final o = OrderDto.fromJson(_orderJson());
      expect(o.items[0].displayName('fr'), 'Chaussure de course');
      expect(o.items[0].displayName('en'), 'Running shoe');
      expect(o.items[0].displayVariant('fr'), 'Taille : 42 · Couleur : Noir');
      expect(o.items[0].displayVariant('en'), 'Size: 42 · Colour: Black');
      expect(o.items[0].variant, 'Size: 42 · Colour: Black', reason: 'the canonical value is untouched');
      expect(o.items[1].displayName('fr'), 'Old lamp');
      expect(o.items[1].hasVariant, isFalse);
      expect(o.items[1].displayVariant('fr'), 'Default');
    });

    test('notifications and wallet lines carry titleFr / bodyFr / descriptionFr, and survive "mark read"', () {
      final n = NotificationDto.fromJson({'id': 'n1', 'title': 'Order placed', 'body': 'x', 'titleFr': 'Commande enregistrée', 'bodyFr': 'y', 'type': 'order', 'read': false});
      expect((n.titleFr, n.bodyFr), ('Commande enregistrée', 'y'));
      expect(n.asRead().titleFr, 'Commande enregistrée');
      expect(n.asRead().read, isTrue);
      final old = NotificationDto.fromJson({'id': 'n2', 'title': 'Order placed', 'body': 'x', 'type': 'order'});
      expect((old.titleFr, old.bodyFr), (null, null));
      final w = WalletTransactionDto.fromJson({'id': 'w', 'type': 'topup', 'amount': 5, 'balance': 5, 'description': 'Order SOM-1', 'descriptionFr': 'Commande SOM-1'});
      expect(w.descriptionFr, 'Commande SOM-1');
      expect(WalletTransactionDto.fromJson({'id': 'w', 'description': 'x'}).descriptionFr, isNull);
    });

    test('home banners carry titleFr / bodyFr and an old banner shows its English text in French', () {
      final b = BannerDto.fromJson({'title': 'Sale', 'body': 'Everything 20% off', 'titleFr': 'Soldes', 'bodyFr': 'Tout à -20 %'});
      expect((b.displayTitle('fr'), b.displayBody('fr')), ('Soldes', 'Tout à -20 %'));
      expect((b.displayTitle('en'), b.displayBody('en')), ('Sale', 'Everything 20% off'));
      final old = BannerDto.fromJson({'title': 'Sale', 'body': 'Everything 20% off'});
      expect((old.displayTitle('fr'), old.displayBody('fr')), ('Sale', 'Everything 20% off'));
    });

    test('a translate:text answer parses with and without `same`', () {
      final t = TextTranslation.fromJson({'text': 'Great', 'sourceLang': 'fr', 'same': false});
      expect((t.text, t.sourceLang, t.same), ('Great', 'fr', false));
      expect(TextTranslation.fromJson({'text': 'x'}).same, isFalse);
      expect(TextTranslation.fromJson({'text': 'x', 'same': true}).same, isTrue);
    });
  });

  group('display fallbacks', () {
    test('description: French when present, the other language until it exists', () {
      final p = productFromDto(ProductDto.fromJson(_product()));
      expect(p.displayDescription('fr'), 'Légère et douce.');
      expect(p.displayDescription('en'), 'Light and soft.');
      final onlyFr = productFromDto(ProductDto.fromJson(_product(extra: {'description': null, 'descriptionFr': 'Seulement en français.', 'sourceLang': 'fr'})));
      expect(onlyFr.displayDescription('en'), 'Seulement en français.');
      final noFr = productFromDto(ProductDto.fromJson(_product(extra: {'descriptionFr': null})));
      expect(noFr.displayDescription('fr'), 'Light and soft.');
    });

    test('name, category and option labels follow the language, with fallbacks', () {
      final p = productFromDto(ProductDto.fromJson(_product()));
      expect(p.displayName('fr'), 'Chaussure de course');
      expect(p.displayCategory('fr'), 'Mode');
      expect(p.displayCategory('en'), 'Fashion');
      expect(p.variantGroupLabel(1, 'fr'), 'Couleur');
      expect(p.variantGroupLabel(1, 'en'), 'Colour');
      expect(p.variantOptionLabel(1, 0, 'fr'), 'Noir');
      expect(p.variantOptionLabel(1, 1, 'en'), 'White');
      expect(p.variantOptionLabel(9, 9, 'fr'), '', reason: 'out of range is empty, never a crash');
      expect(p.displayVariant('Size: 42 · Colour: Black', 'fr'), 'Taille: 42 · Couleur: Noir');
      expect(p.displayVariant('Size: 42 · Colour: Black', 'en'), 'Size: 42 · Colour: Black');
      expect(p.displayVariant('Default', 'fr'), 'Default');
      expect(p.displayVariant('Size: 99 · Colour: Black', 'fr'), 'Size: 99 · Couleur: Noir', reason: 'an unknown option stays as it is');
    });

    test('machine flags look at the field that is shown', () {
      final p = productFromDto(ProductDto.fromJson(_product()));
      expect(p.nameIsMachine('fr'), isTrue);
      expect(p.nameIsMachine('en'), isFalse, reason: 'the English name is the seller\'s own');
      expect(p.descriptionIsMachine('fr'), isTrue);
      expect(p.descriptionIsMachine('en'), isFalse);
      expect(p.variantsAreMachine('fr'), isTrue);
      expect(p.variantsAreMachine('en'), isFalse, reason: 'the seller wrote the English labels');
      final frFirst = productFromDto(ProductDto.fromJson(_product(extra: {'sourceLang': 'fr', 'machineTranslated': ['name', 'description']})));
      expect(frFirst.nameIsMachine('en'), isTrue);
      expect(frFirst.descriptionIsMachine('en'), isTrue);
      expect(frFirst.nameIsMachine('fr'), isFalse);
      final old = productFromDto(ProductDto.fromJson(_oldProduct()));
      expect((old.nameIsMachine('fr'), old.descriptionIsMachine('fr'), old.variantsAreMachine('fr')), (false, false, false));
    });

    test('notices prefer the server\'s French, then the phone\'s patterns, then the raw text', () {
      const fr = Strings('fr'), en = Strings('en');
      expect(displayNotice(fr, title: 'Order placed', body: 'We received SOM-1. You\'ll get updates here in real time.', titleFr: 'Titre serveur', bodyFr: 'Corps serveur'),
          ('Titre serveur', 'Corps serveur'));
      expect(displayNotice(fr, title: 'Order placed', body: 'x'), ('Commande enregistrée', 'x'), reason: 'older server: the phone\'s pattern');
      expect(displayNotice(fr, title: 'Promo', body: 'Free!'), ('Promo', 'Free!'));
      expect(displayNotice(fr, title: 'Order placed', body: 'x', titleFr: '  ', bodyFr: null), ('Commande enregistrée', 'x'));
      expect(displayNotice(en, title: 'Order placed', body: 'x', titleFr: 'Titre', bodyFr: 'Corps'), ('Order placed', 'x'), reason: 'English shows what the server wrote');
      expect(localizeWalletDescription(fr, 'Order SOM-1', descriptionFr: 'Commande SOM-1 (serveur)'), 'Commande SOM-1 (serveur)');
      expect(localizeWalletDescription(fr, 'Refund for SOM-9'), 'Remboursement de SOM-9');
      expect(localizeWalletDescription(en, 'Order SOM-1', descriptionFr: 'Commande SOM-1'), 'Order SOM-1');
    });

    test('a push carries the French wording when the server puts it in the data', () {
      const m = PushMessage(title: 'Order update', body: 'SOM-1 is now shipped.', data: {'titleFr': 'Mise à jour', 'bodyFr': 'SOM-1 est expédiée.'});
      expect((m.titleFr, m.bodyFr), ('Mise à jour', 'SOM-1 est expédiée.'));
      expect(const PushMessage(title: 'x').titleFr, isNull);
    });

    test('the store description follows the language', () {
      expect(pickLang('fr', 'Fine shoes.', 'Belles chaussures.'), 'Belles chaussures.');
      expect(pickLang('fr', 'Fine shoes.', null), 'Fine shoes.');
      expect(pickLang('en', 'Fine shoes.', 'Belles chaussures.'), 'Fine shoes.');
      expect(pickLang('en', '', 'Belles chaussures.'), 'Belles chaussures.');
    });
  });

  group('search ignores accents (L15)', () {
    Product p(Map<String, dynamic> extra) => productFromDto(ProductDto.fromJson(_product(extra: extra)));

    test('foldText lowercases and strips accents', () {
      expect(foldText('Électronique'), 'electronique');
      expect(foldText('ÇA VA À LA MAISON'), 'ca va a la maison');
      expect(foldText('cœur d’été'), "coeur d'ete");
      expect(foldText('plain'), 'plain');
      expect(foldText('été'), 'ete', reason: 'combining accents too');
      expect(foldText(''), '');
    });

    test('"electronique" finds "Électronique" through the French category', () {
      final shoe = p({'category': 'Electronics', 'categoryFr': 'Électronique', 'name': 'Phone', 'nameFr': 'Téléphone'});
      final other = p({'id': 'o', 'category': 'Home', 'categoryFr': 'Maison', 'name': 'Lamp', 'nameFr': 'Lampe', 'description': 'Bright.', 'descriptionFr': 'Lumineuse.'});
      expect(runQuery([shoe, other], ProductQuery(text: 'electronique')).map((x) => x.uuid), ['shoe']);
      expect(runQuery([shoe, other], ProductQuery(text: 'ELECTRONICS')).map((x) => x.uuid), ['shoe']);
      expect(runQuery([shoe, other], ProductQuery(text: 'telephone')).map((x) => x.uuid), ['shoe'], reason: 'French name');
      expect(runQuery([shoe, other], ProductQuery(text: 'téléphone')).map((x) => x.uuid), ['shoe'], reason: 'accents typed too');
    });

    test('the French description and the English one are both searched', () {
      final lamp = p({'id': 'lamp', 'name': 'Lamp', 'nameFr': 'Lampe', 'category': 'Home', 'categoryFr': 'Maison', 'description': 'Warm light.', 'descriptionFr': 'Lumière chaude et douce.'});
      final shoe = p({});
      expect(runQuery([lamp, shoe], ProductQuery(text: 'lumiere chaude')).map((x) => x.uuid), ['lamp']);
      expect(runQuery([lamp, shoe], ProductQuery(text: 'warm')).map((x) => x.uuid), ['lamp']);
      expect(runQuery([lamp, shoe], ProductQuery(text: 'nothing like this')), isEmpty);
      expect(runQuery([lamp, shoe], ProductQuery(text: '  ')).length, 2, reason: 'a blank query keeps everything');
    });

    test('a product without descriptions (old server) is still searchable by name', () {
      final old = productFromDto(ProductDto.fromJson(_oldProduct()));
      expect(runQuery([old], ProductQuery(text: 'vieille')), hasLength(1));
      expect(runQuery([old], ProductQuery(text: 'MAISON')), hasLength(1));
    });

    test('the category filter prefers the id, so a renamed category keeps its products', () {
      final renamed = p({'category': 'Fashion & style', 'categoryId': 'c-fashion'});
      final other = p({'id': 'o', 'category': 'Fashion', 'categoryId': 'c-other'});
      final q = ProductQuery(category: 'Fashion', categoryId: 'c-fashion');
      expect(runQuery([renamed, other], q).map((x) => x.uuid), ['shoe'], reason: 'matched by id, not by the old name');
      // Older server: no ids, so the English name decides.
      final oldA = productFromDto(ProductDto.fromJson(_oldProduct()));
      expect(runQuery([oldA], ProductQuery(category: 'Home', categoryId: 'c-home')), hasLength(1));
      expect(runQuery([oldA], ProductQuery(category: 'Toys', categoryId: 'c-toys')), isEmpty);
      expect(ProductQuery(categoryId: 'c1').activeCount, 1);
    });
  });

  group('product page', () {
    setUp(() async {
      await gapReset(products: [ProductDto.fromJson(_product()), ProductDto.fromJson(_oldProduct())]);
      RealtimeStore.instance.zones = List.of(gapZones);
    });

    Future<void> open(WidgetTester tester, String uuid, String lang) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(ProductDetailScreen(product: productByUuid(uuid)!, locale: Locale(lang)), lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    testWidgets('French: name, description and option labels are French, with the "Traduit automatiquement" notes', (tester) async {
      await open(tester, 'shoe', 'fr');
      expect(find.text('Chaussure de course'), findsOneWidget);
      expect(find.byKey(const ValueKey('pd-description')), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const ValueKey('pd-description'))).data, 'Légère et douce.');
      expect(find.text('Taille'), findsOneWidget);
      expect(find.text('Couleur'), findsOneWidget);
      expect(find.text('Noir'), findsOneWidget);
      expect(find.text('Blanc'), findsOneWidget);
      expect(find.text('Black'), findsNothing);
      expect(find.text('Mode'), findsOneWidget, reason: 'the category pill');
      for (final k in ['machine-note-name', 'machine-note-description', 'machine-note-variants']) {
        expect(find.byKey(ValueKey(k)), findsOneWidget, reason: k);
      }
      expect(find.text('Traduit automatiquement'), findsNWidgets(3));
    });

    testWidgets('English: the seller\'s own English shows, with no machine note', (tester) async {
      await open(tester, 'shoe', 'en');
      expect(find.text('Running shoe'), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const ValueKey('pd-description'))).data, 'Light and soft.');
      expect(find.text('Colour'), findsOneWidget);
      expect(find.text('Black'), findsOneWidget);
      expect(find.text('Translated automatically'), findsNothing);
    });

    testWidgets('an older server (no French description, no labels) shows the English text and canonical options', (tester) async {
      await open(tester, 'old', 'fr');
      expect(tester.widget<Text>(find.byKey(const ValueKey('pd-description'))).data, 'Only English here.');
      expect(find.text('Size'), findsOneWidget);
      expect(find.text('Black'), findsOneWidget);
      expect(find.text('Traduit automatiquement'), findsNothing);
    });

    testWidgets('French labels are display only: the cart keeps the canonical "Size: 42 · Colour: Black" (and the checkout sends it)', (tester) async {
      await open(tester, 'shoe', 'fr');
      await tester.tap(find.byKey(const ValueKey('variant-Size-42')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('variant-Colour-Black')));
      await tester.pump();
      // The title echoes the choice in French.
      expect(tester.widget<Text>(find.byKey(const ValueKey('variant-title-Colour'))).data, 'Couleur: Noir');
      await tester.tap(find.widgetWithIcon(IconButton, Icons.add_shopping_cart_rounded));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));

      final line = ShopState.instance.cart.single;
      expect(line.variant, 'Size: 42 · Colour: Black', reason: 'the purchase key is never translated');
      expect(line.toJson()['v'], 'Size: 42 · Colour: Black');
      expect(line.variantText(const Strings('fr')), 'Taille: 42 · Couleur: Noir', reason: 'only the text shown changes');
      expect(line.variantText(const Strings('en')), 'Size: 42 · Colour: Black');

      // Checkout in French sends the canonical value to the server.
      final store = RealtimeStore.instance;
      store.walletBalance = 1000;
      store.addresses.add(AddressDto(id: 'a1', label: 'Home', line1: '12 Avenue de la Paix', city: 'Kinshasa', commune: 'Gombe', isDefault: true));
      store.debugPlaceOrderRequest = _fakeOrders;
      _sent.clear();
      await tester.pumpWidget(gapApp(const CheckoutScreen(locale: Locale('fr')), lang: 'fr'));
      await tester.pump(const Duration(milliseconds: 300));
      await tester.tap(find.byKey(const ValueKey('pay-wallet')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('place-order')));
      await tester.pump(const Duration(milliseconds: 400));
      expect(_sent, hasLength(1));
      final items = _sent.single['items'] as List;
      expect(items.single['variant'], 'Size: 42 · Colour: Black');
      expect(items.single['productId'], 'shoe');
    });

    testWidgets('the cart shows the French wording of the choice', (tester) async {
      ShopState.instance.addToCart(productByUuid('shoe')!, variant: 'Size: 41 · Colour: White');
      expect(ShopState.instance.cart.single.variantText(const Strings('fr')), 'Taille: 41 · Couleur: Blanc');
      expect(ShopState.instance.cart.single.variant, 'Size: 41 · Colour: White');
    });

    testWidgets('asking to choose an option names it in French', (tester) async {
      await open(tester, 'shoe', 'fr');
      await tester.tap(find.widgetWithIcon(IconButton, Icons.add_shopping_cart_rounded));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text(const Strings('fr').chooseOption('Taille'))), findsOneWidget);
      expect(ShopState.instance.cart, isEmpty);
    });
  });

  group('categories (L16)', () {
    setUp(() async {
      await gapReset(products: [ProductDto.fromJson(_product()), ProductDto.fromJson(_product(extra: {'id': 'shoe2', 'category': 'Fashion (renamed)', 'categoryFr': 'Mode (renommée)'}))]);
      RealtimeStore.instance.categories
        ..clear()
        ..add(CategoryDto.fromJson({'id': 'c-fashion', 'name': 'Fashion (renamed)', 'nameFr': 'Mode (renommée)', 'image': '', 'productCount': 2}));
    });

    testWidgets('the list opened from a category is titled and searched in French, not by the English key', (tester) async {
      gapTallViewport(tester);
      await Strings.setLang('fr', persist: false);
      await tester.pumpWidget(gapApp(const ProductListScreen(locale: Locale('fr'), category: 'Fashion', categoryId: 'c-fashion'), lang: 'fr'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.descendant(of: find.byType(AppBar), matching: find.text('Mode (renommée)')), findsOneWidget);
      expect(find.descendant(of: find.byType(AppBar), matching: find.text('Fashion')), findsNothing);
      expect(find.text(const Strings('fr').searchInCat('Mode (renommée)')), findsOneWidget);
      // Matched by id: both listings are there although one carries the old name.
      expect(find.text(const Strings('fr').itemsCount(2)), findsOneWidget);
    });

    testWidgets('English shows the English category name', (tester) async {
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(const ProductListScreen(locale: Locale('en'), category: 'Fashion', categoryId: 'c-fashion')));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.descendant(of: find.byType(AppBar), matching: find.text('Fashion (renamed)')), findsOneWidget);
    });

    test('counting follows the downloaded catalogue by id, and uses the server count before the first download', () {
      final c = categoryFromDto(RealtimeStore.instance.categories.single);
      expect(liveCategoryCountOf(c), 2);
      expect(categoryTitle(id: 'c-fashion', name: 'Fashion', lang: 'fr'), 'Mode (renommée)');
      expect(categoryTitle(name: 'Unknown', lang: 'fr'), 'Unknown');
      final store = RealtimeStore.instance;
      store.products.clear();
      store.hydrated = false;
      expect(liveCategoryCountOf(c), 2, reason: 'nothing downloaded yet: the count the server sent');
    });
  });

  group('orders, returns and receipts show the localized line (L8)', () {
    Future<void> openOrder(WidgetTester tester, String lang) async {
      await gapReset(products: [ProductDto.fromJson(_product())], lang: lang);
      RealtimeStore.instance.orders
        ..clear()
        ..add(OrderDto.fromJson(_orderJson()));
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(OrderDetailScreen(locale: Locale(lang), orderId: 'o1'), lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    testWidgets('order detail in French', (tester) async {
      await openOrder(tester, 'fr');
      expect(tester.widget<Text>(find.byKey(const ValueKey('order-line-name-shoe'))).data, 'Chaussure de course');
      expect(find.text('Running shoe'), findsNothing);
      expect(find.text('Taille : 42 · Couleur : Noir'), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const ValueKey('order-line-name-old'))).data, 'Old lamp', reason: 'an old order with no snapshot keeps its stored name');
    });

    testWidgets('order detail in English', (tester) async {
      await openOrder(tester, 'en');
      expect(tester.widget<Text>(find.byKey(const ValueKey('order-line-name-shoe'))).data, 'Running shoe');
      expect(find.text('Chaussure de course'), findsNothing);
      expect(find.text('Size: 42 · Colour: Black'), findsOneWidget);
    });

    test('the receipt and the review prompt use the French name', () {
      final o = OrderDto.fromJson(_orderJson());
      final fr = receiptText(const Strings('fr'), o);
      expect(fr, contains('1 × Chaussure de course (Taille : 42 · Couleur : Noir)'));
      expect(fr, contains('2 × Old lamp'));
      expect(receiptText(const Strings('en'), o), contains('1 × Running shoe (Size: 42 · Colour: Black)'));
    });

    testWidgets('buying again re-adds the canonical choice', (tester) async {
      await gapReset(products: [ProductDto.fromJson(_product())], lang: 'fr');
      final o = OrderDto.fromJson(_orderJson());
      await tester.pumpWidget(gapApp(Scaffold(body: Builder(builder: (ctx) => TextButton(onPressed: () => buyAgain(ctx, o, const Locale('fr')), child: const Icon(Icons.refresh)))), lang: 'fr'));
      await tester.tap(find.byType(TextButton));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(ShopState.instance.cart.single.variant, 'Size: 42 · Colour: Black');
    });
  });

  group('"See translation" on reviews and Q&A', () {
    setUp(() {
      _asked.clear();
      _answer = (_) async => {'text': 'Great product', 'sourceLang': 'fr', 'same': false};
      RealtimeStore.instance.debugTranslateRequest = _fakeTranslate;
    });

    Future<void> show(WidgetTester tester, Widget child, {String lang = 'en'}) async {
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: child)), lang: lang));
      await tester.pump();
    }

    Finder link(String kind, String id) => find.byKey(ValueKey('tt-link-$kind-$id'));
    Finder text(String kind, String id) => find.byKey(ValueKey('tt-text-$kind-$id'));
    String shown(WidgetTester tester, String kind, String id) => tester.widget<Text>(text(kind, id)).data!;

    testWidgets('toggles between the translation and the original, asking the server once', (tester) async {
      final r = ReviewDto(id: 'r1', author: 'Jo', rating: 5, text: 'Super produit');
      await show(tester, reviewTile(r, const Strings('en')));
      expect(shown(tester, 'review', 'r1'), 'Super produit');
      expect(find.text('See translation'), findsOneWidget);

      await tester.tap(link('review', 'r1'));
      await tester.pump();
      await tester.pump();
      expect(_asked, [
        {'kind': 'review', 'id': 'r1', 'target': 'en'}
      ]);
      expect(shown(tester, 'review', 'r1'), 'Great product');
      expect(find.text('See original'), findsOneWidget);
      expect(find.text('Translated automatically'), findsOneWidget, reason: 'machine text says so');

      await tester.tap(link('review', 'r1'));
      await tester.pump();
      expect(shown(tester, 'review', 'r1'), 'Super produit');
      expect(find.text('See translation'), findsOneWidget);
      expect(find.text('Translated automatically'), findsNothing);

      await tester.tap(link('review', 'r1'));
      await tester.pump();
      expect(shown(tester, 'review', 'r1'), 'Great product');
      expect(_asked, hasLength(1), reason: 'the second time it is remembered');
    });

    testWidgets('French wording and target', (tester) async {
      _answer = (_) async => {'text': 'Excellent produit', 'sourceLang': 'en', 'same': false};
      final r = ReviewDto(id: 'r2', author: 'Jo', rating: 4, text: 'Great product');
      await show(tester, reviewTile(r, const Strings('fr')), lang: 'fr');
      expect(find.text('Voir la traduction'), findsOneWidget);
      await tester.tap(link('review', 'r2'));
      await tester.pump();
      await tester.pump();
      expect(_asked.single['target'], 'fr');
      expect(find.text('Voir l’original'), findsOneWidget);
      expect(find.text('Traduit automatiquement'), findsOneWidget);
    });

    testWidgets('the seller reply is translated as `review_reply`, by the review id', (tester) async {
      final r = ReviewDto(id: 'r3', author: 'Jo', rating: 5, text: 'Great', sellerReply: 'Merci beaucoup');
      _answer = (b) async => {'text': b['kind'] == 'review_reply' ? 'Thank you very much' : 'x', 'sourceLang': 'fr', 'same': false};
      await show(tester, reviewTile(r, const Strings('en')));
      await tester.tap(link('review_reply', 'r3'));
      await tester.pump();
      await tester.pump();
      expect(_asked.single, {'kind': 'review_reply', 'id': 'r3', 'target': 'en'});
      expect(shown(tester, 'review_reply', 'r3'), 'Thank you very much');
      expect(shown(tester, 'review', 'r3'), 'Great', reason: 'the review itself is untouched');
    });

    testWidgets('questions and answers use their own kinds', (tester) async {
      await show(
          tester,
          Column(children: const [
            TranslatableText(kind: 'question', id: 'q1', text: 'Est-ce étanche ?'),
            TranslatableText(kind: 'answer', id: 'q1', text: 'Oui, très.'),
          ]));
      _answer = (b) async => {'text': b['kind'] == 'question' ? 'Is it waterproof?' : 'Yes, very.', 'sourceLang': 'fr', 'same': false};
      await tester.tap(link('question', 'q1'));
      await tester.pump();
      await tester.pump();
      await tester.tap(link('answer', 'q1'));
      await tester.pump();
      await tester.pump();
      expect(_asked.map((b) => b['kind']), ['question', 'answer']);
      expect(shown(tester, 'question', 'q1'), 'Is it waterproof?');
      expect(shown(tester, 'answer', 'q1'), 'Yes, very.');
    });

    testWidgets('when the text is already in the shopper\'s language the link goes away and a snackbar says so', (tester) async {
      _answer = (_) async => {'text': 'Nice', 'sourceLang': 'en', 'same': true};
      await show(tester, const TranslatableText(kind: 'review', id: 'r4', text: 'Nice'));
      await tester.tap(link('review', 'r4'));
      await tester.pump();
      await tester.pump();
      expect(link('review', 'r4'), findsNothing);
      expect(shown(tester, 'review', 'r4'), 'Nice');
      expect(find.text('Translated automatically'), findsNothing);
      expect(find.descendant(of: find.byType(SnackBar), matching: find.text('Already in your language.')), findsOneWidget);
    });

    testWidgets('a failure shows a snackbar, keeps the original and lets the shopper try again', (tester) async {
      var calls = 0;
      _answer = (_) async {
        if (++calls == 1) throw ApiException.local('err_offline');
        return {'text': 'Back online', 'sourceLang': 'fr', 'same': false};
      };
      await show(tester, const TranslatableText(kind: 'review', id: 'r5', text: 'Bonjour'));
      await tester.tap(link('review', 'r5'));
      await tester.pump();
      await tester.pump();
      expect(shown(tester, 'review', 'r5'), 'Bonjour');
      expect(find.byType(SnackBar), findsOneWidget);
      expect(link('review', 'r5'), findsOneWidget);
      expect(find.text('See translation'), findsOneWidget);

      await tester.tap(link('review', 'r5'));
      await tester.pump();
      await tester.pump();
      expect(shown(tester, 'review', 'r5'), 'Back online');
    });

    testWidgets('a changed text starts again from the original', (tester) async {
      await show(tester, const TranslatableText(kind: 'review', id: 'r6', text: 'Un'));
      await tester.tap(link('review', 'r6'));
      await tester.pump();
      await tester.pump();
      expect(shown(tester, 'review', 'r6'), 'Great product');
      await show(tester, const TranslatableText(kind: 'review', id: 'r6', text: 'Deux'));
      expect(shown(tester, 'review', 'r6'), 'Deux');
      expect(find.text('See translation'), findsOneWidget);
    });
  });

  group('notifications and wallet history', () {
    Future<void> open(WidgetTester tester, Widget screen, String lang) async {
      await gapReset(products: const [], lang: lang);
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(screen, lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    void seedNotices() {
      RealtimeStore.instance.notifications
        ..clear()
        ..addAll([
          NotificationDto.fromJson({
            'id': 'n1',
            'title': 'Order update',
            'body': 'SOM-1 is now shipped.',
            'titleFr': 'Titre du serveur',
            'bodyFr': 'Corps du serveur',
            'type': 'order',
            'read': false,
          }),
          // An older server: no French wording, so the phone's patterns translate it.
          NotificationDto.fromJson({'id': 'n2', 'title': 'Order placed', 'body': 'x', 'type': 'order', 'read': false}),
          NotificationDto.fromJson({'id': 'n3', 'title': 'Weekend promo', 'body': 'Free delivery!', 'type': 'promo', 'read': true}),
        ]);
    }

    testWidgets('the inbox prefers titleFr / bodyFr in French, then the patterns, then the raw text', (tester) async {
      seedNotices();
      await open(tester, const NotificationsScreen(locale: Locale('fr')), 'fr');
      expect(find.text('Titre du serveur'), findsOneWidget);
      expect(find.text('Corps du serveur'), findsOneWidget);
      expect(find.text('Order update'), findsNothing);
      expect(find.text('Commande enregistrée'), findsOneWidget, reason: 'pattern fallback');
      expect(find.text('Weekend promo'), findsOneWidget, reason: 'unknown text is shown as received');
    });

    testWidgets('the inbox in English shows what the server wrote', (tester) async {
      seedNotices();
      await open(tester, const NotificationsScreen(locale: Locale('en')), 'en');
      expect(find.text('Order update'), findsOneWidget);
      expect(find.text('SOM-1 is now shipped.'), findsOneWidget);
      expect(find.text('Titre du serveur'), findsNothing);
    });

    testWidgets('wallet history prefers descriptionFr in French and falls back to the patterns', (tester) async {
      await open(tester, const WalletScreen(locale: Locale('fr')), 'fr');
      RealtimeStore.instance.walletTransactions
        ..clear()
        ..addAll([
          WalletTransactionDto.fromJson({'id': 'w1', 'type': 'debit', 'amount': 20, 'balance': 80, 'description': 'Order SOM-5', 'descriptionFr': 'Commande SOM-5 (serveur)'}),
          WalletTransactionDto.fromJson({'id': 'w2', 'type': 'refund', 'amount': 5, 'balance': 85, 'description': 'Refund for SOM-9'}),
        ]);
      RealtimeStore.instance.notifyListeners();
      await tester.pump();
      expect(find.text('Commande SOM-5 (serveur)'), findsOneWidget);
      expect(find.text('Remboursement de SOM-9'), findsOneWidget);
    });
  });

  group('store page', () {
    tearDown(() => RealtimeStore.instance.debugCallRequest = null);

    testWidgets('shows descriptionFr in French and the English description otherwise', (tester) async {
      await gapReset(products: [ProductDto.fromJson(_product(extra: {'sellerId': 's1', 'sellerName': 'Shoe Shop'}))]);
      RealtimeStore.instance.debugCallRequest = (event, [body]) async {
        expect(event, 'sellers:storefront');
        return {
          'seller': {
            'name': 'Shoe Shop',
            'description': 'Fine shoes.',
            'descriptionFr': 'Belles chaussures.',
            'machineTranslated': ['descriptionFr'],
          },
        };
      };
      for (final lang in ['fr', 'en']) {
        await Strings.setLang(lang, persist: false);
        gapTallViewport(tester);
        await tester.pumpWidget(gapApp(StoreScreen(key: ValueKey('store-$lang'), sellerId: 's1', sellerName: 'Shoe Shop'), lang: lang));
        await tester.pump(const Duration(milliseconds: 300));
        expect(tester.widget<Text>(find.byKey(const ValueKey('store-description'))).data, lang == 'fr' ? 'Belles chaussures.' : 'Fine shoes.');
        expect(find.byKey(const ValueKey('machine-note-store')), lang == 'fr' ? findsOneWidget : findsNothing);
      }
    });

    testWidgets('an older server (no descriptionFr) shows the English description in French too', (tester) async {
      await gapReset(products: [ProductDto.fromJson(_product(extra: {'sellerId': 's1', 'sellerName': 'Shoe Shop'}))], lang: 'fr');
      RealtimeStore.instance.debugCallRequest = (event, [body]) async => {
            'seller': {'name': 'Shoe Shop', 'description': 'Fine shoes.'},
          };
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(const StoreScreen(sellerId: 's1', sellerName: 'Shoe Shop'), lang: 'fr'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(tester.widget<Text>(find.byKey(const ValueKey('store-description'))).data, 'Fine shoes.');
      expect(find.byKey(const ValueKey('machine-note-store')), findsNothing);
    });
  });
}
