// Support tickets: parsing (old tickets too), the store (list, open, reply, unread, live updates) and the feature hook.
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/services/feature_hooks.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/support_store.dart';

import 'social_helpers.dart';

void main() {
  setUpAll(() => initializeDateFormatting());
  late FakeServer server;
  setUp(() async => server = await socialReset());
  tearDown(socialTearDown);

  group('parsing', () {
    test('a current ticket: counters, category, order link, messages with photos', () {
      final t = TicketView.fromJson(ticketJson('t1', userUnread: 2, category: 'payment', orderId: 'o1', status: 'pending', messages: [
        {'id': 'a', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': 'Hi', 'at': '2026-10-24T09:30:00Z', 'attachments': ['/uploads/x.jpg']},
        {'id': 'b', 'from': 'Agent', 'fromId': 'ad1', 'role': 'admin_support', 'text': 'Hello', 'at': '2026-10-24T10:00:00Z', 'attachments': <String>[]},
      ]));
      expect(t.userUnread, 2);
      expect(t.category, 'payment');
      expect(t.orderId, 'o1');
      expect(t.status, 'pending');
      expect(t.messages, hasLength(2));
      expect(t.messages.first.attachments, ['/uploads/x.jpg']);
      expect(t.messages.first.fromStaff, isFalse);
      expect(t.messages.last.fromStaff, isTrue);
      expect(t.messages.last.at, isNotNull);
      expect(t.isClosed, isFalse);
    });

    test('an OLD ticket: messages as a JSON string, no counters, no category, no order, no attachments', () {
      final t = TicketView.fromJson({
        'id': 't0',
        'reference': 'TKT-1',
        'subject': 'Old question',
        'status': 'open',
        'messages': jsonEncode([
          {'from': 'Aline', 'role': 'customer', 'text': 'Hello'},
          {'from': 'Agent', 'role': 'admin', 'text': 'Hi'},
        ]),
      });
      expect(t.userUnread, 0);
      expect(t.category, 'general');
      expect(t.orderId, isNull);
      expect(t.messages, hasLength(2));
      expect(t.messages.first.attachments, isEmpty);
      expect(t.messages.first.id, '');
      expect(t.messages.first.at, isNull);
      expect(t.messages.last.fromStaff, isTrue);
    });

    test('messages already decoded into a list are accepted', () {
      final t = TicketView.fromJson({
        'id': 't1',
        'messages': [
          {'id': 'a', 'role': 'customer', 'text': 'Hi'}
        ],
      });
      expect(t.messages.single.text, 'Hi');
    });

    test('broken or missing messages give an empty conversation, never a crash', () {
      expect(TicketView.fromJson({'id': 't', 'messages': '{not json'}).messages, isEmpty);
      expect(TicketView.fromJson({'id': 't', 'messages': ''}).messages, isEmpty);
      expect(TicketView.fromJson({'id': 't'}).messages, isEmpty);
      expect(TicketView.fromJson({'id': 't', 'messages': 42}).messages, isEmpty);
      expect(TicketView.fromJson({'id': 't', 'messages': '[1, "x", {"text":"ok"}]'}).messages.single.text, 'ok');
    });

    test('empty status and category fall back to open / general; counters may arrive as strings', () {
      final t = TicketView.fromJson({'id': 't', 'status': '', 'category': '', 'userUnread': '3', 'orderId': ''});
      expect(t.status, 'open');
      expect(t.category, 'general');
      expect(t.userUnread, 3);
      expect(t.orderId, isNull);
    });

    test('resolved and closed tickets take no replies', () {
      expect(TicketView.fromJson({'id': 't', 'status': 'resolved'}).isClosed, isTrue);
      expect(TicketView.fromJson({'id': 't', 'status': 'closed'}).isClosed, isTrue);
      expect(TicketView.fromJson({'id': 't', 'status': 'pending'}).isClosed, isFalse);
    });
  });

  group('the store', () {
    test('load keeps the most recently updated first and totals the unread replies', () async {
      server.handlers['support:list'] = (_) => [
            ticketJson('old', userUnread: 1, updatedAt: '2026-10-01T09:00:00Z'),
            ticketJson('new', userUnread: 2, updatedAt: '2026-10-20T09:00:00Z'),
            ticketJson('legacy', legacy: true, updatedAt: '2026-10-10T09:00:00Z'),
          ];
      await SupportStore.instance.load();
      expect(SupportStore.instance.tickets.map((t) => t.id), ['new', 'legacy', 'old']);
      expect(SupportStore.instance.unread, 3);
      expect(SupportStore.instance.loaded, isTrue);
    });

    test('open sends the category, the order and the photos, and adds the ticket', () async {
      server.handlers['support:open'] = (b) => ticketJson('new', reference: 'TKT-9', subject: b!['subject'] as String, category: b['category'] as String, orderId: b['orderId'] as String?);
      final t = await SupportStore.instance.open(subject: 'Late parcel', message: 'It is late', category: 'delivery', orderId: 'o1', attachments: ['/uploads/a.jpg']);
      expect(server.bodiesOf('support:open').single, {
        'subject': 'Late parcel',
        'message': 'It is late',
        'category': 'delivery',
        'orderId': 'o1',
        'attachments': ['/uploads/a.jpg'],
      });
      expect(t.reference, 'TKT-9');
      expect(SupportStore.instance.byId('new'), isNotNull);
    });

    test('open leaves out the order and the photos it was not given', () async {
      server.handlers['support:open'] = (b) => ticketJson('new');
      await SupportStore.instance.open(subject: 'Hi', message: 'Hello');
      expect(server.bodiesOf('support:open').single, {'subject': 'Hi', 'message': 'Hello', 'category': 'other'});
    });

    test('reply sends the text and / or the photos', () async {
      server.handlers['support:reply'] = (b) => ticketJson('t1');
      await SupportStore.instance.reply('t1', text: 'Thanks', attachments: ['/uploads/a.jpg']);
      await SupportStore.instance.reply('t1', attachments: ['/uploads/b.jpg']);
      await SupportStore.instance.reply('t1', text: 'Only words');
      final bodies = server.bodiesOf('support:reply').toList();
      expect(bodies[0], {'id': 't1', 'text': 'Thanks', 'attachments': ['/uploads/a.jpg']});
      expect(bodies[1], {'id': 't1', 'attachments': ['/uploads/b.jpg']});
      expect(bodies[2], {'id': 't1', 'text': 'Only words'});
    });

    test('markRead zeroes the count here and calls the server with the ticket id', () async {
      server.handlers['support:list'] = (_) => [ticketJson('t1', userUnread: 2)];
      server.handlers['support:markRead'] = (_) => ticketJson('t1', userUnread: 0);
      await SupportStore.instance.load();
      expect(SupportStore.instance.unread, 2);
      await SupportStore.instance.markRead('t1');
      expect(server.bodiesOf('support:markRead').single, {'id': 't1'});
      expect(SupportStore.instance.unread, 0);
    });

    test('a failing markRead is silent', () async {
      server.handlers['support:markRead'] = (_) => throw serverError('Ticket not found.');
      await SupportStore.instance.markRead('t1');
    });

    test('fetch returns the fresh ticket, and the kept one when the server fails or answers oddly', () async {
      server.handlers['support:list'] = (_) => [ticketJson('t1', subject: 'Kept')];
      await SupportStore.instance.load();
      server.handlers['support:get'] = (_) => ticketJson('t1', subject: 'Fresh');
      expect((await SupportStore.instance.fetch('t1'))!.subject, 'Fresh');
      server.handlers['support:get'] = (_) => throw serverError('Ticket not found.');
      expect((await SupportStore.instance.fetch('t1'))!.subject, 'Fresh');
      server.handlers['support:get'] = (_) => const <dynamic>[];
      expect((await SupportStore.instance.fetch('t1'))!.subject, 'Fresh');
      expect(await SupportStore.instance.fetch('zzz'), isNull);
    });

    test('support:updated adds a ticket and replaces a known one', () async {
      RealtimeStore.instance.debugEmit('support:updated', ticketJson('t1', userUnread: 1));
      expect(SupportStore.instance.tickets.single.userUnread, 1);
      expect(SupportStore.instance.unread, 1);
      RealtimeStore.instance.debugEmit('support:updated', ticketJson('t1', userUnread: 0, status: 'resolved'));
      expect(SupportStore.instance.tickets.single.status, 'resolved');
      expect(SupportStore.instance.unread, 0);
      RealtimeStore.instance.debugEmit('support:updated', 'garbage');
      RealtimeStore.instance.debugEmit('support:updated', {'noid': true});
      expect(SupportStore.instance.tickets, hasLength(1));
    });

    test('a staff reply for the ticket on screen is marked read at once', () async {
      SupportStore.instance.openTicketId = 't1';
      server.handlers['support:markRead'] = (_) => ticketJson('t1', userUnread: 0);
      RealtimeStore.instance.debugEmit('support:updated', ticketJson('t1', userUnread: 1));
      await Future<void>.delayed(Duration.zero);
      expect(server.bodiesOf('support:markRead').single, {'id': 't1'});
      expect(SupportStore.instance.unread, 0);
    });

    test('a staff reply for another ticket stays unread', () async {
      SupportStore.instance.openTicketId = 't1';
      RealtimeStore.instance.debugEmit('support:updated', ticketJson('t2', userUnread: 1));
      expect(server.countOf('support:markRead'), 0);
      expect(SupportStore.instance.unread, 1);
    });
  });

  group('feature hook', () {
    test('the support hook is registered, binds support:updated, hydrates and resets', () async {
      final hook = buildFeatureHooks().firstWhere((h) => h.name == 'support');
      expect(hook.pushes.keys, contains('support:updated'));
      server.handlers['support:list'] = (_) => [ticketJson('t1', userUnread: 1)];
      await hook.hydrate!(RealtimeStore.instance);
      expect(SupportStore.instance.tickets, hasLength(1));
      hook.reset!();
      expect(SupportStore.instance.tickets, isEmpty);
      expect(SupportStore.instance.loaded, isFalse);
    });
  });
}
