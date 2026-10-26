// Support on screen: the list (status and unread badges, old tickets), the ticket (photos, replies, mark-read, live staff
// replies, the closed-ticket guard) and the new-ticket form (category, order, photos).
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/chat_widgets.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/support_store.dart';
import 'package:lipcart/services/upload_service.dart';

import 'button_rules.dart';
import 'gap_helpers.dart';
import 'social_helpers.dart';

Future<void> open(WidgetTester tester, Widget screen, {String lang = 'en'}) async {
  gapTallViewport(tester);
  await Strings.setLang(lang, persist: false);
  await tester.pumpWidget(gapApp(screen, lang: lang));
  await tester.pump(const Duration(milliseconds: 300));
}

TicketView ticket(Map<String, dynamic> j) => TicketView.fromJson(j);

final _staffMessage = {'id': 'tm2', 'from': 'Agent', 'fromId': 'ad1', 'role': 'admin_support', 'text': 'We are checking with the carrier.', 'at': '2026-10-24T10:00:00Z', 'attachments': ['/uploads/proof.jpg']};

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  late FakeServer server;
  setUp(() async => server = await socialReset());
  tearDown(socialTearDown);

  group('list', () {
    void tickets() => server.handlers['support:list'] = (_) => [
          ticketJson('t1', subject: 'Where is my parcel?', reference: 'TKT-1', status: 'pending', userUnread: 2, category: 'delivery', orderId: 'o1', updatedAt: '2026-10-24T10:00:00Z'),
          ticketJson('t2', subject: 'Refund question', reference: 'TKT-2', status: 'resolved', category: 'payment', updatedAt: '2026-10-23T10:00:00Z'),
          ticketJson('t3', subject: 'Wrong item', reference: 'TKT-3', status: 'closed', category: 'return', updatedAt: '2026-10-22T10:00:00Z'),
          ticketJson('t4', subject: 'Cannot log in', reference: 'TKT-4', status: 'open', category: 'account', updatedAt: '2026-10-21T10:00:00Z'),
          ticketJson('t0', subject: 'An old ticket', reference: 'TKT-0', legacy: true, updatedAt: '2026-10-01T10:00:00Z'),
        ];

    testWidgets('shows subject, reference, category, status badge and the unread count', (tester) async {
      RealtimeStore.instance.orders.add(OrderDto.fromJson({'id': 'o1', 'reference': 'SOM-1042', 'customerName': 'A', 'status': 'shipped', 'paymentMethod': 'wallet', 'totalUsd': 5, 'items': []}));
      tickets();
      await open(tester, const SupportListScreen());
      expect(find.text('Support'), findsOneWidget);
      expect(find.text('Where is my parcel?'), findsOneWidget);
      expect(find.text('TKT-1 · Delivery'), findsOneWidget);
      expect(find.text('Order SOM-1042'), findsOneWidget);
      expect(find.text('In progress'), findsOneWidget);
      expect(find.text('Resolved'), findsOneWidget);
      expect(find.text('Closed'), findsOneWidget);
      expect(find.text('Open'), findsWidgets);
      expect(find.descendant(of: find.byKey(const ValueKey('ticket-tile-t1')), matching: find.byType(CountBadge)), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('ticket-tile-t1')), matching: find.text('2')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('ticket-tile-t2')), matching: find.byType(CountBadge)), findsNothing);
      expect(SupportStore.instance.unread, 2);
    });

    testWidgets('an old ticket (no counters, category, order or photos) still renders', (tester) async {
      tickets();
      await open(tester, const SupportListScreen());
      expect(find.text('An old ticket'), findsOneWidget);
      expect(find.text('TKT-0 · General'), findsOneWidget);
    });

    testWidgets('French labels', (tester) async {
      tickets();
      await open(tester, const SupportListScreen(locale: Locale('fr')), lang: 'fr');
      expect(find.text('Assistance'), findsOneWidget);
      expect(find.text('En cours'), findsOneWidget);
      expect(find.text('Résolu'), findsOneWidget);
      expect(find.text('Fermé'), findsOneWidget);
      expect(find.text('TKT-1 · Livraison'), findsOneWidget);
      expect(find.text('Nouveau ticket'), findsOneWidget);
    });

    testWidgets('an empty list says so', (tester) async {
      server.handlers['support:list'] = (_) => const <dynamic>[];
      await open(tester, const SupportListScreen());
      expect(find.byKey(const ValueKey('ticket-empty')), findsOneWidget);
    });

    testWidgets('a failed load shows the error in place with a retry', (tester) async {
      var fail = true;
      server.handlers['support:list'] = (_) => fail ? throw serverError('Sign in to continue.') : [ticketJson('t1')];
      await open(tester, const SupportListScreen(), lang: 'fr');
      expect(find.text('Connectez-vous pour continuer.'), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
      fail = false;
      await tester.tap(find.text('Réessayer'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Where is my parcel?'), findsOneWidget);
    });

    testWidgets('a live update changes the badge, status and order of the list', (tester) async {
      tickets();
      await open(tester, const SupportListScreen());
      RealtimeStore.instance.debugEmit('support:updated', ticketJson('t4', subject: 'Cannot log in', reference: 'TKT-4', status: 'pending', userUnread: 1, category: 'account', updatedAt: '2026-10-25T10:00:00Z'));
      await tester.pump();
      expect(find.descendant(of: find.byKey(const ValueKey('ticket-tile-t4')), matching: find.byType(CountBadge)), findsOneWidget);
      expect(tester.getTopLeft(find.byKey(const ValueKey('ticket-tile-t4'))).dy, lessThan(tester.getTopLeft(find.byKey(const ValueKey('ticket-tile-t1'))).dy));
      expect(SupportStore.instance.unread, 3);
    });

    testWidgets('New ticket opens the form; list obeys the button rules', (tester) async {
      tickets();
      await open(tester, const SupportListScreen());
      expectButtonRules(tester);
      await tester.tap(find.text('New ticket'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(NewTicketScreen), findsOneWidget);
    });
  });

  group('ticket', () {
    TicketView withStaffReply({int unread = 1, String status = 'pending', String? orderId}) => ticket(ticketJson('t1', status: status, userUnread: unread, orderId: orderId, messages: [
          {'id': 'tm1', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': 'It has been a week.', 'at': '2026-10-24T09:30:00Z', 'attachments': <String>[]},
          _staffMessage,
        ]));

    testWidgets('shows both sides, photos as thumbnails, the category and the order', (tester) async {
      RealtimeStore.instance.orders.add(OrderDto.fromJson({'id': 'o1', 'reference': 'SOM-1042', 'customerName': 'A', 'status': 'shipped', 'paymentMethod': 'wallet', 'totalUsd': 5, 'items': []}));
      await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 0, orderId: 'o1')));
      expect(find.text('TKT-0001'), findsOneWidget);
      expect(find.text('Where is my parcel?'), findsOneWidget);
      expect(find.text('Category: Delivery · Order SOM-1042'), findsOneWidget);
      expect(find.text('It has been a week.'), findsOneWidget);
      expect(find.text('We are checking with the carrier.'), findsOneWidget);
      expect(find.text('Somba support'), findsOneWidget);
      expect(find.byKey(const ValueKey('ticket-photo-tm2-0')), findsOneWidget);
      final mine = tester.getCenter(find.text('It has been a week.')).dx;
      final theirs = tester.getCenter(find.text('We are checking with the carrier.')).dx;
      expect(mine, greaterThan(theirs));
    });

    testWidgets('an old ticket opens fine', (tester) async {
      await open(tester, SupportTicketDetailScreen(ticket: ticket(ticketJson('t0', legacy: true, reference: 'TKT-0', messages: [
            {'from': 'Aline', 'role': 'customer', 'text': 'Old hello'},
            {'from': 'Agent', 'role': 'admin', 'text': 'Old answer'},
          ]))));
      expect(find.text('Old hello'), findsOneWidget);
      expect(find.text('Old answer'), findsOneWidget);
      expect(find.text('Category: General'), findsOneWidget);
      expect(server.countOf('support:markRead'), 0, reason: 'nothing unread');
    });

    testWidgets('opening a ticket with unread replies marks it read', (tester) async {
      server.handlers['support:markRead'] = (_) => ticketJson('t1', userUnread: 0);
      await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 2)));
      expect(server.bodiesOf('support:markRead').first, {'id': 't1'});
      expect(SupportStore.instance.openTicketId, 't1');
    });

    testWidgets('the fresh copy from the server decides when the list was stale', (tester) async {
      server.handlers['support:get'] = (_) => ticketJson('t1', userUnread: 1);
      server.handlers['support:markRead'] = (_) => ticketJson('t1', userUnread: 0);
      await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 0)));
      expect(server.bodiesOf('support:get').single, {'id': 't1'});
      expect(server.bodiesOf('support:markRead').single, {'id': 't1'});
    });

    testWidgets('a staff reply that arrives while the ticket is open appears and is marked read', (tester) async {
      final both = [
        {'id': 'tm1', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': 'It has been a week.', 'at': '2026-10-24T09:30:00Z', 'attachments': <String>[]},
        _staffMessage,
      ];
      server.handlers['support:markRead'] = (_) => ticketJson('t1', status: 'pending', userUnread: 0, messages: both);
      await open(tester, SupportTicketDetailScreen(ticket: ticket(ticketJson('t1'))));
      expect(find.text('We are checking with the carrier.'), findsNothing);
      RealtimeStore.instance.debugEmit('support:updated', ticketJson('t1', status: 'pending', userUnread: 1, messages: both));
      await tester.pump();
      await tester.pump();
      expect(find.text('We are checking with the carrier.'), findsOneWidget);
      expect(find.text('In progress'), findsOneWidget);
      expect(server.bodiesOf('support:markRead').single, {'id': 't1'});
      expect(SupportStore.instance.unread, 0);
    });

    testWidgets('replying with text and photos sends one support:reply and confirms', (tester) async {
      fakePhotos(2);
      server.handlers['support:reply'] = (b) => ticketJson('t1', status: 'open', messages: [
            {'id': 'tm1', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': 'It has been a week.', 'at': '2026-10-24T09:30:00Z', 'attachments': <String>[]},
            {'id': 'tm3', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': b!['text'], 'at': '2026-10-24T11:00:00Z', 'attachments': b['attachments']},
          ]);
      await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 0)));
      await tester.enterText(find.byKey(const ValueKey('chat-input')), 'Here is the parcel photo');
      await attachPhotos(tester);
      await tester.tap(find.byKey(const ValueKey('chat-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(server.bodiesOf('support:reply').single, {
        'id': 't1',
        'text': 'Here is the parcel photo',
        'attachments': ['/uploads/photo-1.jpg', '/uploads/photo-2.jpg'],
      });
      expect(find.text('Reply sent.'), findsOneWidget);
      expect(find.text('Here is the parcel photo'), findsOneWidget);
      expect(find.byKey(const ValueKey('ticket-photo-tm3-0')), findsOneWidget);
    });

    testWidgets('a failed reply is announced in French and the text stays', (tester) async {
      server.handlers['support:reply'] = (_) => throw serverError('Ticket not found.');
      await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 0)), lang: 'fr');
      await tester.enterText(find.byKey(const ValueKey('chat-input')), 'Bonjour');
      await tester.tap(find.byKey(const ValueKey('chat-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Ticket introuvable.'), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const ValueKey('chat-input'))).controller!.text, 'Bonjour');
    });

    testWidgets('an empty reply is refused with a snackbar', (tester) async {
      await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 0)));
      await tester.tap(find.byKey(const ValueKey('chat-send')));
      await tester.pump();
      expect(find.text('Write a message first.'), findsOneWidget);
      expect(server.countOf('support:reply'), 0);
    });

    for (final status in ['resolved', 'closed']) {
      testWidgets('a $status ticket has no composer: a note and "Open a new ticket"', (tester) async {
        await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 0, status: status, orderId: 'o1')));
        expect(find.byKey(const ValueKey('chat-input')), findsNothing);
        expect(find.byKey(const ValueKey('ticket-closed-note')), findsOneWidget);
        expect(find.textContaining('This ticket is $status'), findsOneWidget);
        expect(find.text('Open a new ticket'), findsOneWidget);
        expectButtonRules(tester);
      });
    }

    testWidgets('"Open a new ticket" pre-links the same order and category', (tester) async {
      RealtimeStore.instance.orders.add(OrderDto.fromJson({'id': 'o1', 'reference': 'SOM-1042', 'customerName': 'A', 'status': 'shipped', 'paymentMethod': 'wallet', 'totalUsd': 5, 'items': []}));
      server.handlers['support:open'] = (b) => ticketJson('new', reference: 'TKT-NEW', category: b!['category'] as String, orderId: b['orderId'] as String?);
      await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 0, status: 'resolved', orderId: 'o1')));
      await tester.tap(find.byKey(const ValueKey('ticket-open-new')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byType(NewTicketScreen), findsOneWidget);
      expect(find.byType(SupportTicketDetailScreen), findsNothing);
      // the order is already chosen in the form
      expect(find.descendant(of: find.byKey(const ValueKey('ticket-order')), matching: find.text('SOM-1042')), findsOneWidget);
      await tester.enterText(find.descendant(of: find.byKey(const ValueKey('ticket-subject')), matching: find.byType(TextField)), 'Still not here');
      await tester.enterText(find.descendant(of: find.byKey(const ValueKey('ticket-message')), matching: find.byType(TextField)), 'It is still missing');
      await tester.tap(find.text('Create ticket'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(server.bodiesOf('support:open').single, containsPair('orderId', 'o1'));
      expect(server.bodiesOf('support:open').single, containsPair('category', 'delivery'));
    });

    testWidgets('a closed ticket without an order opens a new ticket without one', (tester) async {
      await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 0, status: 'closed')));
      await tester.tap(find.byKey(const ValueKey('ticket-open-new')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.descendant(of: find.byKey(const ValueKey('ticket-order')), matching: find.text('No order')), findsOneWidget);
    });

    testWidgets('a ticket that gets resolved while open swaps the composer for the note', (tester) async {
      await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 0)));
      expect(find.byKey(const ValueKey('chat-input')), findsOneWidget);
      RealtimeStore.instance.debugEmit('support:updated', ticketJson('t1', status: 'resolved', messages: [
        {'id': 'tm1', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': 'It has been a week.', 'at': '2026-10-24T09:30:00Z', 'attachments': <String>[]},
        _staffMessage,
      ]));
      await tester.pump();
      expect(find.byKey(const ValueKey('chat-input')), findsNothing);
      expect(find.byKey(const ValueKey('ticket-closed-note')), findsOneWidget);
    });

    testWidgets('French: the closed note and the action', (tester) async {
      await open(tester, SupportTicketDetailScreen(ticket: withStaffReply(unread: 0, status: 'resolved')), lang: 'fr');
      expect(find.textContaining('Ce ticket est résolu'), findsOneWidget);
      expect(find.text('Ouvrir un nouveau ticket'), findsOneWidget);
      expect(find.text('Assistance Somba'), findsOneWidget);
    });
  });

  group('new ticket', () {
    Finder field(String key) => find.descendant(of: find.byKey(ValueKey(key)), matching: find.byType(TextField));

    void opened() => server.handlers['support:open'] = (b) => ticketJson('new', reference: 'TKT-77', subject: b!['subject'] as String, category: b['category'] as String, orderId: b['orderId'] as String?);

    testWidgets('sends category, subject, message, order and photos; confirms; closes', (tester) async {
      fakePhotos(2);
      opened();
      RealtimeStore.instance.orders.addAll([
        OrderDto.fromJson({'id': 'o1', 'reference': 'SOM-1042', 'customerName': 'A', 'status': 'delivered', 'paymentMethod': 'wallet', 'totalUsd': 5, 'items': []}),
        OrderDto.fromJson({'id': 'o2', 'reference': 'SOM-1043', 'customerName': 'A', 'status': 'delivered', 'paymentMethod': 'wallet', 'totalUsd': 5, 'items': []}),
      ]);
      await open(tester, Builder(builder: (context) => TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute<TicketView>(builder: (_) => const NewTicketScreen())), child: const Text('go'))));
      await tester.tap(find.text('go'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.tap(find.byKey(const ValueKey('ticket-cat-payment')));
      await tester.pump();
      await tester.enterText(field('ticket-subject'), 'Charged twice');
      await tester.enterText(field('ticket-message'), 'I was charged two times for SOM-1043.');
      await tester.tap(find.byKey(const ValueKey('ticket-order')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('SOM-1043').last);
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('photo-add')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('photo-library')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Create ticket'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(server.bodiesOf('support:open').single, {
        'subject': 'Charged twice',
        'message': 'I was charged two times for SOM-1043.',
        'category': 'payment',
        'orderId': 'o2',
        'attachments': ['/uploads/photo-1.jpg', '/uploads/photo-2.jpg'],
      });
      expect(find.text('Ticket TKT-77 created. We will reply here.'), findsOneWidget);
      await tester.pump(const Duration(milliseconds: 600));
      expect(find.byType(NewTicketScreen), findsNothing);
      expect(SupportStore.instance.byId('new'), isNotNull);
    });

    testWidgets('without an order or photos, the default category is "other"', (tester) async {
      opened();
      await open(tester, const NewTicketScreen());
      await tester.enterText(field('ticket-subject'), 'Hello');
      await tester.enterText(field('ticket-message'), 'I have a question');
      await tester.tap(find.text('Create ticket'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(server.bodiesOf('support:open').single, {'subject': 'Hello', 'message': 'I have a question', 'category': 'other'});
    });

    testWidgets('missing subject and message: inline errors plus a snackbar, nothing sent', (tester) async {
      opened();
      await open(tester, const NewTicketScreen());
      await tester.tap(find.text('Create ticket'));
      await tester.pump();
      expect(find.text('Enter a subject.'), findsOneWidget);
      expect(find.text('Describe your problem.'), findsOneWidget);
      expect(find.text('Check the highlighted fields.'), findsOneWidget);
      expect(server.countOf('support:open'), 0);
      // typing clears the error
      await tester.enterText(field('ticket-subject'), 'x');
      await tester.pump();
      expect(find.text('Enter a subject.'), findsNothing);
    });

    testWidgets('a refused ticket is announced in French; the form stays', (tester) async {
      server.handlers['support:open'] = (_) => throw serverError('Subject and message are required.');
      await open(tester, const NewTicketScreen(), lang: 'fr');
      await tester.enterText(field('ticket-subject'), 'Objet');
      await tester.enterText(field('ticket-message'), 'Message');
      await tester.tap(find.text('Créer le ticket'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('L’objet et le message sont obligatoires.'), findsOneWidget);
      expect(find.text('Créer le ticket'), findsOneWidget);
      expect(find.byType(NewTicketScreen), findsOneWidget);
    });

    testWidgets('a photo still uploading blocks the submit', (tester) async {
      fakePhotos(1);
      final gate = Completer<String>();
      UploadService.debugUpload = (bytes, name) => gate.future;
      opened();
      await open(tester, const NewTicketScreen());
      await tester.enterText(field('ticket-subject'), 'Hello');
      await tester.enterText(field('ticket-message'), 'Question');
      await tester.tap(find.byKey(const ValueKey('photo-add')));
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      await tester.tap(find.byKey(const ValueKey('photo-library')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(find.text('Create ticket'));
      await tester.pump();
      expect(find.text('Wait for the photos to finish uploading.'), findsOneWidget);
      expect(server.countOf('support:open'), 0);
      gate.complete('/uploads/late.jpg');
      await tester.pump();
    });

    testWidgets('obeys the button rules and lists the six categories in French', (tester) async {
      await open(tester, const NewTicketScreen(), lang: 'fr');
      expectButtonRules(tester);
      for (final label in ['Une commande', 'Paiement ou remboursement', 'Livraison', 'Retour ou échange', 'Mon compte', 'Autre chose']) {
        expect(find.text(label), findsOneWidget);
      }
      expect(kTicketCategories, hasLength(6));
    });
  });
}
