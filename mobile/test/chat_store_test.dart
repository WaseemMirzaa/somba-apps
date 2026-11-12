// Old customer <-> store chats (messaging is closed): parsing (incl. missing fields), the read-only store (inbox paging, thread
// pages, nothing to send), the feature hook and the French server errors of the chat contract, incl. "messaging is closed".
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

    test('the store is read-only: nothing in it can send, start, mark read or count unread', () {
      // The API of the store is the reads only; a message cannot be written from the app any more.
      final store = ChatStore.instance;
      expect(() => (store as dynamic).send('a', text: 'x'), throwsA(isA<NoSuchMethodError>()));
      expect(() => (store as dynamic).start(sellerId: 's1', text: 'x'), throwsA(isA<NoSuchMethodError>()));
      expect(() => (store as dynamic).markRead('a'), throwsA(isA<NoSuchMethodError>()));
      expect(() => (store as dynamic).unread, throwsA(isA<NoSuchMethodError>()));
    });

    test('a live chat push changes nothing (nothing is bound to it)', () async {
      server.handlers['chat:list'] = (_) => [convJson(id: 'a')];
      await ChatStore.instance.loadConversations();
      RealtimeStore.instance.debugEmit('chat:message', {'conversation': convJson(id: 'a', unread: 1, preview: 'New'), 'message': msgJson('m1', convId: 'a')});
      expect(ChatStore.instance.conversations.single.lastMessagePreview, isNot('New'));
    });

    test('messages() reads one page of a thread, oldest first, with the cursor', () async {
      server.handlers['chat:messages'] = (b) => {'conversation': convJson(id: 'a'), 'messages': [msgJson('m1'), msgJson('m2')], 'hasMore': true};
      final page = await ChatStore.instance.messages('a', before: 'm9', limit: 2);
      expect(server.bodiesOf('chat:messages').single, {'conversationId': 'a', 'before': 'm9', 'limit': 2});
      expect(page.messages.map((m) => m.id), ['m1', 'm2']);
      expect(page.hasMore, isTrue);
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
    test('the chat hook is registered, binds no pushes, hydrates nothing and resets on sign-out', () async {
      final hook = buildFeatureHooks().firstWhere((h) => h.name == 'chat');
      expect(hook.pushes, isEmpty);
      expect(hook.hydrate, isNull);
      server.handlers['chat:list'] = (_) => [convJson(id: 'a')];
      await ChatStore.instance.loadConversations();
      hook.reset!();
      expect(ChatStore.instance.conversations, isEmpty);
      expect(ChatStore.instance.loaded, isFalse);
    });
  });

  group('French server errors of the chat contract', () {
    const fr = Strings('fr');
    const contract = [
      'Messaging sellers is closed. Contact support from your account.',
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
