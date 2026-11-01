// Replacement and exchange: the form (variant picker, price difference, wallet too low, payloads), their status
// screens, the hub that lists everything, and the notices that open them.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/screens/more/aftersale_status.dart';
import 'package:lipcart/screens/more/order_after_sale.dart';
import 'package:lipcart/screens/more/returns_extra.dart';
import 'package:lipcart/screens/notice_router.dart';
import 'package:lipcart/screens/wallet_screen.dart';
import 'package:lipcart/services/aftersale_models.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/upload_service.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'aftersale_helpers.dart';
import 'button_rules.dart';
import 'gap_helpers.dart';

ProductDto _shoe({double price = 30, bool options = true}) => ProductDto.fromJson({
      'id': 'p1',
      'name': 'Running shoes',
      'nameFr': 'Chaussures de course',
      'price': price,
      'originalPrice': price,
      'category': 'Fashion',
      'categoryFr': 'Mode',
      'image': '',
      'stock': 9,
      if (options) 'variants': asVariants,
      if (options) 'variantLabels': asVariantLabels,
    });

OrderDto _order({String variant = 'Size: 40 · Colour: Black', int qty = 2}) => OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-1042',
      'customerName': 'Aline',
      'status': 'delivered',
      'paymentMethod': 'wallet',
      'totalUsd': 40,
      'items': [
        {'productId': 'p1', 'productName': 'Running shoes', 'productNameFr': 'Chaussures de course', 'qty': qty, 'priceUsd': 20, 'variant': variant, 'variantFr': variant},
      ],
    });

void main() {
  late AsFake server;

  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() async {
    server = await asReset(products: [_shoe(), gapDto('p2')]);
    server.handlers['replacements:create'] = (_) => replacementJson(reference: 'REP-9001');
    server.handlers['exchanges:create'] = (_) => exchangeJson(reference: 'EXC-9001');
  });
  tearDown(asTearDown);

  Future<void> openIssue(WidgetTester tester, {OrderDto? order, String kind = 'replacement', String lang = 'en'}) =>
      asOpen(tester, ItemIssueScreen(order: order ?? _order(), initialKind: kind), lang: lang);

  String diffText(WidgetTester tester) {
    final f = find.descendant(of: find.byKey(const ValueKey('exchange-diff')), matching: find.byType(Text));
    return tester.widgetList<Text>(f).map((t) => t.data ?? '').join(' ');
  }

  Future<void> pickSize42(WidgetTester tester) async {
    await asTap(tester, 'opt-Size-42');
  }

  group('exchange: the variant picker and the price difference', () {
    testWidgets('shows the options of the product, starting from the one the customer has', (tester) async {
      await openIssue(tester, kind: 'exchange');
      expect(find.byKey(const ValueKey('opt-Size-41')), findsOneWidget);
      expect(find.byKey(const ValueKey('opt-Colour-White')), findsOneWidget);
      expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('opt-Size-40'))).selected, isTrue);
      expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('opt-Colour-Black'))).selected, isTrue);
      expect(find.text('You have: Size: 40 · Colour: Black'), findsOneWidget);
    });

    testWidgets('the same option is refused on the spot', (tester) async {
      await openIssue(tester, kind: 'exchange');
      expect(find.byKey(const ValueKey('exchange-same')), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'It is too small');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Choose an option different from the one you have.');
      expect(server.countOf('exchanges:create'), 0);
    });

    testWidgets('a dearer item: the customer pays the difference from the wallet', (tester) async {
      await openIssue(tester, kind: 'exchange'); // paid 20, now 30, one unit
      await pickSize42(tester);
      expect(diffText(tester), r'Price difference: $10.00 more. It is taken from your wallet when you send the request.');
    });

    testWidgets('the difference is per unit: two units, double', (tester) async {
      await openIssue(tester, kind: 'exchange');
      await pickSize42(tester);
      await asTap(tester, 'issue-qty-inc');
      expect(diffText(tester), startsWith(r'Price difference: $20.00 more'));
    });

    testWidgets('a cheaper item: refunded to the wallet when delivered', (tester) async {
      RealtimeStore.instance.products
        ..clear()
        ..add(_shoe(price: 12));
      await openIssue(tester, kind: 'exchange');
      await pickSize42(tester);
      expect(diffText(tester), r'Price difference: $8.00 back. It is refunded to your wallet when the new item is delivered.');
    });

    testWidgets('the same price: no difference', (tester) async {
      RealtimeStore.instance.products
        ..clear()
        ..add(_shoe(price: 20));
      await openIssue(tester, kind: 'exchange');
      await pickSize42(tester);
      expect(diffText(tester), 'No price difference.');
    });

    testWidgets('in French: option names and wording follow the language', (tester) async {
      await openIssue(tester, kind: 'exchange', lang: 'fr');
      expect(find.text('Pointure'), findsOneWidget);
      expect(find.text('Couleur'), findsOneWidget);
      expect(find.text('Noir'), findsOneWidget);
      await pickSize42(tester);
      expect(diffText(tester), startsWith('Différence de prix : 10,00 \$ de plus.'));
    });

    testWidgets('the request: same product, the chosen option as the server’s label, quantity and reason', (tester) async {
      await openIssue(tester, kind: 'exchange');
      await pickSize42(tester);
      await asTap(tester, 'opt-Colour-White');
      await asTap(tester, 'issue-qty-inc');
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), '  Too small for me  ');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(server.bodiesOf('exchanges:create').single, {
        'orderId': 'o1',
        'fromSku': 'p1',
        'fromName': 'Running shoes',
        'toSku': 'p1',
        'toName': 'Running shoes',
        'toVariant': 'Size: 42 · Colour: White',
        'qty': 2,
        'reason': 'Too small for me',
      });
      expect(asSnack(tester), 'Request EXC-9001 sent. We will contact you.');
      expect(find.byType(ExchangeDetailScreen), findsOneWidget);
    });

    testWidgets('the reason is needed (at least 5 characters)', (tester) async {
      await openIssue(tester, kind: 'exchange');
      await pickSize42(tester);
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'abc');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Describe what happened (at least 5 characters).');
      expect(server.countOf('exchanges:create'), 0);
    });

    testWidgets('a line bought with no option choice must pick one', (tester) async {
      await openIssue(tester, order: _order(variant: 'Default'), kind: 'exchange');
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'Wrong size for me');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Choose the new option');
      await asTap(tester, 'opt-Size-41');
      await asTap(tester, 'opt-Colour-Black');
      expect(find.byKey(const ValueKey('exchange-diff')), findsOneWidget);
    });

    testWidgets('a product without options (or no longer listed): free text, the team settles the price', (tester) async {
      RealtimeStore.instance.products
        ..clear()
        ..add(_shoe(options: false));
      await openIssue(tester, order: _order(variant: 'Default'), kind: 'exchange');
      expect(find.byKey(const ValueKey('issue-want')), findsOneWidget);
      expect(find.text('Our team will confirm any price difference.'), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('issue-want')).hitTestable(), 'The black one');
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'Wrong colour for me');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      final body = server.bodiesOf('exchanges:create').single!;
      expect(body['toSku'], 'ext:custom');
      expect(body['toName'], 'The black one');
      expect(body.containsKey('toVariant'), isFalse);
    });

    testWidgets('free text needs a few characters', (tester) async {
      RealtimeStore.instance.products.clear();
      await openIssue(tester, kind: 'exchange');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Say what you would like instead.');
    });
  });

  group('exchange: the wallet cannot cover the difference', () {
    testWidgets('our own check blocks the request with the server’s wording and offers a top-up', (tester) async {
      RealtimeStore.instance.walletBalance = 4;
      await openIssue(tester, kind: 'exchange');
      await pickSize42(tester);
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'It is too small');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(asSnack(tester), r'Your wallet balance is too low for the price difference ($10.00). Top up your wallet and try again.');
      expect(server.countOf('exchanges:create'), 0, reason: 'nothing is sent that would be refused');
      expect(find.byKey(const ValueKey('wallet-low')), findsOneWidget);
      await asTap(tester, 'wallet-topup');
      await asSettle(tester);
      expect(find.byType(WalletScreen), findsOneWidget);
    });

    testWidgets('the server’s refusal (the balance moved) is shown in French, with the top-up button', (tester) async {
      server.handlers['exchanges:create'] = (_) => throw asServerError(r'Your wallet balance is too low for the price difference ($10.00). Top up your wallet and try again.');
      await openIssue(tester, kind: 'exchange', lang: 'fr');
      await pickSize42(tester);
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'Trop petit pour moi');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(asSnack(tester),
          'Le solde de votre portefeuille est insuffisant pour la différence de prix (10,00 \$). Rechargez votre portefeuille puis réessayez.');
      expect(find.byKey(const ValueKey('wallet-low')), findsOneWidget);
      expect(find.text('Recharger mon portefeuille'), findsOneWidget);
      expect(find.byType(ItemIssueScreen), findsOneWidget);
    });

    testWidgets('a cheaper exchange never needs the wallet', (tester) async {
      RealtimeStore.instance
        ..walletBalance = 0
        ..products.clear()
        ..products.add(_shoe(price: 12));
      await openIssue(tester, kind: 'exchange');
      await pickSize42(tester);
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'It is too small');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(server.countOf('exchanges:create'), 1);
    });
  });

  group('replacement', () {
    testWidgets('payload: item, units, what is wrong, reason and photos', (tester) async {
      asFakePhotos(2);
      await openIssue(tester);
      await asTap(tester, 'issue-qty-inc');
      await asTap(tester, 'cond-damaged');
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'One shoe is torn');
      await asAttachPhotos(tester);
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(server.bodiesOf('replacements:create').single, {
        'orderId': 'o1',
        'sku': 'p1',
        'productName': 'Running shoes',
        'reason': 'One shoe is torn',
        'condition': 'damaged',
        'qty': 2,
        'attachments': ['/uploads/photo-1.jpg', '/uploads/photo-2.jpg'],
      });
      expect(asSnack(tester), 'Request REP-9001 sent. We will contact you.');
      expect(find.byType(ReplacementDetailScreen), findsOneWidget);
    });

    testWidgets('without a condition or photos only the essentials are sent', (tester) async {
      await openIssue(tester, order: _order(qty: 1));
      expect(find.byKey(const ValueKey('issue-qty-inc')), findsNothing, reason: 'one unit: nothing to choose');
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'It is broken');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(server.bodiesOf('replacements:create').single, {'orderId': 'o1', 'sku': 'p1', 'productName': 'Running shoes', 'reason': 'It is broken', 'qty': 1});
    });

    testWidgets('a second request for the same item: the server says so in French', (tester) async {
      server.handlers['replacements:create'] = (_) => throw asServerError('You already asked for a replacement of this item.');
      await openIssue(tester, lang: 'fr');
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'Une chaussure est déchirée');
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Vous avez déjà demandé le remplacement de cet article.');
      expect(find.byType(ItemIssueScreen), findsOneWidget);
    });

    testWidgets('a photo still uploading blocks the send', (tester) async {
      asFakePhotos(1);
      final upload = Completer<String>();
      UploadService.debugUpload = (bytes, name) => upload.future;
      await openIssue(tester);
      await tester.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'One shoe is torn');
      await asAttachPhotos(tester, settle: false);
      await asTap(tester, 'issue-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Wait for your photos to finish uploading.');
      expect(server.countOf('replacements:create'), 0);
      upload.complete('/uploads/late.jpg');
      await asSettle(tester);
    });

    testWidgets('label button rules on both forms', (tester) async {
      await openIssue(tester);
      expectButtonRules(tester);
      await openIssue(tester, kind: 'exchange');
      expectButtonRules(tester);
    });
  });

  group('status screens', () {
    Future<void> openReplacement(WidgetTester tester, Map<String, dynamic> json, {String lang = 'en'}) async {
      server.handlers['replacements:get'] = (_) => json;
      await asOpen(tester, ReplacementDetailScreen(replacement: ReplacementView.fromJson(json)), lang: lang);
      await asSettle(tester);
    }

    String bannerOf(WidgetTester tester) => tester.widget<Text>(find.byKey(const ValueKey('transfer-status'))).data!;

    testWidgets('requested: waiting for the seller, with the answer date', (tester) async {
      await openReplacement(tester, replacementJson());
      expect(bannerOf(tester), 'Waiting for the seller');
      expect(find.byKey(const ValueKey('transfer-progress')), findsOneWidget);
      expect(find.textContaining('Answer expected:'), findsWidgets);
      expect(find.text('One shoe is torn'), findsOneWidget);
    });

    testWidgets('approved with a delivery task: a rider will bring the new item and collect the old one', (tester) async {
      await openReplacement(tester, replacementJson(status: 'approved', deliveryTaskId: 't1'));
      expect(bannerOf(tester), 'Approved');
      expect(find.text('A rider will bring the new item and collect the old one.'), findsWidgets);
    });

    testWidgets('dispatched, delivered and declined', (tester) async {
      await openReplacement(tester, replacementJson(status: 'dispatched', deliveryTaskId: 't1'));
      expect(bannerOf(tester), 'On its way');
      await openReplacement(tester, replacementJson(status: 'delivered', deliveredAt: '2026-10-28T12:00:00Z', deliveryTaskId: 't1', updatedAt: '2026-10-28T12:00:00Z'));
      expect(bannerOf(tester), 'Delivered');
      expect(find.text('A rider will bring the new item and collect the old one.'), findsNothing);
      await openReplacement(tester, replacementJson(status: 'rejected', sellerReason: 'Out of stock', updatedAt: '2026-10-29T12:00:00Z'));
      expect(bannerOf(tester), 'Declined');
      expect(tester.widget<Text>(find.byKey(const ValueKey('transfer-body'))).data, 'Reason: Out of stock');
    });

    testWidgets('warehouse steps read as "being prepared"; French', (tester) async {
      await openReplacement(tester, replacementJson(status: 'allocated'), lang: 'fr');
      expect(bannerOf(tester), 'En préparation');
      expect(find.text('1 × Chaussures de course'), findsOneWidget);
    });

    testWidgets('a push moves the open screen along', (tester) async {
      await openReplacement(tester, replacementJson());
      RealtimeStore.instance.debugEmit('replacement:updated', replacementJson(status: 'approved', deliveryTaskId: 't1', updatedAt: '2026-10-27T00:00:00Z'));
      await tester.pump();
      expect(bannerOf(tester), 'Approved');
      RealtimeStore.instance.debugEmit('replacement:updated', replacementJson(status: 'dispatched', deliveryTaskId: 't1', updatedAt: '2026-10-28T00:00:00Z'));
      await tester.pump();
      expect(bannerOf(tester), 'On its way');
    });

    testWidgets('opened by id; an unknown id shows the error with a retry', (tester) async {
      var calls = 0;
      server.handlers['replacements:get'] = (b) => ++calls == 1 ? throw asServerError('Replacement not found.') : replacementJson();
      await asOpen(tester, const ReplacementDetailScreen(requestId: 'r1'));
      await asSettle(tester);
      expect(find.text('Replacement not found.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('as-retry')));
      await asSettle(tester);
      expect(bannerOf(tester), 'Waiting for the seller');
      expect(server.bodiesOf('replacements:get').first, {'id': 'r1'});
    });

    testWidgets('exchange: the change, what the difference did to the wallet, and the progress', (tester) async {
      server.handlers['exchanges:get'] = (_) => exchangeJson(status: 'approved', deliveryTaskId: 't2');
      await asOpen(tester, ExchangeDetailScreen(exchange: ExchangeView.fromJson(exchangeJson(status: 'approved', deliveryTaskId: 't2'))));
      await asSettle(tester);
      expect(bannerOf(tester), 'Approved');
      expect(find.text(r'$10.00 was taken from your wallet.'), findsOneWidget);
      expect(find.text('From Size: 40 · Colour: Black to Size: 42 · Colour: Black'), findsOneWidget);
      expect(find.text('A rider will bring the new item and collect the old one.'), findsWidgets);
    });

    testWidgets('exchange in French: the option names are the product’s French ones', (tester) async {
      server.handlers['exchanges:get'] = (_) => exchangeJson();
      await asOpen(tester, ExchangeDetailScreen(exchange: ExchangeView.fromJson(exchangeJson())), lang: 'fr');
      await asSettle(tester);
      expect(find.text('De Pointure: 40 · Couleur: Noir à Pointure: 42 · Couleur: Noir'), findsOneWidget);
      expect(find.text('10,00 \$ ont été prélevés sur votre portefeuille.'), findsOneWidget);
    });

    testWidgets('exchange declined: the held money went back', (tester) async {
      server.handlers['exchanges:get'] = (_) => exchangeJson(status: 'rejected', sellerReason: 'Not in stock');
      await asOpen(tester, ExchangeDetailScreen(exchange: ExchangeView.fromJson(exchangeJson(status: 'rejected', sellerReason: 'Not in stock'))));
      await asSettle(tester);
      expect(bannerOf(tester), 'Declined');
      expect(find.text(r'$10.00 was returned to your wallet.'), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const ValueKey('transfer-body'))).data, 'Reason: Not in stock');
    });

    testWidgets('exchange delivered with a cheaper item: refunded', (tester) async {
      final j = exchangeJson(status: 'delivered', diff: -5, held: 0, deliveredAt: '2026-10-28T12:00:00Z');
      server.handlers['exchanges:get'] = (_) => j;
      await asOpen(tester, ExchangeDetailScreen(exchange: ExchangeView.fromJson(j)));
      await asSettle(tester);
      expect(find.text(r'$5.00 was refunded to your wallet.'), findsOneWidget);
    });

    testWidgets('exchange push', (tester) async {
      server.handlers['exchanges:get'] = (_) => exchangeJson();
      await asOpen(tester, ExchangeDetailScreen(exchange: ExchangeView.fromJson(exchangeJson())));
      await asSettle(tester);
      RealtimeStore.instance.debugEmit('exchange:updated', exchangeJson(status: 'dispatched', deliveryTaskId: 't3', updatedAt: '2026-10-28T00:00:00Z'));
      await tester.pump();
      expect(bannerOf(tester), 'On its way');
    });
  });

  group('the hub', () {
    Future<void> openHub(WidgetTester tester, {int tab = 0, String lang = 'en'}) async {
      await asOpen(tester, ReturnsListScreen(initialTab: tab), lang: lang);
      await asSettle(tester);
    }

    setUp(() {
      server.handlers['disputes:list'] = (_) => [
            disputeJson(id: 'd1', reference: 'RET-1001', stage: 'seller_rejected', canEscalate: true, createdAt: '2026-10-24T09:30:00Z'),
            disputeJson(id: 'd2', reference: 'DP-2002', type: 'dispute', status: 'resolved', stage: 'closed', refundUsd: 15, createdAt: '2026-10-22T09:30:00Z'),
          ];
      server.handlers['replacements:mine'] = (_) => [replacementJson(), replacementJson(id: 'r2', reference: 'REP-2002', status: 'delivered')];
      server.handlers['exchanges:mine'] = (_) => [exchangeJson()];
    });

    testWidgets('three tabs, requests newest first with their stage', (tester) async {
      await openHub(tester);
      expect(find.text('Returns & exchanges'), findsOneWidget);
      expect(find.text('Returns'), findsOneWidget);
      expect(find.text('Replacements'), findsOneWidget);
      expect(find.text('Exchanges'), findsOneWidget);
      expect(find.byKey(const ValueKey('request-d1')), findsOneWidget);
      expect(find.byKey(const ValueKey('request-d2')), findsOneWidget);
      expect(find.text('Seller declined'), findsOneWidget);
      expect(find.text(r'$15.00 refunded to your wallet'), findsOneWidget);
      expect(tester.getTopLeft(find.byKey(const ValueKey('request-d1'))).dy, lessThan(tester.getTopLeft(find.byKey(const ValueKey('request-d2'))).dy));
    });

    testWidgets('the replacements and exchanges tabs list theirs', (tester) async {
      await openHub(tester);
      await tester.tap(find.text('Replacements'));
      await asSettle(tester);
      expect(find.byKey(const ValueKey('replacement-r1')), findsOneWidget);
      expect(find.byKey(const ValueKey('replacement-r2')), findsOneWidget);
      await tester.tap(find.text('Exchanges'));
      await asSettle(tester);
      expect(find.byKey(const ValueKey('exchange-x1')), findsOneWidget);
    });

    testWidgets('filters: in progress and closed', (tester) async {
      await openHub(tester);
      await tester.tap(find.byKey(const ValueKey('filter-closed')));
      await asSettle(tester);
      expect(find.byKey(const ValueKey('request-d1')), findsNothing);
      expect(find.byKey(const ValueKey('request-d2')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('filter-open')));
      await asSettle(tester);
      expect(find.byKey(const ValueKey('request-d1')), findsOneWidget);
      expect(find.byKey(const ValueKey('request-d2')), findsNothing);
    });

    testWidgets('empty tabs explain how to start one (English and French)', (tester) async {
      server.handlers['disputes:list'] = (_) => [];
      server.handlers['replacements:mine'] = (_) => [];
      server.handlers['exchanges:mine'] = (_) => [];
      await openHub(tester);
      expect(find.text('No returns or problems yet. Open a delivered order to start one.'), findsOneWidget);
      await tester.tap(find.text('Replacements'));
      await asSettle(tester);
      expect(find.textContaining('No replacements yet.'), findsOneWidget);
      await openHub(tester, tab: 2, lang: 'fr');
      expect(find.textContaining('Aucun échange pour le moment.'), findsOneWidget);
    });

    testWidgets('a filter with nothing in it says so', (tester) async {
      server.handlers['disputes:list'] = (_) => [disputeJson()];
      await openHub(tester);
      await tester.tap(find.byKey(const ValueKey('filter-closed')));
      await asSettle(tester);
      expect(find.text('Nothing here with this filter.'), findsOneWidget);
    });

    testWidgets('a tap opens the request, the replacement, the exchange', (tester) async {
      await openHub(tester);
      server.handlers['disputes:get'] = (_) => disputeJson(stage: 'seller_rejected', canEscalate: true, messages: []);
      await tester.tap(find.byKey(const ValueKey('request-d1')));
      await asSettle(tester);
      expect(find.text('The seller declined your return'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.arrow_back_rounded).last);
      await asSettle(tester);
      await tester.tap(find.text('Replacements'));
      await asSettle(tester);
      await tester.tap(find.byKey(const ValueKey('replacement-r1')));
      await asSettle(tester);
      expect(find.byType(ReplacementDetailScreen), findsOneWidget);
      await tester.tap(find.byIcon(Icons.arrow_back_rounded).last);
      await asSettle(tester);
      await tester.tap(find.text('Exchanges'));
      await asSettle(tester);
      await tester.tap(find.byKey(const ValueKey('exchange-x1')));
      await asSettle(tester);
      expect(find.byType(ExchangeDetailScreen), findsOneWidget);
    });

    testWidgets('live: a new request appears and a stage changes without reloading', (tester) async {
      await openHub(tester);
      RealtimeStore.instance.debugEmit('dispute:created', disputeJson(id: 'd3', reference: 'RET-3003', createdAt: '2026-10-26T09:30:00Z'));
      await tester.pump();
      expect(find.byKey(const ValueKey('request-d3')), findsOneWidget);
      RealtimeStore.instance.debugEmit('dispute:updated', disputeJson(id: 'd1', stage: 'escalated', createdAt: '2026-10-24T09:30:00Z', updatedAt: '2026-10-27T00:00:00Z'));
      await tester.pump();
      expect(find.text('With support'), findsOneWidget);
      await tester.tap(find.text('Replacements'));
      await asSettle(tester);
      RealtimeStore.instance.debugEmit('replacement:updated', replacementJson(status: 'dispatched', updatedAt: '2026-10-27T00:00:00Z'));
      await tester.pump();
      expect(find.text('On its way'), findsOneWidget);
    });

    testWidgets('a failing load shows the error with a retry that works', (tester) async {
      var calls = 0;
      server.handlers['disputes:list'] = (_) => ++calls == 1 ? throw asServerError('Not allowed.') : [disputeJson()];
      await openHub(tester);
      expect(find.text('Not allowed.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('as-retry')));
      await asSettle(tester);
      expect(find.byKey(const ValueKey('request-d1')), findsOneWidget);
    });

    testWidgets('the tab to start on can be chosen (a notice for an exchange)', (tester) async {
      await openHub(tester, tab: 2);
      expect(find.byKey(const ValueKey('exchange-x1')), findsOneWidget);
    });

    testWidgets('French labels and no icon on label buttons', (tester) async {
      await openHub(tester, lang: 'fr');
      expect(find.text('Retours et échanges'), findsOneWidget);
      expect(find.text('Remplacements'), findsOneWidget);
      expect(find.text('Refusé par le vendeur'), findsOneWidget);
      expectButtonRules(tester);
    });
  });

  group('notices open the right screen', () {
    Future<void> tapNotice(WidgetTester tester, String type, String? id) async {
      await asOpen(
        tester,
        Builder(
          builder: (ctx) => Scaffold(
            body: Center(
              child: TextButton(
                key: const ValueKey('go'),
                onPressed: () => openNotice(Navigator.of(ctx), const Locale('en'), type: type, entityId: id),
                child: const Text('Open'),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.byKey(const ValueKey('go')));
      await asSettle(tester);
    }

    setUp(() {
      server.handlers['disputes:get'] = (_) => disputeJson(messages: []);
      server.handlers['replacements:get'] = (_) => replacementJson();
      server.handlers['exchanges:get'] = (_) => exchangeJson();
    });

    test('routes', () {
      bool none(String id) => false;
      expect(noticeRoute('return', 'd1', hasOrder: none), const NoticeRoute(NoticeDest.returnStatus, 'd1'));
      expect(noticeRoute('dispute', 'd1', hasOrder: none), const NoticeRoute(NoticeDest.returnStatus, 'd1'));
      expect(noticeRoute('replacement', 'r1', hasOrder: none), const NoticeRoute(NoticeDest.replacementStatus, 'r1'));
      expect(noticeRoute('exchange', 'x1', hasOrder: none), const NoticeRoute(NoticeDest.exchangeStatus, 'x1'));
      expect(noticeRoute('replacement', null, hasOrder: none), const NoticeRoute(NoticeDest.returns));
      expect(noticeRoute('exchange', null, hasOrder: none), const NoticeRoute(NoticeDest.returns));
      expect(noticeRoute('return', null, hasOrder: none), const NoticeRoute(NoticeDest.returns));
    });

    testWidgets('a return or dispute notice opens the request', (tester) async {
      await tapNotice(tester, 'return', 'd1');
      expect(find.byType(ReturnStatusScreen), findsOneWidget);
      expect(server.bodiesOf('disputes:get').first, {'id': 'd1'});
    });

    testWidgets('a replacement notice opens the replacement', (tester) async {
      await tapNotice(tester, 'replacement', 'r1');
      expect(find.byType(ReplacementDetailScreen), findsOneWidget);
      expect(server.bodiesOf('replacements:get').first, {'id': 'r1'});
    });

    testWidgets('an exchange notice opens the exchange', (tester) async {
      await tapNotice(tester, 'exchange', 'x1');
      expect(find.byType(ExchangeDetailScreen), findsOneWidget);
    });

    testWidgets('one that cannot be loaded opens the list, on the right tab', (tester) async {
      server.handlers['exchanges:get'] = (_) => throw asServerError('Exchange not found.');
      server.handlers['exchanges:mine'] = (_) => [exchangeJson()];
      await tapNotice(tester, 'exchange', 'gone');
      expect(find.byType(ReturnsListScreen), findsOneWidget);
      expect(find.byKey(const ValueKey('exchange-x1')), findsOneWidget);
    });
  });
}
