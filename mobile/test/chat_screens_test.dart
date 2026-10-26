// Customer <-> seller chat on screen: inbox (unread badges, live), thread (paging, sending with photos, translate,
// read-only store), compose (start from a product), the "Message the seller" button, notice routing and the account badge.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/account_screen.dart';
import 'package:lipcart/screens/more/chat_compose.dart';
import 'package:lipcart/screens/more/chat_entry.dart';
import 'package:lipcart/screens/more/chat_inbox.dart';
import 'package:lipcart/screens/more/chat_thread.dart';
import 'package:lipcart/screens/more/chat_widgets.dart';
import 'package:lipcart/screens/notice_router.dart';
import 'package:lipcart/services/chat_store.dart';
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

ChatConversation conv(Map<String, dynamic> j) => ChatConversation.fromJson(j);

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  late FakeServer server;
  setUp(() async => server = await socialReset());
  tearDown(socialTearDown);

  group('inbox', () {
    void twoThreads() => server.handlers['chat:list'] = (_) => [
          convJson(id: 'a', unread: 2, productId: 'p1', productName: 'Running shoes', preview: 'It is in stock', at: '2026-10-24T09:30:00Z'),
          convJson(id: 'b', storeName: 'Kin Tech', orderId: 'o1', orderReference: 'SOM-1042', preview: 'Your parcel left today', at: '2026-10-20T09:30:00Z'),
        ];

    testWidgets('lists the threads with store, context, last message and unread badge', (tester) async {
      twoThreads();
      await open(tester, const ChatInboxScreen());
      expect(find.text('My messages'), findsOneWidget);
      expect(find.text('Mama Tech'), findsOneWidget);
      expect(find.text('Kin Tech'), findsOneWidget);
      expect(find.text('About: Running shoes'), findsOneWidget);
      expect(find.text('Order SOM-1042'), findsOneWidget);
      expect(find.text('It is in stock'), findsOneWidget);
      expect(find.text('Your parcel left today'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('chat-tile-a')), matching: find.byType(CountBadge)), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('chat-tile-b')), matching: find.byType(CountBadge)), findsNothing);
      expect(server.bodiesOf('chat:list').first, {'as': 'buyer', 'limit': ChatStore.pageSize, 'offset': 0});
      // the first thread is the more recent one
      expect(tester.getTopLeft(find.byKey(const ValueKey('chat-tile-a'))).dy, lessThan(tester.getTopLeft(find.byKey(const ValueKey('chat-tile-b'))).dy));
    });

    testWidgets('a live message raises the badge and the preview; chat:read clears it', (tester) async {
      twoThreads();
      server.handlers['chat:unread'] = (_) => {'total': 2, 'buyer': 2, 'seller': 0};
      await ChatStore.instance.refreshUnread(); // the hydrate after sign-in does this
      await open(tester, const ChatInboxScreen());
      RealtimeStore.instance.debugEmit('chat:message', {
        'conversation': convJson(id: 'b', storeName: 'Kin Tech', orderId: 'o1', orderReference: 'SOM-1042', unread: 1, preview: 'Delivered, enjoy', at: '2026-10-24T11:00:00Z'),
        'message': msgJson('m9', convId: 'b', text: 'Delivered, enjoy'),
      });
      await tester.pump();
      expect(find.text('Delivered, enjoy'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('chat-tile-b')), matching: find.byType(CountBadge)), findsOneWidget);
      // b is now the most recent
      expect(tester.getTopLeft(find.byKey(const ValueKey('chat-tile-b'))).dy, lessThan(tester.getTopLeft(find.byKey(const ValueKey('chat-tile-a'))).dy));

      RealtimeStore.instance.debugEmit('chat:read', {'conversationId': 'a', 'side': 'buyer', 'readBy': 'u1'});
      await tester.pump();
      expect(find.descendant(of: find.byKey(const ValueKey('chat-tile-a')), matching: find.byType(CountBadge)), findsNothing);
      expect(ChatStore.instance.unread, 1);
    });

    testWidgets('an empty inbox explains how to start a conversation', (tester) async {
      server.handlers['chat:list'] = (_) => const <dynamic>[];
      await open(tester, const ChatInboxScreen());
      expect(find.byKey(const ValueKey('chat-empty')), findsOneWidget);
      expect(find.textContaining('No conversations yet'), findsOneWidget);
    });

    testWidgets('a failed load shows the message in place with a retry, no snackbar', (tester) async {
      var fail = true;
      server.handlers['chat:list'] = (_) => fail ? throw serverError('Sign in to continue.') : [convJson(id: 'a')];
      await open(tester, const ChatInboxScreen());
      expect(find.text('Sign in to continue.'), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
      fail = false;
      await tester.tap(find.text('Try again'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Mama Tech'), findsOneWidget);
    });

    testWidgets('French: title, context and empty state', (tester) async {
      twoThreads();
      await open(tester, const ChatInboxScreen(locale: Locale('fr')), lang: 'fr');
      expect(find.text('Mes messages'), findsOneWidget);
      expect(find.text('À propos de : Running shoes'), findsOneWidget);
      expect(find.text('Commande SOM-1042'), findsOneWidget);
    });

    testWidgets('tapping a row opens the thread', (tester) async {
      twoThreads();
      server.handlers['chat:messages'] = (_) => {'conversation': convJson(id: 'a'), 'messages': [msgJson('m1')], 'hasMore': false};
      await open(tester, const ChatInboxScreen());
      await tester.tap(find.byKey(const ValueKey('chat-tile-a')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(ChatThreadScreen), findsOneWidget);
    });
  });

  group('thread', () {
    void thread({bool hasMore = false, int unread = 0, List<Map<String, dynamic>>? messages, Map<String, dynamic>? conversation}) {
      server.handlers['chat:messages'] = (b) {
        if (b?['before'] == 'm3') {
          return {
            'conversation': convJson(),
            'messages': [msgJson('m1', text: 'First hello', at: '2026-10-23T09:00:00Z'), msgJson('m2', side: 'buyer', text: 'First question', at: '2026-10-23T09:05:00Z')],
            'hasMore': false,
          };
        }
        return {
          'conversation': conversation ?? convJson(unread: unread, productId: 'p1', productName: 'Running shoes'),
          'messages': messages ?? [msgJson('m3', text: 'Bonjour, oui il est disponible.'), msgJson('m4', side: 'buyer', text: 'Great, do you deliver to Limete?')],
          'hasMore': hasMore,
        };
      };
    }

    Future<void> openThread(WidgetTester tester, {String lang = 'en', ChatConversation? c}) =>
        open(tester, ChatThreadScreen(conversation: c ?? conv(convJson(productId: 'p1', productName: 'Running shoes'))), lang: lang);

    testWidgets('shows the context header and the bubbles: the customer on the right, the store on the left', (tester) async {
      thread();
      await openThread(tester);
      expect(find.text('About: Running shoes'), findsOneWidget);
      expect(find.text('Mama Tech'), findsWidgets);
      expect(find.text('Bonjour, oui il est disponible.'), findsOneWidget);
      expect(find.text('Great, do you deliver to Limete?'), findsOneWidget);
      final theirs = tester.getCenter(find.byKey(const ValueKey('chat-msg-m3'))).dx;
      final mine = tester.getCenter(find.byKey(const ValueKey('chat-msg-m4'))).dx;
      expect(mine, greaterThan(theirs));
      expect(server.bodiesOf('chat:messages').first, {'conversationId': 'c1', 'limit': ChatStore.pageSize});
    });

    testWidgets('an order context shows the order reference', (tester) async {
      thread(conversation: convJson(orderId: 'o1', orderReference: 'SOM-1042'));
      await openThread(tester, c: conv(convJson(orderId: 'o1', orderReference: 'SOM-1042')));
      expect(find.text('Order SOM-1042'), findsOneWidget);
    });

    testWidgets('opening a thread with unread messages marks it read', (tester) async {
      server.handlers['chat:list'] = (_) => [convJson(unread: 2)];
      server.handlers['chat:unread'] = (_) => {'total': 2, 'buyer': 2, 'seller': 0};
      await ChatStore.instance.refresh();
      expect(ChatStore.instance.unread, 2);
      thread(unread: 2);
      await openThread(tester, c: conv(convJson(unread: 2)));
      expect(server.bodiesOf('chat:markRead').single, {'conversationId': 'c1'});
      expect(ChatStore.instance.unread, 0);
    });

    testWidgets('a thread with nothing unread makes no markRead call', (tester) async {
      thread();
      await openThread(tester);
      expect(server.countOf('chat:markRead'), 0);
    });

    testWidgets('a message that arrives while the thread is open appears and is marked read at once', (tester) async {
      thread();
      await openThread(tester);
      expect(ChatStore.instance.openConversationId, 'c1');
      RealtimeStore.instance.debugEmit('chat:message', {
        'conversation': convJson(unread: 1, preview: 'Yes, tomorrow'),
        'message': msgJson('m5', text: 'Yes, tomorrow'),
      });
      await tester.pump();
      expect(find.text('Yes, tomorrow'), findsOneWidget);
      expect(server.bodiesOf('chat:markRead').single, {'conversationId': 'c1'});
      expect(ChatStore.instance.unread, 0);
    });

    testWidgets('a message for another conversation does not appear here', (tester) async {
      thread();
      server.handlers['chat:unread'] = (_) => {'total': 1, 'buyer': 1, 'seller': 0};
      await openThread(tester);
      RealtimeStore.instance.debugEmit('chat:message', {
        'conversation': convJson(id: 'other', unread: 1),
        'message': msgJson('mx', convId: 'other', text: 'Not for this thread'),
      });
      await tester.pump();
      expect(find.text('Not for this thread'), findsNothing);
      expect(ChatStore.instance.unread, 1);
    });

    testWidgets('leaving the thread stops treating it as open', (tester) async {
      thread();
      await openThread(tester);
      await tester.pumpWidget(gapApp(const SizedBox()));
      expect(ChatStore.instance.openConversationId, isNull);
    });

    testWidgets('older messages load on request with the oldest id as the cursor', (tester) async {
      thread(hasMore: true, messages: [msgJson('m3', text: 'Bonjour, oui il est disponible.'), msgJson('m4', side: 'buyer', text: 'Great, do you deliver to Limete?')]);
      await openThread(tester);
      expect(find.text('First hello'), findsNothing);
      expect(find.byKey(const ValueKey('chat-older')), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('chat-older')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(server.bodiesOf('chat:messages').last, {'conversationId': 'c1', 'before': 'm3', 'limit': ChatStore.pageSize});
      expect(find.text('First hello'), findsOneWidget);
      expect(find.text('First question'), findsOneWidget);
      expect(find.byKey(const ValueKey('chat-older')), findsNothing, reason: 'no more history');
      // oldest at the top, newest at the bottom
      expect(tester.getTopLeft(find.text('First hello')).dy, lessThan(tester.getTopLeft(find.text('Bonjour, oui il est disponible.')).dy));
    });

    testWidgets('sending: text and two photos go in one chat:send, a snackbar confirms, the box empties', (tester) async {
      thread();
      fakePhotos(2);
      server.handlers['chat:send'] = (b) => {
            'message': msgJson('m9', side: 'buyer', text: b!['text'] as String, attachments: List<String>.from(b['attachments'] as List), at: '2026-10-24T12:00:00Z'),
          };
      await openThread(tester);
      await tester.enterText(find.byKey(const ValueKey('chat-input')), '  Here is the box  ');
      await attachPhotos(tester);
      await tester.tap(find.byKey(const ValueKey('chat-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(server.bodiesOf('chat:send').single, {
        'conversationId': 'c1',
        'text': 'Here is the box',
        'attachments': ['/uploads/photo-1.jpg', '/uploads/photo-2.jpg'],
      });
      expect(find.text('Message sent.'), findsOneWidget);
      expect(find.text('Here is the box'), findsOneWidget);
      expect(find.byKey(const ValueKey('chat-photo-m9-0')), findsOneWidget);
      expect(find.byKey(const ValueKey('chat-photo-m9-1')), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const ValueKey('chat-input'))).controller!.text, isEmpty);
    });

    testWidgets('a photo only (no text) can be sent', (tester) async {
      thread();
      fakePhotos(1);
      server.handlers['chat:send'] = (b) => {'message': msgJson('m9', side: 'buyer', text: '', attachments: List<String>.from(b!['attachments'] as List))};
      await openThread(tester);
      await attachPhotos(tester);
      await tester.tap(find.byKey(const ValueKey('chat-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(server.bodiesOf('chat:send').single, {'conversationId': 'c1', 'text': '', 'attachments': ['/uploads/photo-1.jpg']});
    });

    testWidgets('at most 4 photos can be attached', (tester) async {
      thread();
      fakePhotos(6);
      await openThread(tester);
      await attachPhotos(tester);
      expect(find.byKey(const ValueKey('photo-add')), findsNothing, reason: 'the tray is full');
      expect(find.text('Up to 4 photos'), findsOneWidget);
    });

    testWidgets('an empty message is refused with a snackbar and nothing is sent', (tester) async {
      thread();
      await openThread(tester);
      await tester.tap(find.byKey(const ValueKey('chat-send')));
      await tester.pump();
      expect(find.text('Write a message first.'), findsOneWidget);
      expect(server.countOf('chat:send'), 0);
    });

    testWidgets('a photo still uploading blocks the send', (tester) async {
      thread();
      fakePhotos(1);
      final gate = Completer<String>();
      UploadService.debugUpload = (bytes, name) => gate.future;
      await openThread(tester);
      await tester.enterText(find.byKey(const ValueKey('chat-input')), 'Look');
      await tester.tap(find.byKey(const ValueKey('chat-attach')));
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('photo-add')));
      await tester.pumpAndSettle(const Duration(milliseconds: 100));
      await tester.tap(find.byKey(const ValueKey('photo-library')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      await tester.tap(find.byKey(const ValueKey('chat-send')));
      await tester.pump();
      expect(find.text('Wait for the photos to finish uploading.'), findsOneWidget);
      expect(server.countOf('chat:send'), 0);
      gate.complete('/uploads/late.jpg');
      await tester.pump();
    });

    testWidgets('a rate-limit failure is announced in French and the text stays', (tester) async {
      thread();
      server.handlers['chat:send'] = (_) => throw serverError('You are sending messages too fast. Wait a moment.');
      await openThread(tester, lang: 'fr');
      await tester.enterText(find.byKey(const ValueKey('chat-input')), 'Bonjour');
      await tester.tap(find.byKey(const ValueKey('chat-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Vous envoyez des messages trop vite. Patientez un instant.'), findsOneWidget);
      expect(tester.widget<TextField>(find.byKey(const ValueKey('chat-input'))).controller!.text, 'Bonjour');
      expect(find.byKey(const ValueKey('chat-read-only')), findsNothing);
    });

    testWidgets('a suspended store: the error is shown in French and the composer becomes a read-only note', (tester) async {
      thread();
      server.handlers['chat:send'] = (_) => throw serverError('Your store is suspended: you can read messages but not reply.');
      await openThread(tester, lang: 'fr');
      await tester.enterText(find.byKey(const ValueKey('chat-input')), 'Bonjour');
      await tester.tap(find.byKey(const ValueKey('chat-send')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Votre boutique est suspendue : vous pouvez lire les messages mais pas y répondre.'), findsOneWidget);
      expect(find.byKey(const ValueKey('chat-read-only')), findsOneWidget);
      expect(find.byKey(const ValueKey('chat-input')), findsNothing);
      expect(find.textContaining('vous pouvez lire les messages mais pas y répondre'), findsWidgets);
    });

    testWidgets('translate: a link under the store\'s messages only, toggling original and translation', (tester) async {
      thread();
      final asked = <Map<String, dynamic>?>[];
      RealtimeStore.instance.debugTranslateRequest = (event, [body]) async {
        asked.add(body);
        return {'text': 'Hello, yes it is available.', 'sourceLang': 'fr', 'same': false};
      };
      await openThread(tester);
      expect(find.byKey(const ValueKey('tt-link-chat_message-m3')), findsOneWidget);
      expect(find.byKey(const ValueKey('tt-link-chat_message-m4')), findsNothing, reason: 'your own messages need no translation');
      await tester.tap(find.byKey(const ValueKey('tt-link-chat_message-m3')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(asked.single, {'kind': 'chat_message', 'id': 'm3', 'target': 'en'});
      expect(find.text('Hello, yes it is available.'), findsOneWidget);
      expect(find.text('Translated automatically'), findsOneWidget);
      expect(find.text('See original'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('tt-link-chat_message-m3')));
      await tester.pump();
      expect(find.text('Bonjour, oui il est disponible.'), findsOneWidget);
      expect(find.text('See translation'), findsOneWidget);
    });

    testWidgets('a translation that fails is a snackbar and the original stays', (tester) async {
      thread();
      RealtimeStore.instance.debugTranslateRequest = (event, [body]) async => throw serverError('Nothing to translate.');
      await openThread(tester, lang: 'fr');
      await tester.tap(find.byKey(const ValueKey('tt-link-chat_message-m3')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.text('Rien à traduire.'), findsOneWidget);
      expect(find.text('Bonjour, oui il est disponible.'), findsOneWidget);
    });

    testWidgets('a photo opens full screen and closes again', (tester) async {
      thread(messages: [msgJson('m3', text: 'Look', attachments: ['/uploads/a.jpg', '/uploads/b.jpg'])]);
      await openThread(tester);
      await tester.tap(find.byKey(const ValueKey('chat-photo-m3-1')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(PhotoViewerScreen), findsOneWidget);
      expect(find.text('Photo 2 of 2'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('photo-viewer-close')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.byType(PhotoViewerScreen), findsNothing);
    });

    testWidgets('a thread that cannot load shows the error in place with a retry', (tester) async {
      var fail = true;
      server.handlers['chat:messages'] = (_) => fail
          ? throw serverError('Conversation not found.')
          : {'conversation': convJson(), 'messages': [msgJson('m1')], 'hasMore': false};
      await openThread(tester, lang: 'fr');
      expect(find.text('Conversation introuvable.'), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
      fail = false;
      await tester.tap(find.text('Réessayer'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Hello'), findsOneWidget);
    });

    testWidgets('button rules: no icon on label buttons, at most one filled button', (tester) async {
      thread();
      await openThread(tester);
      expectButtonRules(tester);
    });
  });

  group('compose and the "Message the seller" button', () {
    void started() => server.handlers['chat:start'] = (b) => {
          'conversation': convJson(id: 'new', productId: b!['productId'] as String?, productName: 'Item p1', preview: b['text'] as String),
          'message': msgJson('m1', convId: 'new', side: 'buyer', text: b['text'] as String),
        };

    testWidgets('starting from a product sends the product and the first message, then continues in the thread', (tester) async {
      started();
      server.handlers['chat:messages'] = (b) => {
            'conversation': convJson(id: 'new', productId: 'p1', productName: 'Item p1'),
            'messages': [msgJson('m1', convId: 'new', side: 'buyer', text: 'Is it available in blue?')],
            'hasMore': false,
          };
      await open(tester, const ChatComposeScreen(sellerId: 's1', storeName: 'Mama Tech', productId: 'p1'));
      expect(find.text('Mama Tech'), findsOneWidget);
      expect(find.byKey(const ValueKey('compose-context')), findsOneWidget);
      expect(find.text('About: Item p1'), findsOneWidget);
      expect(server.countOf('chat:start'), 0, reason: 'opening the compose screen creates nothing');
      await tester.enterText(find.byKey(const ValueKey('compose-text')), 'Is it available in blue?');
      await tester.tap(find.text('Send message'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(server.bodiesOf('chat:start').single, {'sellerId': 's1', 'productId': 'p1', 'text': 'Is it available in blue?'});
      expect(find.byType(ChatThreadScreen), findsOneWidget);
      expect(find.byType(ChatComposeScreen), findsNothing);
      expect(find.text('Message sent to Mama Tech.'), findsOneWidget);
      expect(find.text('Is it available in blue?'), findsOneWidget);
    });

    testWidgets('starting from an order sends the order and the photos', (tester) async {
      started();
      fakePhotos(1);
      RealtimeStore.instance.orders.add(OrderDto.fromJson({
        'id': 'o1', 'reference': 'SOM-1042', 'customerName': 'Aline', 'status': 'delivered', 'paymentMethod': 'wallet', 'totalUsd': 20, 'items': [],
      }));
      server.handlers['chat:messages'] = (_) => {'conversation': convJson(id: 'new', orderId: 'o1'), 'messages': [], 'hasMore': false};
      await open(tester, const ChatComposeScreen(sellerId: 's1', storeName: 'Mama Tech', orderId: 'o1'));
      expect(find.text('Order SOM-1042'), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('compose-text')), 'The box was damaged');
      await tester.tap(find.byKey(const ValueKey('photo-add')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('photo-library')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Send message'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      expect(server.bodiesOf('chat:start').single, {'sellerId': 's1', 'orderId': 'o1', 'text': 'The box was damaged', 'attachments': ['/uploads/photo-1.jpg']});
    });

    testWidgets('an empty first message: inline error and a snackbar, nothing is sent', (tester) async {
      started();
      await open(tester, const ChatComposeScreen(sellerId: 's1', storeName: 'Mama Tech'));
      await tester.tap(find.text('Send message'));
      await tester.pump();
      expect(find.text('Write a message first.'), findsOneWidget, reason: 'inline');
      expect(find.text('Check the highlighted fields.'), findsOneWidget, reason: 'snackbar');
      expect(server.countOf('chat:start'), 0);
    });

    testWidgets('a refused start is announced in French; the screen stays and can retry', (tester) async {
      server.handlers['chat:start'] = (_) => throw serverError('You are opening too many conversations. Try again later.');
      await open(tester, const ChatComposeScreen(sellerId: 's1', storeName: 'Mama Tech'), lang: 'fr');
      await tester.enterText(find.byKey(const ValueKey('compose-text')), 'Bonjour');
      await tester.tap(find.text('Envoyer le message'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Vous ouvrez trop de conversations. Réessayez plus tard.'), findsOneWidget);
      expect(find.byType(ChatComposeScreen), findsOneWidget);
      expect(find.text('Envoyer le message'), findsOneWidget, reason: 'the spinner is gone');
    });

    testWidgets('compose obeys the button rules', (tester) async {
      await open(tester, const ChatComposeScreen(sellerId: 's1', storeName: 'Mama Tech'));
      expectButtonRules(tester);
    });

    Widget host({String sellerId = 's1', String? productId, String? orderId}) =>
        Scaffold(body: Center(child: MessageSellerButton(sellerId: sellerId, storeName: 'Mama Tech', productId: productId, orderId: orderId)));

    testWidgets('the button opens the compose screen when there is no thread yet (nothing is created)', (tester) async {
      server.handlers['chat:list'] = (_) => const <dynamic>[];
      await open(tester, host(productId: 'p1'));
      expect(find.text('Message the seller'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('message-seller')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(ChatComposeScreen), findsOneWidget);
      expect(server.countOf('chat:start'), 0);
    });

    testWidgets('the button reuses the thread for the same store and product', (tester) async {
      server.handlers['chat:list'] = (_) => [convJson(id: 'a', productId: 'p1', productName: 'Item p1')];
      server.handlers['chat:messages'] = (_) => {'conversation': convJson(id: 'a', productId: 'p1', productName: 'Item p1'), 'messages': [msgJson('m1')], 'hasMore': false};
      await ChatStore.instance.loadConversations();
      await open(tester, host(productId: 'p1'));
      await tester.tap(find.byKey(const ValueKey('message-seller')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(ChatThreadScreen), findsOneWidget);
      expect(find.byType(ChatComposeScreen), findsNothing);
    });

    testWidgets('another product of the same store starts a new thread', (tester) async {
      server.handlers['chat:list'] = (_) => [convJson(id: 'a', productId: 'p1')];
      await ChatStore.instance.loadConversations();
      await open(tester, host(productId: 'p2'));
      await tester.tap(find.byKey(const ValueKey('message-seller')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(ChatComposeScreen), findsOneWidget);
    });

    testWidgets('the inbox is loaded first when the phone has not read it yet', (tester) async {
      server.handlers['chat:list'] = (_) => [convJson(id: 'a', orderId: 'o1', orderReference: 'SOM-1')];
      server.handlers['chat:messages'] = (_) => {'conversation': convJson(id: 'a', orderId: 'o1', orderReference: 'SOM-1'), 'messages': [], 'hasMore': false};
      await open(tester, host(orderId: 'o1'));
      await tester.tap(find.byKey(const ValueKey('message-seller')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(server.countOf('chat:list'), 1);
      expect(find.byType(ChatThreadScreen), findsOneWidget);
    });

    testWidgets('the button is hidden when nobody is signed in, and its label is French in French', (tester) async {
      RealtimeStore.instance.user = null;
      await open(tester, host());
      expect(find.byKey(const ValueKey('message-seller')), findsNothing);
      RealtimeStore.instance.user = gapUser();
      await open(tester, host(), lang: 'fr');
      expect(find.text('Écrire au vendeur'), findsOneWidget);
    });
  });

  group('notices', () {
    test('a chat notice routes to the thread by its entity id, or to the inbox without one', () {
      bool none(String id) => false;
      expect(noticeRoute('chat', 'c1', hasOrder: none), const NoticeRoute(NoticeDest.chat, 'c1'));
      expect(noticeRoute('chat', null, hasOrder: none), const NoticeRoute(NoticeDest.messages));
      expect(noticeRoute('support', 't1', hasOrder: none), const NoticeRoute(NoticeDest.ticket, 't1'));
    });

    Future<void> tapNotice(WidgetTester tester, String? entityId) async {
      gapTallViewport(tester);
      await tester.pumpWidget(gapApp(Builder(
        builder: (context) => TextButton(
          onPressed: () => openNotice(Navigator.of(context), const Locale('en'), type: 'chat', entityId: entityId),
          child: const Text('go'),
        ),
      )));
      await tester.tap(find.text('go'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
    }

    testWidgets('tapping a chat notice opens that thread', (tester) async {
      server.handlers['chat:messages'] = (b) => {'conversation': convJson(id: b!['conversationId'] as String), 'messages': [msgJson('m1', text: 'Your parcel left')], 'hasMore': false};
      await tapNotice(tester, 'c7');
      expect(find.byType(ChatThreadScreen), findsOneWidget);
      expect(find.text('Your parcel left'), findsOneWidget);
    });

    testWidgets('a chat notice for a thread that cannot be found opens the inbox', (tester) async {
      server.handlers['chat:messages'] = (_) => throw serverError('Conversation not found.');
      server.handlers['chat:list'] = (_) => const <dynamic>[];
      await tapNotice(tester, 'gone');
      expect(find.byType(ChatInboxScreen), findsOneWidget);
    });

    testWidgets('a chat notice without an entity id opens the inbox', (tester) async {
      server.handlers['chat:list'] = (_) => const <dynamic>[];
      await tapNotice(tester, null);
      expect(find.byType(ChatInboxScreen), findsOneWidget);
    });
  });

  group('account entries', () {
    testWidgets('Messages and Support show their unread counts', (tester) async {
      server.handlers['chat:list'] = (_) => [convJson(id: 'a', unread: 3), convJson(id: 'b', unread: 2, at: '2026-10-23T09:00:00Z')];
      server.handlers['chat:unread'] = (_) => {'total': 5, 'buyer': 5, 'seller': 0};
      server.handlers['support:list'] = (_) => [ticketJson('t1', userUnread: 2), ticketJson('t2', userUnread: 1, reference: 'TKT-2')];
      await ChatStore.instance.refresh();
      await SupportStore.instance.load();
      await open(tester, AccountScreen(locale: const Locale('en'), onLocaleChanged: (_) {}));
      final messages = find.byKey(const ValueKey('menu-messages'));
      final support = find.byKey(const ValueKey('menu-support'));
      expect(messages, findsOneWidget);
      expect(find.descendant(of: messages, matching: find.text('5')), findsOneWidget);
      expect(find.descendant(of: support, matching: find.text('3')), findsOneWidget);
      expect(find.descendant(of: messages, matching: find.text('My messages')), findsOneWidget);
    });

    testWidgets('no badge at zero', (tester) async {
      await open(tester, AccountScreen(locale: const Locale('en'), onLocaleChanged: (_) {}));
      expect(find.descendant(of: find.byKey(const ValueKey('menu-messages')), matching: find.byType(CountBadge)), findsNothing);
      expect(find.descendant(of: find.byKey(const ValueKey('menu-support')), matching: find.byType(CountBadge)), findsNothing);
    });
  });
}
