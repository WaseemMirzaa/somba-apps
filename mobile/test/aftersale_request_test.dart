// The request detail screen: one banner per stage, the actions the server allows, the refund result, the
// conversation (first names only), the reply composer, and live updates.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/screens/more/aftersale_request.dart';
import 'package:lipcart/services/aftersale_models.dart';
import 'package:lipcart/services/aftersale_store.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'aftersale_helpers.dart';
import 'button_rules.dart';
import 'gap_helpers.dart';

void main() {
  late AsFake server;
  late Map<String, dynamic> current;

  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  setUp(() async {
    server = await asReset();
    current = disputeJson(messages: []);
    server.handlers['disputes:get'] = (_) => current;
  });
  tearDown(asTearDown);

  Future<void> open(WidgetTester tester, {String lang = 'en', bool byId = false}) async {
    await asOpen(tester, byId ? const ReturnStatusScreen(requestId: 'd1') : ReturnStatusScreen(returnRequest: DisputeView.fromJson(current)), lang: lang);
    await asSettle(tester);
  }

  String banner(WidgetTester tester) => tester.widget<Text>(find.byKey(const ValueKey('return-status'))).data!;
  String? body(WidgetTester tester) => find.byKey(const ValueKey('stage-body')).evaluate().isEmpty ? null : tester.widget<Text>(find.byKey(const ValueKey('stage-body'))).data;

  group('the banner follows the stage', () {
    final cases = <(String, String, String)>[
      ('awaiting_seller', 'Waiting for the seller', 'En attente du vendeur'),
      ('seller_rejected', 'The seller declined your return', 'Le vendeur a refusé votre retour'),
      ('seller_timeout', 'The seller did not answer in time', 'Le vendeur n’a pas répondu à temps'),
      ('escalated', 'With Somba support', 'Chez le support Somba'),
      ('approved', 'Return accepted', 'Retour accepté'),
      ('pickup', 'Pickup arranged', 'Collecte organisée'),
      ('received', 'Received at the warehouse', 'Reçu à l’entrepôt'),
    ];
    for (final c in cases) {
      for (final lang in ['en', 'fr']) {
        testWidgets('${c.$1} ($lang)', (tester) async {
          current = disputeJson(stage: c.$1, messages: []);
          await open(tester, lang: lang);
          expect(banner(tester), lang == 'en' ? c.$2 : c.$3);
          expect(body(tester), isNotEmpty);
        });
      }
    }

    testWidgets('a dispute that the seller answered says support will decide', (tester) async {
      current = disputeJson(type: 'dispute', stage: 'seller_replied', category: 'missing', messages: []);
      await open(tester);
      expect(banner(tester), 'The seller replied');
      expect(body(tester), contains('Somba support will review'));
      expect(find.text('Dispute'), findsOneWidget);
    });

    testWidgets('while the seller has time, the deadline is shown', (tester) async {
      current = disputeJson(sellerDueAt: DateTime.now().add(const Duration(days: 1)).toUtc().toIso8601String(), messages: []);
      await open(tester);
      expect(body(tester), startsWith('The seller has until '));
      expect(find.byKey(const ValueKey('seller-due')), findsOneWidget);
    });

    testWidgets('an OLD payload (no stage, items, photos or thread) renders', (tester) async {
      current = oldDisputeJson();
      await open(tester);
      expect(banner(tester), 'Under review');
      expect(body(tester), 'Our team is reviewing your request.');
      expect(find.byKey(const ValueKey('request-items')), findsNothing);
      expect(find.text('Too small'), findsOneWidget);
      expect(find.byKey(const ValueKey('escalate')), findsNothing);
      expect(find.byKey(const ValueKey('cancel-request')), findsNothing);
    });

    testWidgets('an OLD resolved payload shows its resolution', (tester) async {
      current = oldDisputeJson(status: 'resolved', resolution: 'Refunded to your wallet');
      await open(tester);
      expect(banner(tester), 'Resolved');
      expect(body(tester), 'Refunded to your wallet');
      expect(find.byKey(const ValueKey('closed-note')), findsOneWidget);
    });
  });

  group('the result of a closed request', () {
    testWidgets('a refund to the wallet says how much', (tester) async {
      current = disputeJson(status: 'resolved', stage: 'closed', refundUsd: 12.5, outcome: 'return_refund', resolution: 'Return received and refunded', items: [disputeItemJson('di1', refund: 12.5)], messages: []);
      await open(tester);
      expect(banner(tester), 'Refund issued');
      expect(body(tester), r'$12.50 refunded to your wallet');
      expect(find.byKey(const ValueKey('decision')), findsOneWidget);
      expect(find.text('Return and refund'), findsOneWidget);
      expect(find.text(r'Refund $12.50'), findsOneWidget, reason: 'the line carries its part');
    });

    testWidgets('in French, to the phone', (tester) async {
      current = disputeJson(status: 'resolved', stage: 'closed', refundUsd: 8, refundTo: 'phone', outcome: 'refund_partial', messages: []);
      await open(tester, lang: 'fr');
      expect(banner(tester), 'Remboursement effectué');
      expect(body(tester), '8,00 \$ renvoyés sur votre numéro mobile money');
      expect(find.text('Remboursement partiel'), findsOneWidget);
    });

    testWidgets('a replacement decision points to the Replacements tab', (tester) async {
      current = disputeJson(type: 'dispute', status: 'resolved', stage: 'closed', outcome: 'replacement', resolution: 'Replacement approved', messages: []);
      await open(tester);
      expect(banner(tester), 'Replacement approved');
      expect(body(tester), contains('Replacements tab'));
    });

    testWidgets('a refusal shows the reason, a cancellation says so', (tester) async {
      current = disputeJson(status: 'rejected', stage: 'closed', resolution: 'Not covered by the policy', messages: []);
      await open(tester);
      expect(banner(tester), 'Declined');
      expect(body(tester), 'Not covered by the policy');
      current = disputeJson(status: 'rejected', stage: 'closed', resolution: 'Cancelled by the customer', messages: []);
      await open(tester);
      expect(banner(tester), 'Request cancelled');
    });

    testWidgets('a closed request has a note instead of the composer', (tester) async {
      current = disputeJson(status: 'resolved', stage: 'closed', messages: [msgJ('m1')]);
      await open(tester);
      expect(find.byKey(const ValueKey('closed-note')), findsOneWidget);
      expect(find.byKey(const ValueKey('reply-field')), findsNothing);
      expect(find.byKey(const ValueKey('reply-send')), findsNothing);
      expect(find.byKey(const ValueKey('escalate')), findsNothing);
    });
  });

  group('what the customer may do', () {
    testWidgets('escalate and cancel appear only when the server allows them', (tester) async {
      current = disputeJson(stage: 'awaiting_seller', canCancel: true, messages: []);
      await open(tester);
      expect(find.byKey(const ValueKey('escalate')), findsNothing);
      expect(find.byKey(const ValueKey('cancel-request')), findsOneWidget);

      current = disputeJson(stage: 'seller_rejected', canEscalate: true, canCancel: true, messages: []);
      await open(tester);
      expect(find.byKey(const ValueKey('escalate')), findsOneWidget);
      expect(find.byKey(const ValueKey('cancel-request')), findsOneWidget);

      current = disputeJson(stage: 'pickup', canEscalate: false, canCancel: false, messages: []);
      await open(tester);
      expect(find.byKey(const ValueKey('escalate')), findsNothing);
      expect(find.byKey(const ValueKey('cancel-request')), findsNothing);
    });

    testWidgets('escalating asks first, sends the note, and confirms with a snackbar', (tester) async {
      current = disputeJson(stage: 'seller_rejected', canEscalate: true, canCancel: true, sellerReason: 'Worn out', messages: []);
      server.handlers['disputes:escalate'] = (_) {
        current = disputeJson(stage: 'escalated', messages: [], updatedAt: '2026-10-26T00:00:00Z');
        return current;
      };
      await open(tester);
      await asTap(tester, 'escalate');
      await asSettle(tester);
      expect(find.text('Ask Somba support to decide?'), findsOneWidget);
      expect(server.countOf('disputes:escalate'), 0, reason: 'nothing is sent before the customer confirms');
      await tester.enterText(find.byKey(const ValueKey('escalate-note')).hitTestable(), 'The shoes were new');
      await tester.tap(find.byKey(const ValueKey('escalate-confirm')));
      await asSettle(tester);
      expect(server.bodiesOf('disputes:escalate').single, {'id': 'd1', 'note': 'The shoes were new'});
      expect(asSnack(tester), 'Sent to Somba support.');
      expect(banner(tester), 'With Somba support');
      expect(find.byKey(const ValueKey('escalate')), findsNothing, reason: 'no longer allowed');
    });

    testWidgets('backing out of the escalate dialog sends nothing', (tester) async {
      current = disputeJson(stage: 'seller_timeout', canEscalate: true, messages: []);
      await open(tester);
      await asTap(tester, 'escalate');
      await asSettle(tester);
      await tester.tap(find.byKey(const ValueKey('escalate-back')));
      await asSettle(tester);
      expect(server.countOf('disputes:escalate'), 0);
      expect(find.text('Ask Somba support to decide?'), findsNothing);
    });

    testWidgets('a refused escalation is shown in French and the screen stays usable', (tester) async {
      current = disputeJson(stage: 'seller_rejected', canEscalate: true, messages: []);
      server.handlers['disputes:escalate'] = (_) => throw asServerError('Wait for the seller to answer, or for the response time to pass.');
      await open(tester, lang: 'fr');
      await asTap(tester, 'escalate');
      await asSettle(tester);
      await tester.tap(find.byKey(const ValueKey('escalate-confirm')));
      await asSettle(tester);
      expect(asSnack(tester), 'Attendez la réponse du vendeur, ou la fin du délai de réponse.');
      expect(find.byKey(const ValueKey('escalate')), findsOneWidget);
    });

    testWidgets('cancelling asks first; keeping the request sends nothing', (tester) async {
      current = disputeJson(canCancel: true, messages: []);
      await open(tester);
      await asTap(tester, 'cancel-request');
      await asSettle(tester);
      expect(find.text('Cancel this request?'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('cancel-keep')));
      await asSettle(tester);
      expect(server.countOf('disputes:cancel'), 0);
    });

    testWidgets('cancelling sends disputes:cancel and the request closes', (tester) async {
      current = disputeJson(canCancel: true, messages: []);
      server.handlers['disputes:cancel'] = (_) {
        current = disputeJson(status: 'rejected', stage: 'closed', resolution: 'Cancelled by the customer', messages: [], updatedAt: '2026-10-26T00:00:00Z');
        return current;
      };
      await open(tester);
      await asTap(tester, 'cancel-request');
      await asSettle(tester);
      await tester.tap(find.byKey(const ValueKey('cancel-confirm')));
      await asSettle(tester);
      expect(server.bodiesOf('disputes:cancel').single, {'id': 'd1'});
      expect(asSnack(tester), 'Request cancelled.');
      expect(banner(tester), 'Request cancelled');
      expect(find.byKey(const ValueKey('cancel-request')), findsNothing);
      expect(find.byKey(const ValueKey('closed-note')), findsOneWidget);
    });

    testWidgets('too late to cancel: the server says so (French)', (tester) async {
      current = disputeJson(canCancel: true, messages: []);
      server.handlers['disputes:cancel'] = (_) => throw asServerError('It is too late to cancel: the return is already on its way.');
      await open(tester, lang: 'fr');
      await asTap(tester, 'cancel-request');
      await asSettle(tester);
      await tester.tap(find.byKey(const ValueKey('cancel-confirm')));
      await asSettle(tester);
      expect(asSnack(tester), 'Il est trop tard pour annuler : le retour est déjà en cours.');
    });
  });

  group('details', () {
    testWidgets('items with their quantity and refund, the customer’s photos and message', (tester) async {
      current = disputeJson(
        attachments: ['/uploads/a.jpg', '/uploads/b.jpg'],
        items: [disputeItemJson('di1', qty: 2, unit: 20, variant: 'Size: 40'), disputeItemJson('di2', name: 'Earbuds', nameFr: 'Écouteurs', unit: 30)],
        messages: [],
      );
      await open(tester);
      expect(find.byKey(const ValueKey('request-items')), findsOneWidget);
      expect(find.text('Running shoes'), findsOneWidget);
      expect(find.text('Qty 2'), findsOneWidget);
      expect(find.text(r'Worth up to $40.00'), findsOneWidget);
      expect(find.text('The sole came off after two days'), findsOneWidget);
      expect(find.byKey(const ValueKey('photo-0')), findsOneWidget);
      expect(find.byKey(const ValueKey('photo-1')), findsOneWidget);
    });

    testWidgets('the seller’s answer: the reason, when, and the deadline while they have not answered', (tester) async {
      current = disputeJson(stage: 'seller_rejected', sellerReason: 'The shoes show wear', sellerRespondedAt: '2026-10-25T09:30:00Z', canEscalate: true, messages: []);
      await open(tester);
      expect(find.byKey(const ValueKey('seller-panel')), findsOneWidget);
      expect(find.text('The shoes show wear'), findsOneWidget);
    });

    testWidgets('the return’s pickup progress: a rider will collect, then received', (tester) async {
      current = disputeJson(stage: 'pickup', pickupTaskId: 't1', sellerRespondedAt: '2026-10-25T09:30:00Z', messages: []);
      await open(tester);
      expect(find.byKey(const ValueKey('return-progress')), findsOneWidget);
      expect(find.text('A warehouse rider will collect it.'), findsOneWidget);
      expect(find.text('Received at the warehouse'), findsWidgets);

      current = disputeJson(stage: 'received', receivedAt: '2026-10-27T10:00:00Z', messages: [], updatedAt: '2026-10-27T10:00:00Z');
      await open(tester);
      expect(find.text('A warehouse rider will collect it.'), findsNothing);
      expect(banner(tester), 'Received at the warehouse');
    });

    testWidgets('a dispute has no pickup progress', (tester) async {
      current = disputeJson(type: 'dispute', stage: 'seller_replied', messages: []);
      await open(tester);
      expect(find.byKey(const ValueKey('return-progress')), findsNothing);
    });
  });

  group('the conversation', () {
    testWidgets('sellers by first name, support, and the customer as "You"; no ids anywhere', (tester) async {
      current = disputeJson(messages: [
        msgJ('m1', role: 'seller', name: 'Jean Mukendi Kalala', text: 'Can you send a photo?'),
        msgJ('m2', role: 'customer', name: 'Aline Kasongo', text: 'Here it is'),
        msgJ('m3', role: 'admin_support', name: 'Chantal Dupont', text: 'We are looking at it'),
      ]);
      await open(tester);
      expect(find.text('Jean · seller'), findsOneWidget);
      expect(find.text('You'), findsOneWidget);
      expect(find.text('Somba support'), findsOneWidget);
      expect(find.textContaining('Mukendi'), findsNothing);
      expect(find.textContaining('Kalala'), findsNothing);
      expect(find.textContaining('Dupont'), findsNothing);
      expect(find.textContaining('Kasongo'), findsNothing);
      expect(find.text('Can you send a photo?'), findsOneWidget);
    });

    testWidgets('an empty conversation says so', (tester) async {
      await open(tester);
      expect(find.byKey(const ValueKey('thread-empty')), findsOneWidget);
    });

    testWidgets('a message with photos shows them', (tester) async {
      current = disputeJson(messages: [msgJ('m1', attachments: ['/uploads/x.jpg'])]);
      await open(tester);
      expect(find.byKey(const ValueKey('msg-m1')), findsOneWidget);
      expect(find.byKey(const ValueKey('photo-0')), findsOneWidget);
    });

    testWidgets('replying sends the text, clears the box, confirms, and shows the message', (tester) async {
      server.handlers['disputes:reply'] = (b) => msgJ('m9', role: 'customer', name: 'Aline Kasongo', text: b!['message'] as String);
      await open(tester);
      await tester.enterText(find.byKey(const ValueKey('reply-field')), '  Thank you  ');
      await asTap(tester, 'reply-send');
      await asSettle(tester);
      expect(server.bodiesOf('disputes:reply').single, {'id': 'd1', 'message': 'Thank you'});
      expect(asSnack(tester), 'Message sent.');
      expect(tester.widget<TextField>(find.byKey(const ValueKey('reply-field'))).controller!.text, isEmpty);
      expect(find.text('Thank you'), findsOneWidget);
      expect(find.byKey(const ValueKey('msg-m9')), findsOneWidget);
    });

    testWidgets('photos go with the reply', (tester) async {
      asFakePhotos(2);
      server.handlers['disputes:reply'] = (b) => msgJ('m9', role: 'customer', text: b!['message'] as String, attachments: (b['attachments'] as List).cast<String>());
      await open(tester);
      await tester.enterText(find.byKey(const ValueKey('reply-field')), 'Photos attached');
      await asAttachPhotos(tester);
      await asTap(tester, 'reply-send');
      await asSettle(tester);
      expect(server.bodiesOf('disputes:reply').single, {'id': 'd1', 'message': 'Photos attached', 'attachments': ['/uploads/photo-1.jpg', '/uploads/photo-2.jpg']});
    });

    testWidgets('an empty reply is refused on the spot', (tester) async {
      await open(tester);
      await asTap(tester, 'reply-send');
      await asSettle(tester);
      expect(asSnack(tester), 'Write a message first.');
      expect(find.text('Write a message first.'), findsWidgets, reason: 'inline too');
      expect(server.countOf('disputes:reply'), 0);
    });

    testWidgets('a failed reply is announced and the text stays', (tester) async {
      server.handlers['disputes:reply'] = (_) => throw asServerError('This request is closed.');
      await open(tester, lang: 'fr');
      await tester.enterText(find.byKey(const ValueKey('reply-field')), 'Bonjour');
      await asTap(tester, 'reply-send');
      await asSettle(tester);
      expect(asSnack(tester), 'Cette demande est close.');
      expect(tester.widget<TextField>(find.byKey(const ValueKey('reply-field'))).controller!.text, 'Bonjour');
    });
  });

  group('live updates', () {
    testWidgets('dispute:updated changes the open screen', (tester) async {
      current = disputeJson(canCancel: true, messages: []);
      await open(tester);
      expect(banner(tester), 'Waiting for the seller');
      RealtimeStore.instance.debugEmit('dispute:updated', disputeJson(stage: 'approved', messages: null, updatedAt: '2026-10-27T00:00:00Z'));
      await tester.pump();
      expect(banner(tester), 'Return accepted');
      expect(find.byKey(const ValueKey('cancel-request')), findsNothing, reason: 'the push says it can no longer be cancelled');
      expect(find.byKey(const ValueKey('return-progress')), findsOneWidget);
    });

    testWidgets('dispute:message adds to the conversation', (tester) async {
      await open(tester);
      expect(find.byKey(const ValueKey('thread-empty')), findsOneWidget);
      RealtimeStore.instance.debugEmit('dispute:message', {'disputeId': 'd1', 'message': msgJ('m5', text: 'We accept your return')});
      await tester.pump();
      expect(find.text('We accept your return'), findsOneWidget);
      expect(find.byKey(const ValueKey('thread-empty')), findsNothing);
    });

    testWidgets('a push for another request does not touch this screen', (tester) async {
      await open(tester);
      RealtimeStore.instance.debugEmit('dispute:updated', disputeJson(id: 'other', stage: 'escalated', updatedAt: '2026-10-27T00:00:00Z'));
      await tester.pump();
      expect(banner(tester), 'Waiting for the seller');
    });

    testWidgets('closing while open: the push turns the composer into the note', (tester) async {
      await open(tester);
      expect(find.byKey(const ValueKey('reply-field')), findsOneWidget);
      RealtimeStore.instance.debugEmit('dispute:updated', disputeJson(status: 'resolved', stage: 'closed', refundUsd: 20, updatedAt: '2026-10-27T00:00:00Z'));
      await tester.pump();
      expect(find.byKey(const ValueKey('reply-field')), findsNothing);
      expect(find.byKey(const ValueKey('closed-note')), findsOneWidget);
      expect(banner(tester), 'Refund issued');
    });
  });

  group('opening by id (a notice) and failures', () {
    testWidgets('fetches the request by its id', (tester) async {
      current = disputeJson(stage: 'escalated', messages: []);
      await open(tester, byId: true);
      expect(server.bodiesOf('disputes:get').first, {'id': 'd1'});
      expect(banner(tester), 'With Somba support');
    });

    testWidgets('a request that cannot be loaded shows the error with a retry', (tester) async {
      var calls = 0;
      server.handlers['disputes:get'] = (_) => ++calls == 1 ? throw asServerError('Dispute not found.') : current;
      await open(tester, byId: true);
      expect(find.text('Dispute not found.'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('as-retry')));
      await asSettle(tester);
      expect(banner(tester), 'Waiting for the seller');
    });

    testWidgets('with the request in hand and the thread failing, a snackbar and a retry link', (tester) async {
      server.handlers['disputes:get'] = (_) => throw asServerError('Not allowed.');
      await asOpen(tester, ReturnStatusScreen(returnRequest: DisputeView.fromJson(disputeJson())));
      await asSettle(tester);
      expect(banner(tester), 'Waiting for the seller');
      expect(asSnack(tester), 'Not allowed.');
      expect(find.byKey(const ValueKey('thread-retry')), findsOneWidget);
    });
  });

  group('rules', () {
    testWidgets('one filled button, no icon on label buttons (escalate case)', (tester) async {
      current = disputeJson(stage: 'seller_rejected', canEscalate: true, canCancel: true, messages: [msgJ('m1')]);
      await open(tester);
      expectButtonRules(tester);
    });

    testWidgets('the store keeps the request, so a list reload does not lose the thread', (tester) async {
      current = disputeJson(messages: [msgJ('m1')]);
      await open(tester);
      server.handlers['disputes:list'] = (_) => [disputeJson()];
      await AfterSaleStore.instance.loadDisputes();
      await tester.pump();
      expect(find.byKey(const ValueKey('msg-m1')), findsOneWidget);
    });
  });
}
