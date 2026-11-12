// Old customer <-> store chats, read-only (docs/contracts/admin-controls.md section 3): the inbox and the thread still show the
// history (with translations), nothing can be sent or started, a note says messaging is closed with "Contact support", and the
// live pushes, unread badges, account entry and chat notices are gone.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/account_screen.dart';
import 'package:lipcart/screens/more/chat_inbox.dart';
import 'package:lipcart/screens/more/chat_thread.dart';
import 'package:lipcart/screens/more/chat_widgets.dart';
import 'package:lipcart/screens/more/support_screens.dart';
import 'package:lipcart/screens/notice_router.dart';
import 'package:lipcart/services/chat_store.dart';
import 'package:lipcart/services/feature_hooks.dart';
import 'package:lipcart/services/notification_sound.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/support_store.dart';

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

  group('inbox (earlier chats)', () {
    void twoThreads() => server.handlers['chat:list'] = (_) => [
          convJson(id: 'a', unread: 2, productId: 'p1', productName: 'Running shoes', productNameFr: 'Baskets de running', preview: 'It is in stock', at: '2026-10-24T09:30:00Z'),
          convJson(id: 'b', storeName: 'Kin Tech', orderId: 'o1', orderReference: 'SOM-1042', preview: 'Your parcel left today', at: '2026-10-20T09:30:00Z'),
        ];

    testWidgets('lists the old threads with store, context and last message, newest first, with no unread badge', (tester) async {
      twoThreads();
      await open(tester, const ChatInboxScreen());
      expect(find.text('Earlier store chats'), findsOneWidget);
      expect(find.text('Mama Tech'), findsOneWidget);
      expect(find.text('Kin Tech'), findsOneWidget);
      expect(find.text('About: Running shoes'), findsOneWidget);
      expect(find.text('Order SOM-1042'), findsOneWidget);
      expect(find.text('It is in stock'), findsOneWidget);
      expect(find.byType(CountBadge), findsNothing, reason: 'nothing new can arrive: no unread counts');
      expect(server.bodiesOf('chat:list').first, {'as': 'buyer', 'limit': ChatStore.pageSize, 'offset': 0});
      expect(tester.getTopLeft(find.byKey(const ValueKey('chat-tile-a'))).dy, lessThan(tester.getTopLeft(find.byKey(const ValueKey('chat-tile-b'))).dy));
    });

    testWidgets('a live chat:message is ignored: the store binds no chat pushes any more', (tester) async {
      twoThreads();
      await open(tester, const ChatInboxScreen());
      RealtimeStore.instance.debugEmit('chat:message', {
        'conversation': convJson(id: 'b', storeName: 'Kin Tech', unread: 1, preview: 'Delivered, enjoy', at: '2026-10-24T11:00:00Z'),
        'message': msgJson('m9', convId: 'b', text: 'Delivered, enjoy'),
      });
      await tester.pump();
      expect(find.text('Delivered, enjoy'), findsNothing);
      expect(find.byType(CountBadge), findsNothing);
    });

    testWidgets('the inbox preview follows the app language when the server sent both', (tester) async {
      server.handlers['chat:list'] = (_) => [
            {...convJson(id: 'b', storeName: 'Kin Tech', preview: 'Livré, profitez-en'), 'lastMessageI18n': {'sourceLang': 'fr', 'en': 'Delivered, enjoy', 'fr': 'Livré, profitez-en'}},
          ];
      await open(tester, const ChatInboxScreen());
      expect(find.text('Delivered, enjoy'), findsOneWidget);
      await open(tester, const ChatInboxScreen(locale: Locale('fr')), lang: 'fr');
      await tester.pump();
      expect(find.text('Livré, profitez-en'), findsOneWidget);
    });

    testWidgets('an empty inbox says messaging is closed and points to support; it never offers to start a chat', (tester) async {
      server.handlers['chat:list'] = (_) => const <dynamic>[];
      await open(tester, const ChatInboxScreen());
      expect(find.byKey(const ValueKey('chat-empty')), findsOneWidget);
      expect(find.textContaining('Messaging stores is closed'), findsOneWidget);
      expect(find.textContaining('Message a store'), findsNothing);
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
      expect(find.text('Anciennes discussions avec les boutiques'), findsOneWidget);
      expect(find.text('À propos de : Baskets de running'), findsOneWidget); // the product in French, not the English name
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

  group('thread (read-only)', () {
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

    testWidgets('there is no composer: no text box, no send button, no photo picker; a note says messaging is closed', (tester) async {
      thread();
      await openThread(tester);
      expect(find.byType(TextField), findsNothing);
      expect(find.byKey(const ValueKey('thread-send')), findsNothing);
      expect(find.byType(MessageComposer), findsNothing);
      expect(find.byKey(const ValueKey('chat-closed-note')), findsOneWidget);
      expect(find.textContaining('Messaging stores is closed'), findsOneWidget);
      expect(server.countOf('chat:send'), 0);
      expect(server.countOf('chat:start'), 0);
    });

    testWidgets('French note and button', (tester) async {
      thread();
      await openThread(tester, lang: 'fr');
      expect(find.textContaining('La messagerie avec les boutiques est fermée'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('chat-contact-support')), matching: find.text('Contacter l’assistance')), findsOneWidget);
    });

    testWidgets('"Contact support" from an order chat opens a new ticket for that order', (tester) async {
      thread(conversation: convJson(orderId: 'o1', orderReference: 'SOM-1042'));
      await openThread(tester, c: conv(convJson(orderId: 'o1', orderReference: 'SOM-1042')));
      expect(find.text('Order SOM-1042'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('chat-contact-support')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(NewTicketScreen), findsOneWidget);
      expect(tester.widget<DropdownButtonFormField<String?>>(find.byKey(const ValueKey('ticket-order'))).initialValue, 'o1');
    });

    testWidgets('"Contact support" from a product chat starts the subject with the product', (tester) async {
      thread();
      await openThread(tester);
      await tester.tap(find.byKey(const ValueKey('chat-contact-support')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(tester.widget<TextField>(find.descendant(of: find.byKey(const ValueKey('ticket-subject')), matching: find.byType(TextField))).controller!.text, 'About: Running shoes');
    });

    testWidgets('opening a thread reads nothing and marks nothing: no markRead call', (tester) async {
      thread(unread: 2);
      await openThread(tester, c: conv(convJson(unread: 2)));
      expect(server.countOf('chat:markRead'), 0);
    });

    testWidgets('a message pushed while the thread is open does not appear (no live pushes)', (tester) async {
      thread();
      await openThread(tester);
      RealtimeStore.instance.debugEmit('chat:message', {
        'conversation': convJson(unread: 1, preview: 'Yes, tomorrow'),
        'message': msgJson('m5', text: 'Yes, tomorrow'),
      });
      await tester.pump();
      expect(find.text('Yes, tomorrow'), findsNothing);
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

    testWidgets('translate: the store\'s messages are translated by themselves (yours are not), the link toggles original and translation', (tester) async {
      thread();
      final asked = <Map<String, dynamic>?>[];
      RealtimeStore.instance.debugTranslateRequest = (event, [body]) async {
        asked.add(body);
        return {'text': 'Hello, yes it is available.', 'sourceLang': 'fr', 'same': false};
      };
      await openThread(tester);
      await tester.pump();
      await tester.pump();
      expect(asked.single, {'kind': 'chat_message', 'id': 'm3', 'target': 'en'});
      expect(find.byKey(const ValueKey('tt-link-chat_message-m4')), findsNothing, reason: 'your own messages need no translation');
      expect(find.text('Hello, yes it is available.'), findsOneWidget);
      expect(find.text('Translated automatically'), findsOneWidget);
      expect(find.text('See original'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('tt-link-chat_message-m3')));
      await tester.pump();
      expect(find.text('Bonjour, oui il est disponible.'), findsOneWidget);
      expect(find.text('See translation'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('tt-link-chat_message-m3')));
      await tester.pump();
      expect(find.text('Hello, yes it is available.'), findsOneWidget);
      expect(asked, hasLength(1));
    });

    testWidgets('a store message that arrives with its translations is shown in the app language at once, with no request', (tester) async {
      final asked = <Map<String, dynamic>?>[];
      RealtimeStore.instance.debugTranslateRequest = (event, [body]) async {
        asked.add(body);
        return {'text': 'never', 'sourceLang': 'fr', 'same': false};
      };
      thread(messages: [
        {...msgJson('m3', text: 'Bonjour, oui il est disponible.'), 'textI18n': {'sourceLang': 'fr', 'en': 'Hello, yes it is available.', 'fr': 'Bonjour, oui il est disponible.'}},
        {...msgJson('m5', text: 'Hello again'), 'textI18n': {'sourceLang': 'en', 'en': 'Hello again', 'fr': 'Rebonjour'}},
        msgJson('m4', side: 'buyer', text: 'Great, do you deliver to Limete?'),
      ]);
      await openThread(tester);
      await tester.pump();
      expect(find.text('Hello, yes it is available.'), findsOneWidget);
      expect(find.text('Hello again'), findsOneWidget);
      expect(find.byKey(const ValueKey('tt-link-chat_message-m5')), findsNothing, reason: 'written in the app language: no link');
      expect(find.byKey(const ValueKey('tt-link-chat_message-m3')), findsOneWidget);
      expect(find.text('Translated automatically'), findsOneWidget);
      expect(asked, isEmpty);

      await openThread(tester, lang: 'fr');
      await tester.pump();
      expect(find.text('Bonjour, oui il est disponible.'), findsOneWidget);
      expect(find.text('Rebonjour'), findsOneWidget);
      expect(asked, isEmpty);
    });

    testWidgets('a translation that fails by itself is silent and the original stays; the link tries again and then says why', (tester) async {
      thread();
      RealtimeStore.instance.debugTranslateRequest = (event, [body]) async => throw serverError('Nothing to translate.');
      await openThread(tester, lang: 'fr');
      await tester.pump();
      await tester.pump();
      expect(find.byType(SnackBar), findsNothing, reason: 'nobody asked: stay quiet');
      expect(find.text('Bonjour, oui il est disponible.'), findsOneWidget);
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

    testWidgets('button rules: no icon on label buttons, one filled button (Contact support)', (tester) async {
      thread();
      await openThread(tester);
      expectButtonRules(tester);
    });
  });

  group('the store, the hook and the entries', () {
    test('the chat hook binds no pushes, loads nothing at sign-in and only forgets on sign-out', () async {
      final hook = buildFeatureHooks().firstWhere((h) => h.name == 'chat');
      expect(hook.pushes, isEmpty);
      expect(hook.hydrate, isNull);
      server.handlers['chat:list'] = (_) => [convJson(id: 'a')];
      await ChatStore.instance.loadConversations();
      expect(ChatStore.instance.conversations, hasLength(1));
      hook.reset!();
      expect(ChatStore.instance.conversations, isEmpty);
      expect(ChatStore.instance.loaded, isFalse);
    });

    test('a chat notice makes no sound and has no screen of its own: it opens the notification list', () {
      expect(isSilentNotice('chat'), isTrue);
      expect(isSilentNotice('support'), isFalse);
      bool none(String id) => false;
      expect(noticeRoute('chat', 'c1', hasOrder: none), const NoticeRoute(NoticeDest.notifications));
      expect(noticeRoute('chat', null, hasOrder: none), const NoticeRoute(NoticeDest.notifications));
      expect(noticeRoute('support', 't1', hasOrder: none), const NoticeRoute(NoticeDest.ticket, 't1'));
    });

    testWidgets('the account menu has no Messages entry; Support keeps its unread count', (tester) async {
      server.handlers['support:list'] = (_) => [ticketJson('t1', userUnread: 2), ticketJson('t2', userUnread: 1, reference: 'TKT-2')];
      await SupportStore.instance.load();
      await open(tester, AccountScreen(locale: const Locale('en'), onLocaleChanged: (_) {}));
      expect(find.byKey(const ValueKey('menu-messages')), findsNothing);
      expect(find.text('Earlier store chats'), findsNothing);
      expect(find.descendant(of: find.byKey(const ValueKey('menu-support')), matching: find.text('3')), findsOneWidget);
      expect(server.countOf('chat:list'), 0, reason: 'nothing about chats is loaded from the account menu');
    });

    testWidgets('no Support badge at zero', (tester) async {
      await open(tester, AccountScreen(locale: const Locale('en'), onLocaleChanged: (_) {}));
      expect(find.descendant(of: find.byKey(const ValueKey('menu-support')), matching: find.byType(CountBadge)), findsNothing);
    });

    testWidgets('Support shows no link to old chats when there are none', (tester) async {
      server.handlers['support:list'] = (_) => <dynamic>[];
      server.handlers['chat:list'] = (_) => const <dynamic>[];
      await open(tester, const SupportListScreen());
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('earlier-chats')), findsNothing);
    });

    testWidgets('Support lists the old chats behind a read-only link when there are some', (tester) async {
      server.handlers['support:list'] = (_) => <dynamic>[];
      server.handlers['chat:list'] = (_) => [convJson(id: 'a')];
      server.handlers['chat:messages'] = (_) => {'conversation': convJson(id: 'a'), 'messages': [msgJson('m1')], 'hasMore': false};
      await open(tester, const SupportListScreen());
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.text('Earlier chats with stores (read-only)'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('earlier-chats')));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.byType(ChatInboxScreen), findsOneWidget);
      expect(find.text('Mama Tech'), findsOneWidget);
    });
  });
}
