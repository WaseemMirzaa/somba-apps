// Customer <-> seller chat: parsing (incl. missing fields), the store (unread, paging, live pushes), the feature hook and
// the French server errors of the chat contract.
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/services/chat_store.dart';
import 'package:lipcart/services/feature_hooks.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'social_helpers.dart';

void main() {
  setUpAll(() => initializeDateFormatting());
  late FakeServer server;
  setUp(() async => server = await socialReset());
  tearDown(socialTearDown);

  group('parsing', () {
    test('a full conversation', () {
      final c = ChatConversation.fromJson(convJson(id: 'c9', unread: 3, productId: 'p1', productName: 'Shoes', productImage: '/uploads/x.jpg', orderId: 'o1', orderReference: 'SOM-1'));
      expect(c.id, 'c9');
      expect(c.side, 'buyer');
      expect(c.storeName, 'Mama Tech');
      expect(c.unread, 3);
      expect(c.productName, 'Shoes');
      expect(c.orderReference, 'SOM-1');
      expect(c.lastMessageAt, isNotNull);
      expect(c.hasContext, isTrue);
    });

    test('the product is named in the reader\'s language, falling back to the other one', () {
      final both = ChatConversation.fromJson(convJson(productId: 'p1', productName: 'Running shoes', productNameFr: 'Baskets de running'));
      expect(both.displayProductName('en'), 'Running shoes');
      expect(both.displayProductName('fr'), 'Baskets de running');
      final englishOnly = ChatConversation.fromJson(convJson(productId: 'p1', productName: 'Running shoes'));
      expect(englishOnly.displayProductName('fr'), 'Running shoes', reason: 'an older server sends no French name');
      final frenchOnly = ChatConversation.fromJson(convJson(productId: 'p1', productNameFr: 'Baskets de running'));
      expect(frenchOnly.displayProductName('en'), 'Baskets de running');
      expect(ChatConversation.fromJson(convJson()).displayProductName('fr'), isNull, reason: 'no product, no name');
    });

    test('a bare conversation (every optional field missing) still parses', () {
      final c = ChatConversation.fromJson({'id': 'c1'});
      expect(c.storeName, '');
      expect(c.storeLogo, isNull);
      expect(c.productId, isNull);
      expect(c.orderId, isNull);
      expect(c.lastMessageAt, isNull);
      expect(c.lastMessagePreview, '');
      expect(c.unread, 0);
      expect(c.side, 'buyer');
      expect(c.hasContext, isFalse);
    });

    test('empty strings and wrong types are treated as missing', () {
      final c = ChatConversation.fromJson({'id': 'c1', 'productId': '', 'orderId': '', 'unread': '4', 'lastMessageAt': 'not a date', 'storeLogo': ''});
      expect(c.productId, isNull);
      expect(c.orderId, isNull);
      expect(c.storeLogo, isNull);
      expect(c.unread, 4);
      expect(c.lastMessageAt, isNull);
    });

    test('a message: sides, photos, dates', () {
      final m = ChatMessage.fromJson(msgJson('m1', side: 'buyer', attachments: ['/uploads/a.jpg', '/uploads/b.jpg']));
      expect(m.mine, isTrue);
      expect(m.attachments, hasLength(2));
      expect(m.createdAt, isNotNull);
      final other = ChatMessage.fromJson(msgJson('m2'));
      expect(other.mine, isFalse);
    });

    test('a message without attachments, sender or date', () {
      final m = ChatMessage.fromJson({'id': 'm1', 'text': 'Hi'});
      expect(m.attachments, isEmpty);
      expect(m.senderName, '');
      expect(m.createdAt, isNull);
      expect(m.mine, isTrue, reason: 'no senderSide: treated as the customer');
      expect(ChatMessage.fromJson({'id': 'm3', 'attachments': 'oops'}).attachments, isEmpty);
    });

    test('a page of messages', () {
      final p = ChatPage.fromJson({
        'conversation': convJson(unread: 2),
        'messages': [msgJson('m1'), msgJson('m2', side: 'buyer')],
        'hasMore': true,
      });
      expect(p.messages.map((m) => m.id), ['m1', 'm2']);
      expect(p.hasMore, isTrue);
      expect(p.conversation!.unread, 2);
      final empty = ChatPage.fromJson({});
      expect(empty.messages, isEmpty);
      expect(empty.hasMore, isFalse);
      expect(empty.conversation, isNull);
    });

    test('which thread a message from a product or an order belongs to', () {
      final general = ChatConversation.fromJson(convJson(id: 'g'));
      final product = ChatConversation.fromJson(convJson(id: 'p', productId: 'p1'));
      final order = ChatConversation.fromJson(convJson(id: 'o', orderId: 'o1', productId: 'p1'));
      expect(general.coversContext(sellerId: 's1'), isTrue);
      expect(general.coversContext(sellerId: 's1', productId: 'p1'), isFalse);
      expect(product.coversContext(sellerId: 's1', productId: 'p1'), isTrue);
      expect(product.coversContext(sellerId: 's1', productId: 'p2'), isFalse);
      expect(product.coversContext(sellerId: 's2', productId: 'p1'), isFalse, reason: 'another store');
      expect(order.coversContext(sellerId: 's1', orderId: 'o1'), isTrue);
      expect(order.coversContext(sellerId: 's1', orderId: 'o1', productId: 'p9'), isTrue, reason: 'an order wins over a product');
      expect(order.coversContext(sellerId: 's1', productId: 'p1'), isFalse, reason: 'a product-only start never reuses an order thread');
    });
  });

  group('the store', () {
    test('loadConversations asks for the buyer side, a page at a time, newest first', () async {
      server.handlers['chat:list'] = (b) => [
            convJson(id: 'old', at: '2026-10-20T08:00:00Z'),
            convJson(id: 'new', at: '2026-10-24T08:00:00Z'),
            {...convJson(id: 'seller-side', side: 'seller')},
          ];
      await ChatStore.instance.loadConversations();
      expect(server.bodiesOf('chat:list').single, {'as': 'buyer', 'limit': ChatStore.pageSize, 'offset': 0});
      expect(ChatStore.instance.conversations.map((c) => c.id), ['new', 'old'], reason: 'the store-side thread is not for the customer app');
      expect(ChatStore.instance.loaded, isTrue);
      expect(ChatStore.instance.hasMoreConversations, isFalse);
    });

    test('a full page offers more, and the next page continues at the right offset', () async {
      server.handlers['chat:list'] = (b) {
        final offset = b!['offset'] as int;
        return [for (var i = 0; i < ChatStore.pageSize; i++) convJson(id: 'c${offset + i}', at: DateTime(2026, 10, 24).subtract(Duration(minutes: offset + i)).toUtc().toIso8601String())];
      };
      await ChatStore.instance.loadConversations();
      expect(ChatStore.instance.hasMoreConversations, isTrue);
      await ChatStore.instance.loadConversations(more: true);
      expect(server.bodiesOf('chat:list').last!['offset'], ChatStore.pageSize);
      expect(ChatStore.instance.conversations, hasLength(ChatStore.pageSize * 2));
    });

    test('refreshUnread reads the buyer total', () async {
      server.handlers['chat:unread'] = (_) => {'total': 7, 'buyer': 4, 'seller': 3};
      await ChatStore.instance.refreshUnread();
      expect(ChatStore.instance.unread, 4);
    });

    test('a live message raises the unread count, updates the preview and moves the thread to the top', () async {
      server.handlers['chat:list'] = (_) => [convJson(id: 'a', at: '2026-10-24T08:00:00Z', unread: 1), convJson(id: 'b', at: '2026-10-23T08:00:00Z')];
      server.handlers['chat:unread'] = (_) => {'total': 1, 'buyer': 1, 'seller': 0};
      await ChatStore.instance.refresh();
      expect(ChatStore.instance.unread, 1);

      RealtimeStore.instance.debugEmit('chat:message', {
        'conversation': convJson(id: 'b', unread: 1, preview: 'We have it in blue', at: '2026-10-24T10:00:00Z'),
        'message': msgJson('m9', convId: 'b', text: 'We have it in blue'),
      });
      final c = ChatStore.instance;
      expect(c.unread, 2);
      expect(c.conversations.first.id, 'b');
      expect(c.conversations.first.lastMessagePreview, 'We have it in blue');
      expect(c.conversations.first.unread, 1);
    });

    test('a message in a thread the phone does not know yet adds it and re-reads the total from the server', () async {
      server.handlers['chat:unread'] = (_) => {'total': 1, 'buyer': 1, 'seller': 0};
      RealtimeStore.instance.debugEmit('chat:message', {
        'conversation': convJson(id: 'new', unread: 1),
        'message': msgJson('m1', convId: 'new'),
      });
      await Future<void>.delayed(Duration.zero);
      expect(ChatStore.instance.conversations.single.id, 'new');
      expect(ChatStore.instance.unread, 1);
      expect(server.countOf('chat:unread'), 1);
    });

    test('chat:read from the customer side clears that thread; the store reading is ignored', () async {
      server.handlers['chat:list'] = (_) => [convJson(id: 'a', unread: 3)];
      server.handlers['chat:unread'] = (_) => {'total': 3, 'buyer': 3, 'seller': 0};
      await ChatStore.instance.refresh();
      RealtimeStore.instance.debugEmit('chat:read', {'conversationId': 'a', 'side': 'seller', 'readBy': 'staff'});
      expect(ChatStore.instance.unread, 3);
      RealtimeStore.instance.debugEmit('chat:read', {'conversationId': 'a', 'side': 'buyer', 'readBy': 'u1'});
      expect(ChatStore.instance.unread, 0);
      expect(ChatStore.instance.conversations.single.unread, 0);
    });

    test('a thread the store sees as its own (side seller) never shows in the customer app', () {
      RealtimeStore.instance.debugEmit('chat:message', {'conversation': convJson(id: 'x', side: 'seller', unread: 5), 'message': msgJson('m1', convId: 'x')});
      expect(ChatStore.instance.conversations, isEmpty);
      expect(ChatStore.instance.unread, 0);
    });

    test('garbage pushes are ignored', () {
      RealtimeStore.instance.debugEmit('chat:message', 'nope');
      RealtimeStore.instance.debugEmit('chat:message', {'conversation': 3});
      RealtimeStore.instance.debugEmit('chat:read', null);
      expect(ChatStore.instance.conversations, isEmpty);
    });

    test('markRead zeroes the count here and calls the server', () async {
      server.handlers['chat:list'] = (_) => [convJson(id: 'a', unread: 2), convJson(id: 'b', unread: 1, at: '2026-10-23T08:00:00Z')];
      server.handlers['chat:unread'] = (_) => {'total': 3, 'buyer': 3, 'seller': 0};
      await ChatStore.instance.refresh();
      await ChatStore.instance.markRead('a');
      expect(ChatStore.instance.unread, 1);
      expect(server.bodiesOf('chat:markRead').single, {'conversationId': 'a'});
    });

    test('a failing markRead is silent (a background call)', () async {
      server.handlers['chat:markRead'] = (_) => throw serverError('Conversation not found.');
      await ChatStore.instance.markRead('a');
    });

    test('start sends the context and the photos; the new thread joins the inbox', () async {
      server.handlers['chat:start'] = (b) => {
            'conversation': convJson(id: 'new', productId: 'p1', productName: 'Shoes', preview: b!['text'] as String),
            'message': msgJson('m1', convId: 'new', side: 'buyer', text: b['text'] as String),
          };
      final r = await ChatStore.instance.start(sellerId: 's1', productId: 'p1', text: 'Is it waterproof?', attachments: ['/uploads/a.jpg']);
      expect(server.bodiesOf('chat:start').single, {'sellerId': 's1', 'productId': 'p1', 'text': 'Is it waterproof?', 'attachments': ['/uploads/a.jpg']});
      expect(r.conversation.id, 'new');
      expect(r.message.mine, isTrue);
      expect(ChatStore.instance.existingFor(sellerId: 's1', productId: 'p1')!.id, 'new');
      expect(ChatStore.instance.unread, 0);
    });

    test('start leaves out the context and photos it was not given', () async {
      server.handlers['chat:start'] = (b) => {'conversation': convJson(id: 'g'), 'message': msgJson('m1', convId: 'g', side: 'buyer')};
      await ChatStore.instance.start(sellerId: 's1', text: 'Hi');
      expect(server.bodiesOf('chat:start').single, {'sellerId': 's1', 'text': 'Hi'});
    });

    test('send carries the text and photos and refreshes the row', () async {
      server.handlers['chat:list'] = (_) => [convJson(id: 'a', preview: 'old')];
      await ChatStore.instance.loadConversations();
      server.handlers['chat:send'] = (b) => {'message': msgJson('m5', convId: 'a', side: 'buyer', text: b!['text'] as String)};
      await ChatStore.instance.send('a', text: 'Thanks', attachments: ['/uploads/a.jpg', '/uploads/b.jpg']);
      expect(server.bodiesOf('chat:send').single, {'conversationId': 'a', 'text': 'Thanks', 'attachments': ['/uploads/a.jpg', '/uploads/b.jpg']});
      expect(ChatStore.instance.conversations.single.lastMessagePreview, 'Thanks');
    });

    test('conversationById finds it in the inbox, else asks the server, else null', () async {
      server.handlers['chat:list'] = (_) => [convJson(id: 'a')];
      await ChatStore.instance.loadConversations();
      expect((await ChatStore.instance.conversationById('a'))!.id, 'a');
      server.handlers['chat:messages'] = (b) => b!['conversationId'] == 'z' ? {'conversation': convJson(id: 'z'), 'messages': [], 'hasMore': false} : throw serverError('Conversation not found.');
      expect((await ChatStore.instance.conversationById('z'))!.id, 'z');
      expect(await ChatStore.instance.conversationById('nope'), isNull);
    });
  });

  group('feature hook', () {
    test('the chat hook is registered, binds both pushes, hydrates and resets', () async {
      final hook = buildFeatureHooks().firstWhere((h) => h.name == 'chat');
      expect(hook.pushes.keys, containsAll(['chat:message', 'chat:read']));
      server.handlers['chat:list'] = (_) => [convJson(id: 'a', unread: 2)];
      server.handlers['chat:unread'] = (_) => {'total': 2, 'buyer': 2, 'seller': 0};
      await hook.hydrate!(RealtimeStore.instance);
      expect(ChatStore.instance.conversations, hasLength(1));
      expect(ChatStore.instance.unread, 2);
      hook.reset!();
      expect(ChatStore.instance.conversations, isEmpty);
      expect(ChatStore.instance.unread, 0);
      expect(ChatStore.instance.loaded, isFalse);
    });
  });

  group('French server errors of the chat contract', () {
    const fr = Strings('fr');
    const contract = [
      'Only shoppers can message a store.',
      'Store not found.',
      'You cannot message your own store.',
      'Write a message first.',
      'A message can have up to 2000 characters.',
      'That product does not belong to this store.',
      'Order not found.',
      'That order has nothing from this store.',
      'You are opening too many conversations. Try again later.',
      'You are sending messages too fast. Wait a moment.',
      'Conversation not found.',
      'Attach up to 4 photos.',
      'Attachment must be an image uploaded through the platform.',
      'Your store is suspended: you can read messages but not reply.',
      'Nothing to translate.',
      // sent by the API though not listed in the contract
      'Message not found.',
      'Attachment is not a valid image.',
      'Translation is not available right now. Try again later.',
      // support tickets with photos
      'Subject and message are required.',
      'Ticket not found.',
      'Photos must be a list of uploaded images.',
      'Photos must be images uploaded through the app.',
      'You can attach up to 6 photos.',
      // notification preferences
      'notify must be an object of true/false switches.',
      'Unknown notification kind: nonsense.',
      'order must be true or false.',
    ];

    for (final e in contract) {
      test('"$e" is shown in French', () {
        final out = translateServerError(e, fr);
        expect(out, isNot(e));
        expect(out, isNotEmpty);
      });
    }

    test('names inside messages are kept', () {
      expect(translateServerError('Unknown notification kind: nonsense.', fr), contains('nonsense'));
    });

    test('English stays as the server wrote it', () {
      expect(translateServerError('You are sending messages too fast. Wait a moment.', const Strings('en')), 'You are sending messages too fast. Wait a moment.');
    });
  });
}
