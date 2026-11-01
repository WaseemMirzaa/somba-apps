// The return form and the problem report on screen: window state, lines and quantities, validation, the request
// that is sent (items, category, photos, refund destination), the several-stores case, and the failures.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/aftersale_dispute_form.dart';
import 'package:lipcart/screens/more/returns_extra.dart';
import 'package:lipcart/services/upload_service.dart';

import 'aftersale_helpers.dart';
import 'button_rules.dart';
import 'gap_helpers.dart';

void main() {
  late AsFake server;

  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() async {
    server = await asReset();
    server.handlers['disputes:eligibility'] = (_) => eligibilityJson();
    server.handlers['disputes:get'] = (b) => disputeJson(id: b!['id'] as String, reference: 'RET-7001');
    server.handlers['disputes:open'] = (b) => disputeJson(reference: 'RET-7001', type: b!['type'] as String);
  });
  tearDown(asTearDown);

  Future<void> openReturn(WidgetTester tester, {String lang = 'en', String method = 'wallet'}) async {
    await asOpen(tester, ReturnRequestScreen(order: asOrder(method: method)), lang: lang);
  }

  group('the window', () {
    testWidgets('open: the lines, their remaining units, and the date the window ends', (tester) async {
      await openReturn(tester);
      expect(find.byKey(const ValueKey('return-window')), findsOneWidget);
      expect(find.text('Running shoes'), findsOneWidget);
      expect(find.text('Up to 2 can be returned'), findsOneWidget);
      expect(find.text('Up to 1 can be returned'), findsOneWidget);
      expect(find.byKey(const ValueKey('return-submit')), findsOneWidget);
      expect(server.bodiesOf('disputes:eligibility').single, {'orderId': 'o1'});
    });

    testWidgets('closed: a clear message with the end date, no form, and a way to report a problem instead', (tester) async {
      server.handlers['disputes:eligibility'] = (_) => eligibilityJson(
            eligible: false,
            reason: 'Returns are accepted within 7 days of delivery, and that time has passed.',
            endsAt: '2026-10-01T12:00:00Z',
          );
      await openReturn(tester);
      expect(find.byKey(const ValueKey('return-closed')), findsOneWidget);
      expect(find.text('The return window is closed'), findsOneWidget);
      final body = tester.widget<Text>(find.byKey(const ValueKey('return-closed-body'))).data!;
      expect(body, allOf(contains('7 days'), contains('2026')));
      expect(find.byKey(const ValueKey('return-submit')), findsNothing);
      expect(find.byKey(const ValueKey('return-items')), findsNothing);
      await asTap(tester, 'return-report');
      await asSettle(tester);
      expect(find.byType(DisputeFormScreen), findsOneWidget);
    });

    testWidgets('closed, in French', (tester) async {
      server.handlers['disputes:eligibility'] = (_) => eligibilityJson(eligible: false, reason: 'x', endsAt: '2026-10-01T12:00:00Z');
      await openReturn(tester, lang: 'fr');
      expect(find.text('Le délai de retour est dépassé'), findsOneWidget);
      expect(tester.widget<Text>(find.byKey(const ValueKey('return-closed-body'))).data, contains('7 jours'));
    });

    testWidgets('not delivered yet: the server reason, worded in French', (tester) async {
      server.handlers['disputes:eligibility'] = (_) => eligibilityJson(
            eligible: false,
            reason: 'You can return items once the order has been delivered.',
            windowDays: 7,
            endsAt: null,
          )..['endsAt'] = null;
      await openReturn(tester, lang: 'fr');
      expect(find.text('Retour impossible'), findsOneWidget);
      expect(find.text('Vous pouvez retourner des articles une fois la commande livrée.'), findsOneWidget);
    });

    testWidgets('everything already on another request: the server reason', (tester) async {
      server.handlers['disputes:eligibility'] = (_) => eligibilityJson(eligible: false, reason: 'You already have an open request for this order.');
      await openReturn(tester);
      expect(find.text('You already have an open request for this order.'), findsOneWidget);
    });

    testWidgets('a failed eligibility call shows the error and a retry that works', (tester) async {
      var calls = 0;
      server.handlers['disputes:eligibility'] = (_) => ++calls == 1 ? throw asServerError('Order not found.') : eligibilityJson();
      await openReturn(tester);
      expect(find.text('Order not found.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('as-retry')));
      await asSettle(tester);
      expect(find.byKey(const ValueKey('return-submit')), findsOneWidget);
    });
  });

  group('lines and quantities', () {
    testWidgets('steppers stop at what remains', (tester) async {
      server.handlers['disputes:eligibility'] = (_) => eligibilityJson(items: [
            {'itemId': 'oi1', 'productId': 'p1', 'productName': 'Running shoes', 'variant': 'Default', 'qty': 3, 'remaining': 2, 'unitPriceUsd': 20},
          ]);
      await openReturn(tester);
      // one eligible line: the whole remaining quantity is chosen already
      expect(tester.widget<Text>(find.byKey(const ValueKey('ret-oi1-value'))).data, '2');
      await asTap(tester, 'ret-oi1-inc');
      expect(tester.widget<Text>(find.byKey(const ValueKey('ret-oi1-value'))).data, '2', reason: 'capped at remaining');
      await asTap(tester, 'ret-oi1-dec');
      await asTap(tester, 'ret-oi1-dec');
      expect(tester.widget<Text>(find.byKey(const ValueKey('ret-oi1-value'))).data, '0');
      await asTap(tester, 'ret-oi1-dec');
      expect(tester.widget<Text>(find.byKey(const ValueKey('ret-oi1-value'))).data, '0', reason: 'never below zero');
    });

    testWidgets('a line with nothing left to return has no stepper and says why', (tester) async {
      server.handlers['disputes:eligibility'] = (_) => eligibilityJson(items: [
            {'itemId': 'oi1', 'productId': 'p1', 'productName': 'Running shoes', 'variant': 'Default', 'qty': 2, 'remaining': 0, 'unitPriceUsd': 20},
            {'itemId': 'oi2', 'productId': 'p2', 'productName': 'Earbuds', 'variant': 'Default', 'qty': 1, 'remaining': 1, 'unitPriceUsd': 30},
          ]);
      await openReturn(tester);
      expect(find.text('Already part of another request'), findsOneWidget);
      expect(find.byKey(const ValueKey('ret-oi1-inc')), findsNothing);
      expect(find.byKey(const ValueKey('ret-oi2-inc')), findsOneWidget);
    });

    testWidgets('the refund preview follows the units, from the price paid', (tester) async {
      await openReturn(tester);
      expect(tester.widget<Text>(find.byKey(const ValueKey('refund-preview'))).data, r'$0.00');
      await asTap(tester, 'ret-oi1-inc');
      await asTap(tester, 'ret-oi1-inc');
      await asTap(tester, 'ret-oi2-inc');
      expect(tester.widget<Text>(find.byKey(const ValueKey('refund-preview'))).data, r'$70.00', reason: '2 x 20 + 1 x 30');
      await asTap(tester, 'ret-oi1-dec');
      expect(tester.widget<Text>(find.byKey(const ValueKey('refund-preview'))).data, r'$50.00');
    });

    testWidgets('lines show the French name and option', (tester) async {
      await openReturn(tester, lang: 'fr');
      expect(find.text('Chaussures de course'), findsOneWidget);
      expect(find.text('Pointure : 40 · Couleur : Noir'), findsOneWidget);
    });
  });

  group('validation', () {
    testWidgets('at least one unit is needed: inline error, snackbar, nothing sent', (tester) async {
      await openReturn(tester);
      await asTap(tester, 'return-submit');
      await asSettle(tester);
      expect(find.byKey(const ValueKey('items-error')), findsOneWidget);
      expect(asSnack(tester), 'Choose at least one item to return.');
      expect(server.countOf('disputes:open'), 0);
    });

    testWidgets('then a category is needed', (tester) async {
      await openReturn(tester);
      await asTap(tester, 'ret-oi2-inc');
      await asTap(tester, 'return-submit');
      await asSettle(tester);
      expect(find.byKey(const ValueKey('category-error')), findsOneWidget);
      expect(asSnack(tester), 'Choose what is wrong first.');
      expect(server.countOf('disputes:open'), 0);
    });

    testWidgets('then a reason of at least 5 characters', (tester) async {
      await openReturn(tester);
      await asTap(tester, 'ret-oi2-inc');
      await asTap(tester, 'cat-damaged');
      await tester.enterText(find.byKey(const ValueKey('return-details')).hitTestable(), 'abcd');
      await asTap(tester, 'return-submit');
      await asSettle(tester);
      expect(find.text('Describe the problem in at least 5 characters.'), findsWidgets);
      expect(asSnack(tester), 'Describe the problem in at least 5 characters.');
      expect(server.countOf('disputes:open'), 0);
    });

    testWidgets('a photo still uploading blocks the send', (tester) async {
      asFakePhotos(1);
      final upload = Completer<String>();
      UploadService.debugUpload = (bytes, name) => upload.future; // never answers during the check
      await openReturn(tester);
      await asTap(tester, 'ret-oi2-inc');
      await asTap(tester, 'cat-damaged');
      await tester.enterText(find.byKey(const ValueKey('return-details')).hitTestable(), 'The sole is torn');
      await asAttachPhotos(tester, settle: false);
      await asTap(tester, 'return-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Wait for your photos to finish uploading.');
      expect(server.countOf('disputes:open'), 0);
      upload.complete('/uploads/late.jpg');
      await asSettle(tester);
    });
  });

  group('the request', () {
    testWidgets('items, quantities, category, reason, photos and refund destination travel together', (tester) async {
      asFakePhotos(2);
      await openReturn(tester);
      await asTap(tester, 'ret-oi1-inc');
      await asTap(tester, 'ret-oi2-inc');
      await asTap(tester, 'cat-wrong_item');
      await tester.enterText(find.byKey(const ValueKey('return-details')).hitTestable(), '  Not the size I ordered  ');
      await asAttachPhotos(tester);
      await asTap(tester, 'return-submit');
      await asSettle(tester);
      expect(server.bodiesOf('disputes:open').single, {
        'orderId': 'o1',
        'type': 'return',
        'reason': 'Not the size I ordered',
        'category': 'wrong_item',
        'items': [
          {'itemId': 'oi1', 'qty': 1},
          {'itemId': 'oi2', 'qty': 1},
        ],
        'attachments': ['/uploads/photo-1.jpg', '/uploads/photo-2.jpg'],
        'refundTo': 'wallet',
      });
    });

    testWidgets('a mobile-money order can send the refund to the phone; a wallet order cannot choose', (tester) async {
      await openReturn(tester);
      expect(find.byKey(const ValueKey('refund-phone')), findsNothing, reason: 'paid with the wallet: it goes back to the wallet');
      await asOpen(tester, ReturnRequestScreen(order: asOrder(method: 'airtel_money')));
      expect(find.byKey(const ValueKey('refund-phone')), findsOneWidget);
      await asTap(tester, 'refund-phone');
      await asTap(tester, 'ret-oi2-inc');
      await asTap(tester, 'cat-defective');
      await tester.enterText(find.byKey(const ValueKey('return-details')).hitTestable(), 'It does not switch on');
      await asTap(tester, 'return-submit');
      await asSettle(tester);
      expect(server.bodiesOf('disputes:open').single!['refundTo'], 'phone');
    });

    testWidgets('success: a snackbar, then the new request on screen', (tester) async {
      await openReturn(tester);
      await asTap(tester, 'ret-oi2-inc');
      await asTap(tester, 'cat-damaged');
      await tester.enterText(find.byKey(const ValueKey('return-details')).hitTestable(), 'The case is cracked');
      await asTap(tester, 'return-submit');
      await asSettle(tester);
      expect(find.byType(ReturnStatusScreen), findsOneWidget);
      expect(find.text('RET-7001'), findsWidgets);
      expect(asSnack(tester), 'Return request RET-7001 sent.');
      expect(find.byKey(const ValueKey('siblings')), findsNothing);
    });

    testWidgets('a return over several stores: the customer is told, and the other requests are listed', (tester) async {
      server.handlers['disputes:open'] = (_) => {...disputeJson(id: 'n1', reference: 'RET-7001'), 'siblings': ['n2']};
      server.handlers['disputes:get'] = (b) => disputeJson(id: b!['id'] as String, reference: b['id'] == 'n2' ? 'RET-7002' : 'RET-7001');
      await openReturn(tester);
      await asTap(tester, 'ret-oi1-inc');
      await asTap(tester, 'ret-oi2-inc');
      await asTap(tester, 'cat-damaged');
      await tester.enterText(find.byKey(const ValueKey('return-details')).hitTestable(), 'Both are damaged');
      await asTap(tester, 'return-submit');
      await asSettle(tester);
      expect(asSnack(tester), '2 return requests sent, one per store.');
      expect(find.byKey(const ValueKey('siblings')), findsOneWidget);
      expect(find.textContaining('2 requests were created'), findsOneWidget);
      expect(find.textContaining('RET-7002'), findsOneWidget);
      expect(find.byKey(const ValueKey('sibling-n2')), findsOneWidget);
    });

    testWidgets('a refusal from the server: French snackbar, the form stays, the button works again', (tester) async {
      server.handlers['disputes:open'] = (_) => throw asServerError('You can return at most 1 of "Earbuds".');
      await openReturn(tester, lang: 'fr');
      await asTap(tester, 'ret-oi2-inc');
      await asTap(tester, 'cat-damaged');
      await tester.enterText(find.byKey(const ValueKey('return-details')).hitTestable(), 'Cassés à l’arrivée');
      await asTap(tester, 'return-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Vous pouvez retourner au maximum 1 unité(s) de « Earbuds ».');
      expect(find.byType(ReturnRequestScreen), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.byKey(const ValueKey('return-submit')), findsOneWidget);
    });

    testWidgets('an offline failure speaks too', (tester) async {
      server.handlers['disputes:open'] = (_) => throw StateError('socket down');
      await openReturn(tester);
      await asTap(tester, 'ret-oi2-inc');
      await asTap(tester, 'cat-damaged');
      await tester.enterText(find.byKey(const ValueKey('return-details')).hitTestable(), 'The case is cracked');
      await asTap(tester, 'return-submit');
      await asSettle(tester);
      expect(asSnack(tester), const Strings('en').errUnexpected);
    });

    testWidgets('label button rules: no icon on the buttons, one filled button', (tester) async {
      await openReturn(tester);
      expectButtonRules(tester);
    });
  });

  group('report a problem', () {
    Future<void> openDispute(WidgetTester tester, {String status = 'delivered', String lang = 'en'}) =>
        asOpen(tester, DisputeFormScreen(order: asOrder(status: status)), lang: lang);

    testWidgets('a delivered order offers the five problems, an order on its way only "not received" and "other"', (tester) async {
      await openDispute(tester);
      for (final c in ['missing', 'damaged', 'wrong_item', 'not_received', 'other']) {
        expect(find.byKey(ValueKey('cat-$c')), findsOneWidget, reason: c);
      }
      await openDispute(tester, status: 'shipped');
      expect(find.byKey(const ValueKey('cat-not_received')), findsOneWidget);
      expect(find.byKey(const ValueKey('cat-other')), findsOneWidget);
      expect(find.byKey(const ValueKey('cat-missing')), findsNothing);
      expect(find.byKey(const ValueKey('cat-damaged')), findsNothing);
    });

    testWidgets('the category and a reason are required', (tester) async {
      await openDispute(tester);
      await asTap(tester, 'dispute-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Choose what is wrong first.');
      await asTap(tester, 'cat-missing');
      await asTap(tester, 'dispute-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Describe the problem in at least 5 characters.');
      expect(server.countOf('disputes:open'), 0);
    });

    testWidgets('no line ticked means the whole order: no items are sent', (tester) async {
      await openDispute(tester);
      await asTap(tester, 'cat-not_received');
      await tester.enterText(find.byKey(const ValueKey('dispute-details')).hitTestable(), 'The parcel never came');
      await asTap(tester, 'dispute-submit');
      await asSettle(tester);
      expect(server.bodiesOf('disputes:open').single, {'orderId': 'o1', 'type': 'dispute', 'reason': 'The parcel never came', 'category': 'not_received'});
      expect(find.byType(ReturnStatusScreen), findsOneWidget);
      expect(asSnack(tester), 'Report RET-7001 sent.');
    });

    testWidgets('ticked lines and photos are sent', (tester) async {
      asFakePhotos(1);
      await openDispute(tester);
      await asTap(tester, 'cat-damaged');
      await asTap(tester, 'dp-item-p2');
      await tester.enterText(find.byKey(const ValueKey('dispute-details')).hitTestable(), 'The earbuds are cracked');
      await asAttachPhotos(tester);
      await asTap(tester, 'dispute-submit');
      await asSettle(tester);
      expect(server.bodiesOf('disputes:open').single, {
        'orderId': 'o1',
        'type': 'dispute',
        'reason': 'The earbuds are cracked',
        'category': 'damaged',
        'items': [
          {'productId': 'p2', 'qty': 1}
        ],
        'attachments': ['/uploads/photo-1.jpg'],
      });
    });

    testWidgets('one open dispute per order: the server error is shown in French', (tester) async {
      server.handlers['disputes:open'] = (_) => throw asServerError('You already have an open request for this order.');
      await openDispute(tester, lang: 'fr');
      await asTap(tester, 'cat-damaged');
      await tester.enterText(find.byKey(const ValueKey('dispute-details')).hitTestable(), 'Cassé à la livraison');
      await asTap(tester, 'dispute-submit');
      await asSettle(tester);
      expect(asSnack(tester), 'Vous avez déjà une demande en cours pour cette commande.');
      expect(find.byType(DisputeFormScreen), findsOneWidget);
    });

    testWidgets('button rules and French labels', (tester) async {
      await openDispute(tester, lang: 'fr');
      expectButtonRules(tester);
      expect(find.text('Signaler un problème'), findsOneWidget);
      expect(find.text('Envoyer le signalement'), findsOneWidget);
    });
  });
}
