// Returns, disputes, replacements and exchanges: the models (new and OLD payloads), the wording of every stage in
// English and French, and the French of the server's errors (docs/contracts/after-sale.md section 11).
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/aftersale_status.dart';
import 'package:lipcart/screens/more/aftersale_widgets.dart';
import 'package:lipcart/services/aftersale_models.dart';

import 'aftersale_helpers.dart';
import 'gap_helpers.dart';

void main() {
  setUpAll(() => initializeDateFormatting());
  setUp(() async {
    await gapReset();
  });
  tearDown(gapTearDown);

  const en = Strings('en');
  const fr = Strings('fr');

  group('DisputeView', () {
    test('parses a full payload: items, photos, seller answer, refund, thread and what the customer may do', () {
      final d = DisputeView.fromJson(disputeJson(
        stage: 'seller_rejected',
        attachments: ['/uploads/a.jpg', '/uploads/b.jpg'],
        sellerReason: 'Worn out',
        sellerDueAt: '2026-10-26T09:30:00Z',
        sellerRespondedAt: '2026-10-25T09:30:00Z',
        canEscalate: true,
        canCancel: true,
        refundUsd: 12.5,
        refundTo: 'phone',
        outcome: 'refund_partial',
        items: [disputeItemJson('di1', qty: 2, unit: 20, refund: 12.5, variant: 'Size: 40')],
        messages: [msgJ('m1'), msgJ('m2', role: 'customer', name: 'Aline Kasongo')],
      ));
      expect(d.id, 'd1');
      expect(d.reference, 'RET-1001');
      expect(d.isReturn, isTrue);
      expect(d.stage, 'seller_rejected');
      expect(d.isOpen, isTrue);
      expect(d.attachments, ['/uploads/a.jpg', '/uploads/b.jpg']);
      expect(d.items.single.qty, 2);
      expect(d.items.single.refundUsd, 12.5);
      expect(d.items.single.valueUsd, 40);
      expect(d.items.single.hasVariant, isTrue);
      expect(d.items.single.displayName('fr'), 'Chaussures de course');
      expect(d.items.single.displayName('en'), 'Running shoes');
      expect(d.sellerReason, 'Worn out');
      expect(d.sellerDueAt, isNotNull);
      expect(d.canEscalate, isTrue);
      expect(d.canCancel, isTrue);
      expect(d.refundUsd, 12.5);
      expect(d.refundTo, 'phone');
      expect(d.outcome, 'refund_partial');
      expect(d.messages, hasLength(2));
      expect(d.messages!.first.isSeller, isTrue);
      expect(d.messages!.last.isCustomer, isTrue);
      expect(d.messageCount, 2);
    });

    test('an OLD payload (id, reference, orderId, type, reason, status, resolution only) still parses', () {
      final open = DisputeView.fromJson(oldDisputeJson());
      expect(open.reference, 'RET-0009');
      expect(open.items, isEmpty);
      expect(open.attachments, isEmpty);
      expect(open.messages, isNull);
      expect(open.hasStage, isFalse);
      expect(open.stage, 'awaiting_seller', reason: 'an open old request waits for review');
      expect(open.canEscalate, isFalse);
      expect(open.canCancel, isFalse);
      expect(open.refundUsd, 0);
      expect(open.refundTo, 'wallet');
      expect(open.sellerId, isNull);

      final done = DisputeView.fromJson(oldDisputeJson(status: 'resolved', resolution: 'Refunded to wallet'));
      expect(done.stage, 'closed');
      expect(done.isClosed, isTrue);
      expect(done.resolution, 'Refunded to wallet');
    });

    test('missing, null and oddly typed fields fall back to safe values', () {
      final d = DisputeView.fromJson({'id': 'x', 'type': 'weird', 'status': '', 'refundUsd': '7.5', 'items': 'nope', 'attachments': null, 'qty': null});
      expect(d.type, 'dispute');
      expect(d.status, 'open');
      expect(d.refundUsd, 7.5);
      expect(d.items, isEmpty);
      expect(d.attachments, isEmpty);
      final line = DisputeItemView.fromJson({'id': 'i', 'qty': 0});
      expect(line.qty, 1, reason: 'a line is at least one unit');
    });

    test('a cancelled request is a rejected one with the cancel resolution', () {
      final d = DisputeView.fromJson(disputeJson(status: 'rejected', stage: 'closed', resolution: 'Cancelled by the customer'));
      expect(d.wasCancelled, isTrue);
      expect(DisputeView.fromJson(disputeJson(status: 'rejected', stage: 'closed', resolution: 'Not covered')).wasCancelled, isFalse);
    });

    test('the pickup flow is a return that somebody accepted', () {
      for (final s in ['approved', 'pickup', 'received']) {
        expect(DisputeView.fromJson(disputeJson(stage: s)).inPickupFlow, isTrue, reason: s);
      }
      expect(DisputeView.fromJson(disputeJson(stage: 'awaiting_seller')).inPickupFlow, isFalse);
      expect(DisputeView.fromJson(disputeJson(type: 'dispute', stage: 'approved')).inPickupFlow, isFalse);
    });

    test('copyWith keeps the thread a list row does not carry', () {
      final detail = DisputeView.fromJson(disputeJson(messages: [msgJ('m1')]));
      final row = DisputeView.fromJson(disputeJson(stage: 'escalated'));
      expect(row.messages, isNull);
      final merged = row.keepingMessagesOf(detail);
      expect(merged.messages, hasLength(1));
      expect(merged.stage, 'escalated');
    });

    test('sellers appear by first name only', () {
      expect(firstNameOf('Jean Mukendi Kalala'), 'Jean');
      expect(firstNameOf('  Aline '), 'Aline');
      expect(firstNameOf(''), '');
    });
  });

  group('ReturnEligibility', () {
    test('parses the window, the lines and what remains', () {
      final e = ReturnEligibility.fromJson(eligibilityJson());
      expect(e.eligible, isTrue);
      expect(e.windowDays, 7);
      expect(e.items, hasLength(2));
      expect(e.items.first.remaining, 2);
      expect(e.items.first.unitPriceUsd, 20);
      expect(e.items.first.hasVariant, isTrue);
      expect(e.items.last.hasVariant, isFalse);
    });

    test('a closed window is recognised from endsAt in the past', () {
      final e = ReturnEligibility.fromJson(eligibilityJson(
        eligible: false,
        reason: 'Returns are accepted within 7 days of delivery, and that time has passed.',
        endsAt: '2026-10-01T00:00:00Z',
      ));
      expect(e.eligible, isFalse);
      expect(e.windowPassed, isTrue);
      expect(ReturnEligibility.fromJson(eligibilityJson(eligible: false, reason: 'Returns are not accepted at the moment.', windowDays: 0)).windowPassed, isFalse);
    });
  });

  group('ReplacementView and ExchangeView', () {
    test('parse the contract fields', () {
      final r = ReplacementView.fromJson(replacementJson(status: 'dispatched', deliveryTaskId: 't1', attachments: ['/uploads/a.jpg']));
      expect(r.reference, 'REP-2001');
      expect(r.status, 'dispatched');
      expect(r.deliveryTaskId, 't1');
      expect(r.displayName('fr'), 'Chaussures de course');
      expect(r.attachments, ['/uploads/a.jpg']);
      expect(r.isOpen, isTrue);
      final x = ExchangeView.fromJson(exchangeJson(status: 'delivered', diff: -5, held: 0));
      expect(x.priceDiffUsd, -5);
      expect(x.toVariant, 'Size: 42 · Colour: Black');
      expect(x.isOpen, isFalse);
      expect(ExchangeView.fromJson(exchangeJson(status: 'rejected', sellerReason: 'Out of stock')).isRejected, isTrue);
    });

    test('an old payload (no qty, variants, due date or task) parses', () {
      final r = ReplacementView.fromJson({'id': 'r0', 'reference': 'REP-1', 'orderId': 'o1', 'productName': 'Shoe', 'status': 'dispatched'});
      expect(r.qty, 1);
      expect(r.variant, isNull);
      expect(r.sellerDueAt, isNull);
      expect(r.deliveryTaskId, isNull);
      final x = ExchangeView.fromJson({'id': 'x0', 'fromName': 'A', 'toName': 'B'});
      expect(x.status, 'requested');
      expect(x.priceDiffUsd, 0);
      expect(x.toVariant, isNull);
    });
  });

  group('wording', () {
    test('every stage of a request has a banner in English and in French', () {
      for (final lang in [en, fr]) {
        for (final stage in ['awaiting_seller', 'seller_replied', 'seller_rejected', 'seller_timeout', 'escalated', 'approved', 'pickup', 'received']) {
          final d = DisputeView.fromJson(disputeJson(stage: stage, type: stage == 'seller_replied' ? 'dispute' : 'return'));
          final b = stageBanner(lang, d);
          expect(b.title, isNotEmpty, reason: '$stage ${lang.lang}');
          expect(b.body, isNotEmpty, reason: '$stage ${lang.lang}');
          expect(stageLabel(lang, d), isNotEmpty);
        }
      }
      expect(stageBanner(en, DisputeView.fromJson(disputeJson(stage: 'escalated'))).title, 'With Somba support');
      expect(stageBanner(fr, DisputeView.fromJson(disputeJson(stage: 'escalated'))).title, 'Chez le support Somba');
    });

    test('the seller deadline is shown, and a passed one says so', () {
      final soon = DateTime.now().add(const Duration(days: 1)).toUtc().toIso8601String();
      final late = DateTime.now().subtract(const Duration(days: 1)).toUtc().toIso8601String();
      expect(stageBanner(en, DisputeView.fromJson(disputeJson(sellerDueAt: soon))).body, startsWith('The seller has until '));
      expect(stageBanner(en, DisputeView.fromJson(disputeJson(sellerDueAt: late))).body, contains('has passed'));
      expect(stageBanner(fr, DisputeView.fromJson(disputeJson(sellerDueAt: late))).body, contains('dépassé'));
    });

    test('closed requests: refund to the wallet, refund to the phone, replacement, declined, cancelled, old', () {
      final wallet = DisputeView.fromJson(disputeJson(status: 'resolved', stage: 'closed', refundUsd: 12.5, outcome: 'return_refund'));
      expect(stageBanner(en, wallet).title, 'Refund issued');
      expect(stageBanner(en, wallet).body, '\$12.50 refunded to your wallet');
      expect(refundText(fr, wallet), '12,50 \$ remboursés sur votre portefeuille');
      final phone = DisputeView.fromJson(disputeJson(status: 'resolved', stage: 'closed', refundUsd: 8, refundTo: 'phone'));
      expect(refundText(en, phone), '\$8.00 sent back to your mobile-money number');
      final rep = DisputeView.fromJson(disputeJson(type: 'dispute', status: 'resolved', stage: 'closed', outcome: 'replacement'));
      expect(stageBanner(en, rep).title, 'Replacement approved');
      final no = DisputeView.fromJson(disputeJson(status: 'rejected', stage: 'closed', resolution: 'Not covered by the policy'));
      expect(stageBanner(en, no).title, 'Declined');
      expect(stageBanner(en, no).body, 'Not covered by the policy');
      final cancelled = DisputeView.fromJson(disputeJson(status: 'rejected', stage: 'closed', resolution: 'Cancelled by the customer'));
      expect(stageBanner(en, cancelled).title, 'Request cancelled');
      expect(stageLabel(fr, cancelled), 'Annulé');
      final old = DisputeView.fromJson(oldDisputeJson());
      expect(stageBanner(en, old).title, 'Under review');
      expect(stageBanner(fr, old).title, 'En cours d’examen');
    });

    test('replacement and exchange statuses read in both languages, warehouse steps are "being prepared"', () {
      for (final st in ['requested', 'approved', 'received', 'allocated', 'ready', 'dispatched', 'delivered', 'rejected']) {
        expect(transferStatusLabel(en, st), isNotEmpty);
        expect(transferStatusLabel(fr, st), isNot(equals(transferStatusLabel(en, st))), reason: st);
      }
      expect(transferStatusLabel(en, 'allocated'), 'Being prepared');
      expect(transferStatusLabel(fr, 'ready'), 'En préparation');
    });

    test('exchange money wording: charged, returned, refunded later, refunded, none', () {
      String t(Map<String, dynamic> j, [Strings s = en]) => exchangeMoneyText(s, ExchangeView.fromJson(j));
      expect(t(exchangeJson(diff: 10, held: 10)), r'$10.00 was taken from your wallet.');
      expect(t(exchangeJson(diff: 10, held: 10, status: 'rejected')), contains('returned to your wallet'));
      expect(t(exchangeJson(diff: -5, held: 0)), contains('will be refunded to your wallet'));
      expect(t(exchangeJson(diff: -5, held: 0, status: 'delivered')), contains('was refunded to your wallet'));
      expect(t(exchangeJson(diff: 0, held: 0)), 'No price difference.');
      expect(t(exchangeJson(diff: 0, held: 0), fr), 'Aucune différence de prix.');
    });

    test('categories and outcomes are worded in both languages', () {
      for (final c in ['damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'defective', 'other', 'missing', 'not_received']) {
        expect(categoryLabel(fr, c), isNotEmpty);
        expect(categoryLabel(fr, c), isNot(equals(c)));
      }
      expect(categoryLabel(en, 'brand_new'), 'brand_new', reason: 'unknown values pass through');
      for (final o in ['refund_full', 'refund_partial', 'replacement', 'reject', 'return_refund']) {
        expect(outcomeLabel(fr, o), isNotEmpty);
      }
    });
  });

  group('server errors in French', () {
    String f(String raw) => translateServerError(raw, fr);

    // Every after-sale error a customer screen can surface (contract section 11).
    const fixed = [
      'Order not found.',
      'Please describe the problem (at least a few words).',
      'This order has not been paid for or was cancelled.',
      'You already have an open request for this order.',
      'Choose what is wrong from the list.',
      'Photos must be a list of uploaded images.',
      'Photos must be images uploaded through the app.',
      'You can attach up to 6 photos.',
      'You can return items once the order has been delivered.',
      'Returns are not accepted at the moment.',
      'Choose at least one item to return.',
      'Choose how many of each item to return.',
      'An item appears twice in the request.',
      'One of the items is not on this order.',
      'The response time has passed; Somba support decides now.',
      'This request was already handled.',
      'This request was just updated by someone else. Refresh and try again.',
      'Wait for the seller to answer, or for the response time to pass.',
      'Only returns can be escalated; a dispute is already with Somba support.',
      'It is too late to cancel: the return is already on its way.',
      'This request is closed.',
      'Write a message first.',
      'Dispute not found.',
      'Pick the item to replace.',
      'Customers only.',
      'Not allowed.',
      'Order not found or not eligible for a replacement.',
      'Order not found or not eligible for an exchange.',
      'Say which item needs replacing.',
      'Say which item you want to exchange and for what.',
      'That item is not on this order.',
      'You already asked for a replacement of this item.',
      'You already asked to exchange this item.',
      'Choose a different option to exchange for.',
      'That product is no longer available.',
      'Not enough stock of that item for an exchange.',
      'This replacement was just updated by someone else. Refresh and try again.',
      'This exchange was just updated by someone else. Refresh and try again.',
      'Replacement not found.',
      'Exchange not found.',
    ];

    test('every fixed message a customer can meet has a French text', () {
      for (final m in fixed) {
        expect(f(m), isNot(equals(m)), reason: m);
        expect(translateServerError(m, en), m, reason: 'English stays as the server wrote it');
      }
    });

    test('messages with a number or a name are matched by pattern', () {
      expect(f('Returns are accepted within 7 days of delivery, and that time has passed.'), contains('7 jours'));
      expect(f('You can return at most 2 of "Running shoes".'), allOf(contains('2'), contains('« Running shoes »')));
      expect(f('Choose a size for "Running shoes".'), allOf(contains('« size »'), contains('« Running shoes »')));
    });

    test('the wallet-too-low message keeps its amount, in French money', () {
      expect(f(r'Your wallet balance is too low for the price difference ($12.50). Top up your wallet and try again.'),
          'Le solde de votre portefeuille est insuffisant pour la différence de prix (12,50 \$). Rechargez votre portefeuille puis réessayez.');
      expect(f(r'Your wallet balance is too low for the price difference ($1,202.50). Top up your wallet and try again.'), contains('1 202,50 \$'));
    });
  });
}
