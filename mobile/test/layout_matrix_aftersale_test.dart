// The after-sale screens (returns, problems, replacements, exchanges) at two phone widths (360 and 402 pt), in English
// and French, at text scale 1.0 and 1.3, with the app's real fonts and long names. Fails on any overflow or layout
// error, a button label that wraps or is cut, or text drawn over other text; each screen is also held to the
// button rules (no icon on a label button, one filled button).
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/screens/more/aftersale_dispute_form.dart';
import 'package:lipcart/screens/more/aftersale_request.dart';
import 'package:lipcart/screens/more/aftersale_status.dart';
import 'package:lipcart/screens/more/order_after_sale.dart';
import 'package:lipcart/screens/more/returns_extra.dart';
import 'package:lipcart/services/aftersale_models.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/theme/app_theme.dart';

import 'aftersale_helpers.dart';
import 'button_rules.dart';
import 'gap_helpers.dart';
import 'layout_checks.dart';

const _longName = 'Chaussures de course Air Comfort Pro édition limitée pointure quarante-deux';
const _longText =
    'Bonjour, la semelle de la chaussure gauche s’est décollée après seulement deux jours d’utilisation normale, et la deuxième paire est arrivée dans le mauvais coloris. Merci de me dire comment procéder rapidement.';
const _longSeller = 'Jean-Pierre-Emmanuel Mukendi wa Kalala';

ProductDto _shoe() => ProductDto.fromJson({
      'id': 'p1',
      'name': 'Running shoes Air Comfort Pro limited edition size forty-two',
      'nameFr': _longName,
      'price': 30,
      'originalPrice': 30,
      'category': 'Fashion',
      'categoryFr': 'Mode',
      'image': '',
      'stock': 9,
      'variants': '[{"name":"Size","options":["40","41","42","43","44"]},{"name":"Colour","options":["Black","White","Navy blue"]}]',
      'variantLabels': '{"fr":[{"name":"Pointure","options":["40","41","42","43","44"]},{"name":"Couleur","options":["Noir","Blanc","Bleu marine"]}]}',
    });

OrderDto _order({String method = 'airtel_money', String status = 'delivered'}) => OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-1042',
      'customerName': 'Aline',
      'status': status,
      'paymentMethod': method,
      'totalUsd': 90,
      'items': [
        {'productId': 'p1', 'productName': 'Running shoes Air Comfort Pro limited edition size forty-two', 'productNameFr': _longName, 'qty': 3, 'priceUsd': 20, 'variant': 'Size: 40 · Colour: Navy blue', 'variantFr': 'Pointure : 40 · Couleur : Bleu marine'},
        {'productId': 'p2', 'productName': 'Wireless earbuds with charging case', 'productNameFr': 'Écouteurs sans fil avec boîtier de recharge', 'qty': 1, 'priceUsd': 30, 'variant': 'Default'},
        {'productId': 'p3', 'productName': 'Cotton wax print dress', 'productNameFr': 'Robe en wax de coton imprimé', 'qty': 2, 'priceUsd': 35, 'variant': 'Default'},
      ],
    });

List<Map<String, dynamic>> _thread() => [
      msgJ('m1', name: _longSeller, text: _longText),
      msgJ('m2', role: 'customer', name: 'Aline Kasongo', text: 'Voici les photos demandées.', attachments: ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg', '/uploads/d.jpg']),
      msgJ('m3', role: 'admin_support', name: 'Chantal Dupont', text: 'Nous examinons votre demande et revenons vers vous très vite.'),
    ];

List<Map<String, dynamic>> _items() => [
      disputeItemJson('di1', name: 'Running shoes Air Comfort Pro limited edition size forty-two', nameFr: _longName, qty: 3, unit: 20, variant: 'Size: 40 · Colour: Navy blue'),
      disputeItemJson('di2', name: 'Wireless earbuds with charging case', nameFr: 'Écouteurs sans fil avec boîtier de recharge', unit: 30, refund: 30),
    ];

Future<AsFake> _seed(String lang) async {
  final server = await asReset(lang: lang, products: [_shoe(), gapDto('p2'), gapDto('p3')]);
  final store = RealtimeStore.instance;
  store.walletBalance = 1250.5;
  server.handlers['disputes:eligibility'] = (_) => eligibilityJson(items: [
        {'itemId': 'oi1', 'productId': 'p1', 'productName': 'Running shoes', 'variant': 'Size: 40 · Colour: Navy blue', 'qty': 3, 'remaining': 3, 'unitPriceUsd': 20},
        {'itemId': 'oi2', 'productId': 'p2', 'productName': 'Earbuds', 'variant': 'Default', 'qty': 1, 'remaining': 1, 'unitPriceUsd': 30},
        {'itemId': 'oi3', 'productId': 'p3', 'productName': 'Dress', 'variant': 'Default', 'qty': 2, 'remaining': 0, 'unitPriceUsd': 35},
      ]);
  server.handlers['disputes:list'] = (_) => [
        disputeJson(id: 'a', reference: 'RET-10000001', stage: 'seller_rejected', canEscalate: true, canCancel: true, items: _items(), createdAt: '2026-10-24T09:30:00Z'),
        disputeJson(id: 'b', reference: 'DP-20000002', type: 'dispute', stage: 'seller_replied', category: 'missing', createdAt: '2026-10-23T09:30:00Z'),
        disputeJson(id: 'c', reference: 'RET-30000003', status: 'resolved', stage: 'closed', refundUsd: 1202.5, refundTo: 'phone', items: _items(), createdAt: '2026-10-20T09:30:00Z'),
        disputeJson(id: 'd', reference: 'RET-40000004', status: 'rejected', stage: 'closed', resolution: 'Cancelled by the customer', createdAt: '2026-10-19T09:30:00Z'),
        oldDisputeJson(id: 'e'),
      ];
  server.handlers['replacements:mine'] = (_) => [
        replacementJson(id: 'r1', reference: 'REP-10000001', status: 'dispatched', deliveryTaskId: 't1'),
        replacementJson(id: 'r2', reference: 'REP-10000002', status: 'rejected', sellerReason: _longText, createdAt: '2026-10-20T09:30:00Z'),
      ];
  server.handlers['exchanges:mine'] = (_) => [
        exchangeJson(id: 'x1', reference: 'EXC-10000001', status: 'approved', deliveryTaskId: 't2'),
        exchangeJson(id: 'x2', reference: 'EXC-10000002', status: 'delivered', diff: -5, held: 0, createdAt: '2026-10-20T09:30:00Z'),
      ];
  server.handlers['disputes:get'] = (b) => switch (b!['id']) {
        'n2' => disputeJson(id: 'n2', reference: 'RET-50000002', messages: []),
        _ => disputeJson(messages: _thread()),
      };
  return server;
}

/// A screen to check, what to do on it first, and how to change the scripted server before it opens.
typedef _Case = (Widget Function(Locale), Future<void> Function(WidgetTester)?, void Function(AsFake)?);
_Case _c(Widget Function(Locale) build, {Future<void> Function(WidgetTester)? interact, void Function(AsFake)? tweak}) => (build, interact, tweak);

/// A request screen opened with [json], whose reload answers the same payload (and the sibling "n2").
_Case _req(Map<String, dynamic> json, {List<String> siblings = const [], Future<void> Function(WidgetTester)? interact}) => _c(
      (l) => ReturnStatusScreen(locale: l, returnRequest: DisputeView.fromJson(json), siblings: siblings),
      interact: interact,
      tweak: (s) => s.handlers['disputes:get'] = (b) => b!['id'] == 'n2' ? disputeJson(id: 'n2', reference: 'RET-50000002', messages: []) : json,
    );

_Case _rep(Map<String, dynamic> json) => _c(
      (l) => ReplacementDetailScreen(locale: l, replacement: ReplacementView.fromJson(json)),
      tweak: (s) => s.handlers['replacements:get'] = (_) => json,
    );

_Case _exc(Map<String, dynamic> json) => _c(
      (l) => ExchangeDetailScreen(locale: l, exchange: ExchangeView.fromJson(json)),
      tweak: (s) => s.handlers['exchanges:get'] = (_) => json,
    );

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(asTearDown);

  Future<void> tap(WidgetTester t, String key) async {
    final f = find.byKey(ValueKey(key));
    if (f.evaluate().isEmpty) await t.scrollUntilVisible(f, 300, scrollable: find.byType(Scrollable).first);
    await t.ensureVisible(f);
    await t.pump();
    await t.tap(f);
    await t.pump(const Duration(milliseconds: 400));
  }

  final soon = DateTime.now().add(const Duration(days: 1)).toUtc().toIso8601String();
  final manyPhotos = [for (var i = 0; i < 6; i++) '/uploads/p$i.jpg'];

  final screens = <String, _Case>{
    'hub: returns tab': _c((l) => ReturnsListScreen(locale: l)),
    'hub: replacements tab': _c((l) => ReturnsListScreen(locale: l, initialTab: 1)),
    'hub: exchanges tab': _c((l) => ReturnsListScreen(locale: l, initialTab: 2)),
    'hub: closed filter': _c((l) => ReturnsListScreen(locale: l), interact: (t) => tap(t, 'filter-closed')),
    'hub: nothing yet': _c((l) => ReturnsListScreen(locale: l), tweak: (s) {
      s.handlers['disputes:list'] = (_) => [];
    }),
    'request: waiting for the seller (deadline, photos, long thread)':
        _req(disputeJson(attachments: manyPhotos, sellerDueAt: soon, items: _items(), reason: _longText, messages: _thread())),
    'request: seller declined (escalate and cancel)': _req(disputeJson(
        stage: 'seller_rejected', canEscalate: true, canCancel: true, sellerReason: _longText, sellerRespondedAt: '2026-10-25T09:30:00Z', items: _items(), messages: _thread())),
    // The dialogs are checked on their own (the overlap check does not tell a dialog from the page under it).
    'dialog: ask support to decide': _c((l) => Scaffold(body: Center(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 24), child: const EscalateDialog())))),
    'dialog: cancel the request': _c((l) => Scaffold(body: Center(child: Padding(padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 24), child: const CancelRequestDialog())))),
    'request: pickup in progress':
        _req(disputeJson(stage: 'pickup', pickupTaskId: 't1', sellerRespondedAt: '2026-10-25T09:30:00Z', items: _items(), messages: _thread())),
    'request: received at the warehouse': _req(disputeJson(stage: 'received', receivedAt: '2026-10-27T10:00:00Z', items: _items(), messages: _thread())),
    'request: refunded to the phone (decision, closed note)': _req(disputeJson(
        status: 'resolved', stage: 'closed', refundUsd: 1202.5, refundTo: 'phone', outcome: 'refund_partial', resolution: _longText, pickupTaskId: 't1', receivedAt: '2026-10-27T10:00:00Z', items: _items(), messages: _thread())),
    'request: declined by support': _req(disputeJson(type: 'dispute', status: 'rejected', stage: 'closed', resolution: _longText, messages: _thread())),
    'request: old payload (no stage, items or thread)': _req(oldDisputeJson()),
    'request: split over several stores': _req(disputeJson(id: 'n1', reference: 'RET-50000001', items: _items(), messages: _thread()), siblings: const ['n2']),
    'return form (mobile money, long lines)': _c((l) => ReturnRequestScreen(locale: l, order: _order())),
    'return form: validation errors': _c((l) => ReturnRequestScreen(locale: l, order: _order()), interact: (t) => tap(t, 'return-submit')),
    'return form: window closed': _c((l) => ReturnRequestScreen(locale: l, order: _order()), tweak: (s) {
      s.handlers['disputes:eligibility'] = (_) => eligibilityJson(
            eligible: false,
            reason: 'Returns are accepted within 7 days of delivery, and that time has passed.',
            endsAt: '2026-10-01T12:00:00Z',
          );
    }),
    'problem form (delivered)': _c((l) => DisputeFormScreen(locale: l, order: _order())),
    'problem form: validation errors': _c((l) => DisputeFormScreen(locale: l, order: _order()), interact: (t) => tap(t, 'dispute-submit')),
    'problem form (on its way)': _c((l) => DisputeFormScreen(locale: l, order: _order(status: 'shipped'))),
    'replacement form': _c((l) => ItemIssueScreen(locale: l, order: _order()), interact: (t) => tap(t, 'issue-item-p1')),
    'exchange form: pick an option (price difference)': _c((l) => ItemIssueScreen(locale: l, order: _order(), initialKind: 'exchange'), interact: (t) async {
      await tap(t, 'issue-item-p1');
      await tap(t, 'opt-Size-42');
    }),
    'exchange form: same option': _c((l) => ItemIssueScreen(locale: l, order: _order(), initialKind: 'exchange'), interact: (t) => tap(t, 'issue-item-p1')),
    'exchange form: wallet too low': _c((l) => ItemIssueScreen(locale: l, order: _order(), initialKind: 'exchange'), interact: (t) async {
      RealtimeStore.instance.walletBalance = 1;
      await tap(t, 'issue-item-p1');
      await tap(t, 'opt-Size-42');
      await t.enterText(find.byKey(const ValueKey('issue-reason')).hitTestable(), 'Trop petit pour moi');
      await tap(t, 'issue-submit');
    }),
    'exchange form: free text (product without options)': _c((l) => ItemIssueScreen(locale: l, order: _order(), initialKind: 'exchange'), interact: (t) => tap(t, 'issue-item-p3')),
    'replacement: requested': _rep(replacementJson()),
    'replacement: on its way (rider)': _rep(replacementJson(status: 'dispatched', deliveryTaskId: 't1', attachments: manyPhotos)),
    'replacement: declined (long reason)': _rep(replacementJson(status: 'rejected', sellerReason: _longText)),
    'replacement: delivered': _rep(replacementJson(status: 'delivered', deliveredAt: '2026-10-28T12:00:00Z', deliveryTaskId: 't1')),
    'exchange: requested (charged)': _exc(exchangeJson()),
    'exchange: on its way': _exc(exchangeJson(status: 'dispatched', deliveryTaskId: 't2')),
    'exchange: declined (money returned)': _exc(exchangeJson(status: 'rejected', sellerReason: _longText)),
    'exchange: delivered (refund)': _exc(exchangeJson(status: 'delivered', diff: -1202.5, held: 0, deliveredAt: '2026-10-28T12:00:00Z')),
  };

  for (final e in screens.entries) {
    testWidgets('layout matrix: ${e.key}', (tester) async {
      addTearDown(tester.view.reset);
      final found = <String>[];
      for (final c in layoutConfigs) {
        final server = await _seed(c.lang);
        e.value.$3?.call(server);
        final locale = Locale(c.lang);
        final app = MaterialApp(
          theme: AppTheme.light(),
          locale: locale,
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          builder: scaleText(c),
          home: e.value.$1(locale),
        );
        final interact = e.value.$2;
        for (final p in await layoutProblems(tester, c, app, interact: interact == null ? null : () => interact(tester))) {
          found.add('[$c] $p');
        }
        expectButtonRules(tester);
        expect(find.byType(CircularProgressIndicator), findsNothing, reason: '${e.key} [$c] is still loading: the layout was not checked');
      }
      expect(found, isEmpty, reason: found.join('\n'));
    });
  }
}
