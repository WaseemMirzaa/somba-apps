// The rider's support screen (docs/contracts/after-sale.md section 6): tickets with status badges and unread counts,
// the thread (messages arrive as a JSON string), the composer with photos, the closed-ticket guard, opening a ticket
// (subject + message required, an optional task of the rider, optional photos) and live `support:updated` pushes.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:somba_rider/l10n/strings.dart';
import 'package:somba_rider/screens/profile_screen.dart';
import 'package:somba_rider/screens/support_screen.dart';
import 'package:somba_rider/services/auth_service.dart' show ApiException;
import 'package:somba_rider/services/models.dart';
import 'package:somba_rider/services/rider_store.dart';
import 'package:somba_rider/services/support_models.dart';
import 'package:somba_rider/services/support_store.dart';
import 'package:somba_rider/theme/app_theme.dart';

import 'button_rules.dart';
import 'task_fixtures.dart';

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    for (final f in const {'Inter': 'assets/fonts/Inter.ttf', 'PlusJakartaSans': 'assets/fonts/PlusJakartaSans.ttf'}.entries) {
      await (FontLoader(f.key)..addFont(rootBundle.load(f.value))).load();
    }
  });

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await Strings.setLang('en', persist: false);
    final store = RiderStore.instance;
    store.user = BackendUser(id: 'r', email: 'rider@somba.app', name: 'Jean-Pierre Mukendi', role: 'rider', phone: '+243810000000');
    store.loaded = true;
    store.myTasks
      ..clear()
      ..addAll([leg('pickup', id: 'a'), leg('transfer', id: 'b'), leg('delivery', id: 'c')]);
  });

  tearDown(() {
    final store = RiderStore.instance;
    store.user = null;
    store.myTasks.clear();
    store.assignment = null;
    resetSupport();
  });

  group('models', () {
    test('messages decode from the JSON string, or from a list', () {
      final t = SupportTicket.fromJson(ticketJson('1', unread: 3, orderId: 'o1'));
      expect(t.messages, hasLength(2));
      expect(t.messages[1].attachments, hasLength(1));
      expect(t.messages[0].isMine('r'), isTrue);
      expect(t.messages[1].isMine('r'), isFalse);
      expect((t.userUnread, t.orderId, t.category, t.reference), (3, 'o1', 'delivery', 'TKT-00000001'));
      expect(t.last!.text, 'Merci, nous le contactons.');
      final fromList = SupportTicket.fromJson(ticketJson('2', messagesAsList: true));
      expect(fromList.messages, hasLength(2));
    });

    test('a broken or missing messages field and missing keys never throw', () {
      expect(SupportTicket.fromJson({'id': 'x', 'messages': 'not json'}).messages, isEmpty);
      expect(SupportTicket.fromJson({'id': 'x', 'messages': '[1,"a",{"id":"m","text":"ok"}]'}).messages.single.text, 'ok');
      final bare = SupportTicket.fromJson({'id': 'x'});
      expect((bare.status, bare.category, bare.userUnread), ('open', 'general', 0));
      expect(bare.messages, isEmpty);
    });

    test('resolved and closed tickets are closed; open and pending are not', () {
      for (final st in ['closed', 'resolved']) {
        expect(ticket('1', status: st).isClosed, isTrue, reason: st);
      }
      for (final st in ['open', 'pending']) {
        expect(ticket('1', status: st).isClosed, isFalse, reason: st);
      }
    });
  });

  group('store', () {
    test('load sorts by last activity and sums the unread; a push updates or adds; markRead zeroes the badge', () async {
      final fakes = fakeSupport(loaded: false, tickets: [
        SupportTicket.fromJson(ticketJson('1', unread: 2)..['updatedAt'] = '2026-10-25T08:00:00.000Z'),
        SupportTicket.fromJson(ticketJson('2', unread: 1)..['updatedAt'] = '2026-10-25T12:00:00.000Z'),
      ]);
      final s = SupportStore.instance;
      s.tickets.clear();
      await s.load();
      expect(s.tickets.map((t) => t.id), ['2', '1']);
      expect(s.unread, 3);

      s.applyPush(ticketJson('1', unread: 5)..['updatedAt'] = '2026-10-25T13:00:00.000Z');
      expect(s.tickets.map((t) => t.id), ['1', '2'], reason: 'the newest activity first');
      expect(s.unread, 6);
      s.applyPush(ticketJson('9'));
      expect(s.tickets, hasLength(3));
      s.applyPush('garbage');

      await s.markRead('1');
      expect(s.byId('1')!.userUnread, 0);
      expect(fakes.api.calls, contains('markRead:1'));
      fakes.api.calls.clear();
      await s.markRead('1');
      expect(fakes.api.calls, isEmpty, reason: 'nothing unread: no call');
    });

    test('a failed list read is kept for the screen; sign-out clears everything', () async {
      final fakes = fakeSupport(loaded: false);
      fakes.api.failWith = ApiException('Not allowed.');
      final s = SupportStore.instance;
      await s.load();
      expect(s.loaded, isFalse);
      expect(s.loadError, isNotNull);
      fakes.api.failWith = null;
      await s.load();
      expect(s.loaded, isTrue);
      s.clear();
      expect(s.tickets, isEmpty);
      expect((s.loaded, s.unread), (false, 0));
    });

    test('the socket calls match the contract', () async {
      final sent = <String, Map<String, dynamic>?>{};
      RiderStore.instance.transport = (event, body) async {
        sent[event] = body;
        return ticketJson('7');
      };
      addTearDown(() => RiderStore.instance.transport = null);
      final api = SocketSupportApi();
      await api.open(subject: 'S', message: 'M', category: 'delivery', orderId: 'o1', attachments: ['u1']);
      expect(sent['support:open'], {'subject': 'S', 'message': 'M', 'category': 'delivery', 'orderId': 'o1', 'attachments': ['u1']});
      await api.open(subject: 'S', message: 'M');
      expect(sent['support:open'], {'subject': 'S', 'message': 'M'});
      await api.reply('7', text: ' hi ', attachments: ['u1']);
      expect(sent['support:reply'], {'id': '7', 'text': 'hi', 'attachments': ['u1']});
      await api.reply('7', attachments: ['u1']);
      expect(sent['support:reply'], {'id': '7', 'attachments': ['u1']});
      await api.markRead('7');
      expect(sent['support:markRead'], {'id': '7'});
      await api.get('7');
      expect(sent['support:get'], {'id': '7'});
    });
  });

  Future<void> pumpApp(WidgetTester t, String lang, Widget home) async {
    await Strings.setLang(lang, persist: false);
    t.view.physicalSize = const Size(360 * 3, 780 * 3);
    t.view.devicePixelRatio = 3;
    addTearDown(t.view.reset);
    await t.pumpWidget(KeyedSubtree(key: UniqueKey(), child: MaterialApp(
      locale: Locale(lang),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
      theme: AppTheme.light(),
      home: home,
    )));
    await t.pump(const Duration(milliseconds: 600));
  }

  group('list', () {
    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);
      testWidgets('tickets with status badges and unread counts; the profile badge ($lang)', (t) async {
        fakeSupport(tickets: [
          ticket('1', unread: 2),
          ticket('2', status: 'resolved', subject: 'Paiement'),
          ticket('3', status: 'pending', subject: 'Colis abîmé'),
          ticket('4', status: 'closed', subject: 'Ancien'),
        ]);
        await pumpApp(t, lang, const SupportScreen());
        for (final id in ['1', '2', '3', '4']) {
          expect(find.byKey(ValueKey('ticket-$id')), findsOneWidget);
        }
        expect(find.descendant(of: find.byKey(const ValueKey('status-1')), matching: find.text(s.ticketOpen)), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('status-2')), matching: find.text(s.ticketResolved)), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('status-3')), matching: find.text(s.ticketPending)), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('status-4')), matching: find.text(s.ticketClosed)), findsOneWidget);
        expect(find.byKey(const ValueKey('unread-1')), findsOneWidget);
        expect(find.text(s.supportUnreadMany(2)), findsOneWidget);
        expect(find.byKey(const ValueKey('unread-2')), findsNothing);
        expect(find.text(s.supportOpenNew), findsOneWidget);
        expectButtonRules(t);

        await pumpApp(t, lang, Scaffold(body: ProfileScreen(locale: Locale(lang), onLocaleChanged: (_) {})));
        expect(find.byKey(const ValueKey('support-unread')), findsOneWidget);
        expect(find.text(s.supportUnreadMany(2)), findsWidgets);
      });
    }

    testWidgets('no ticket yet: an empty state; a failed read: the error and a retry that works', (t) async {
      final fakes = fakeSupport(loaded: false);
      fakes.api.failWith = ApiException('Not allowed.');
      await pumpApp(t, 'fr', const SupportScreen());
      await t.pump();
      expect(find.byKey(const ValueKey('support-error')), findsOneWidget);
      expect(find.text('Action non autorisée.'), findsOneWidget);
      fakes.api.failWith = null;
      await t.tap(find.byKey(const ValueKey('support-retry')));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.byKey(const ValueKey('support-empty')), findsOneWidget);
    });

    testWidgets('tapping a ticket opens its thread and reading it zeroes the unread badge', (t) async {
      final fakes = fakeSupport(tickets: [ticket('1', unread: 2)]);
      await pumpApp(t, 'en', const SupportScreen());
      await t.tap(find.byKey(const ValueKey('ticket-1')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('thread-subject')), findsOneWidget);
      expect(fakes.api.calls, contains('markRead:1'));
      expect(SupportStore.instance.unread, 0);
    });

    testWidgets('a support notice opens the thread directly (openTicketId)', (t) async {
      fakeSupport(tickets: [ticket('1')]);
      await pumpApp(t, 'en', const SupportScreen(openTicketId: '1'));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('thread-subject')), findsOneWidget);
    });
  });

  group('thread', () {
    for (final lang in ['en', 'fr']) {
      final s = Strings(lang);
      testWidgets('decoded messages, who wrote them, photos, status and category badges ($lang)', (t) async {
        fakeSupport(tickets: [ticket('1', orderId: 'o-c')]);
        await pumpApp(t, lang, const SupportThreadScreen(ticketId: '1'));
        expect(find.text('Bonjour, le client ne répond pas au téléphone.'), findsOneWidget);
        expect(find.text('Merci, nous le contactons.'), findsOneWidget);
        expect(find.textContaining(s.threadYou), findsOneWidget);
        expect(find.textContaining('Marie Support'), findsNothing, reason: 'an admin role shows as Somba support');
        expect(find.textContaining(s.threadSupport), findsOneWidget);
        expect(find.byType(Image), findsOneWidget, reason: 'the agent attached a photo');
        expect(find.byKey(const ValueKey('thread-status')), findsOneWidget);
        expect(find.text(s.t('cat_delivery')), findsOneWidget);
        expect(find.text(s.ticketOrderRef('SOM-1042')), findsOneWidget, reason: 'the linked order, by its reference');
        expect(find.byKey(const ValueKey('thread-input')), findsOneWidget);
        expect(find.byKey(const ValueKey('thread-closed')), findsNothing);
        expectButtonRules(t);
      });
    }

    testWidgets('sending text replies, clears the draft, says so, and the message shows', (t) async {
      final fakes = fakeSupport(tickets: [ticket('1')]);
      await pumpApp(t, 'en', const SupportThreadScreen(ticketId: '1'));
      await t.enterText(find.byKey(const ValueKey('thread-input')), '  Le client a répondu.  ');
      await t.tap(find.byKey(const ValueKey('thread-send')));
      await t.pumpAndSettle();
      expect(fakes.api.calls, contains('reply:1|Le client a répondu.|'));
      expect(find.text('Le client a répondu.'), findsOneWidget);
      expect(find.text(Strings('en').msgSent), findsOneWidget, reason: 'a completed send says so');
      expect(t.widget<TextField>(find.byKey(const ValueKey('thread-input'))).controller!.text, isEmpty);
    });

    testWidgets('an empty message is refused with a snackbar and no call', (t) async {
      final fakes = fakeSupport(tickets: [ticket('1')]);
      await pumpApp(t, 'fr', const SupportThreadScreen(ticketId: '1'));
      await t.tap(find.byKey(const ValueKey('thread-send')));
      await t.pump(const Duration(milliseconds: 300));
      expect(find.text(const Strings('fr').threadEmptyMessage), findsOneWidget);
      expect(fakes.api.calls.where((c) => c.startsWith('reply')), isEmpty);
    });

    testWidgets('photos: choose, upload, then reply carries the uploaded URLs; the photo can be removed first', (t) async {
      final fakes = fakeSupport(tickets: [ticket('1')]);
      fakes.picker.result = [const PickedPhoto('/tmp/a.jpg'), const PickedPhoto('/tmp/b.jpg')];
      await pumpApp(t, 'en', const SupportThreadScreen(ticketId: '1'));
      await t.tap(find.byKey(const ValueKey('attach-photo')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('photo-gallery')));
      await t.pumpAndSettle();
      expect(fakes.picker.asked, ['gallery:6']);
      expect(find.byKey(const ValueKey('remove-photo-/tmp/a.jpg')), findsOneWidget);
      await t.tap(find.byKey(const ValueKey('remove-photo-/tmp/b.jpg')));
      await t.pump();
      await t.tap(find.byKey(const ValueKey('thread-send')));
      await t.pumpAndSettle();
      expect(fakes.uploader.uploaded, ['/tmp/a.jpg']);
      final reply = fakes.api.calls.firstWhere((c) => c.startsWith('reply:1'));
      expect(reply, 'reply:1||http://localhost:3001/uploads/22222222-2222-2222-2222-222222222221.jpg');
    });

    testWidgets('a failed upload keeps the draft and says why; a failing picker says so too', (t) async {
      final fakes = fakeSupport(tickets: [ticket('1')]);
      fakes.picker.result = [const PickedPhoto('/tmp/a.jpg')];
      fakes.uploader.failWith = ApiException('Only JPEG, PNG or WebP images are allowed.');
      await pumpApp(t, 'fr', const SupportThreadScreen(ticketId: '1'));
      await t.tap(find.byKey(const ValueKey('attach-photo')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('photo-camera')));
      await t.pumpAndSettle();
      expect(fakes.picker.asked, ['camera:6']);
      await t.enterText(find.byKey(const ValueKey('thread-input')), 'Voici la photo');
      await t.tap(find.byKey(const ValueKey('thread-send')));
      await t.pumpAndSettle();
      expect(find.text('Seules les images JPEG, PNG ou WebP sont acceptées.'), findsOneWidget);
      expect(fakes.api.calls.where((c) => c.startsWith('reply')), isEmpty);
      expect(t.widget<TextField>(find.byKey(const ValueKey('thread-input'))).controller!.text, 'Voici la photo');
      expect(find.byKey(const ValueKey('remove-photo-/tmp/a.jpg')), findsOneWidget, reason: 'the photo stays attached');

      fakes.picker.failWith = StateError('permission');
      await t.pump(const Duration(seconds: 6)); // the error snackbar leaves the composer free
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('attach-photo')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('photo-gallery')));
      await t.pumpAndSettle();
      expect(find.text(const Strings('fr').errPhotoPick), findsOneWidget);
    });

    testWidgets('a server error on reply is shown in French', (t) async {
      final fakes = fakeSupport(tickets: [ticket('1')]);
      fakes.api.failWith = ApiException('Ticket not found.');
      await pumpApp(t, 'fr', const SupportThreadScreen(ticketId: '1'));
      await t.enterText(find.byKey(const ValueKey('thread-input')), 'Bonjour');
      await t.tap(find.byKey(const ValueKey('thread-send')));
      await t.pumpAndSettle();
      expect(find.text('Ticket introuvable.'), findsOneWidget);
    });

    for (final status in ['closed', 'resolved']) {
      for (final lang in ['en', 'fr']) {
        testWidgets('a $status ticket has no composer: a note and "Open a new ticket" instead ($lang)', (t) async {
          fakeSupport(tickets: [ticket('1', status: status)]);
          await pumpApp(t, lang, const SupportThreadScreen(ticketId: '1'));
          final s = Strings(lang);
          expect(find.byKey(const ValueKey('thread-input')), findsNothing);
          expect(find.byKey(const ValueKey('thread-send')), findsNothing);
          expect(find.byKey(const ValueKey('attach-photo')), findsNothing);
          expect(find.byKey(const ValueKey('thread-closed')), findsOneWidget);
          expect(find.textContaining(status == 'closed' ? s.ticketClosed.toLowerCase() : s.ticketResolved.toLowerCase()), findsOneWidget);
          expect(find.text(s.supportOpenNew), findsOneWidget);
          expectButtonRules(t);
          // its messages are still readable
          expect(find.text('Merci, nous le contactons.'), findsOneWidget);
          // the button opens the new-ticket form
          await t.tap(find.byKey(const ValueKey('thread-new-ticket')));
          await t.pumpAndSettle();
          expect(find.byKey(const ValueKey('ticket-subject')), findsOneWidget);
        });
      }
    }

    testWidgets('live: a support:updated push adds the message, flips the ticket closed (composer replaced) and a reply read while open is marked read', (t) async {
      final fakes = fakeSupport(tickets: [ticket('1')]);
      await pumpApp(t, 'en', const SupportThreadScreen(ticketId: '1'));
      expect(find.byKey(const ValueKey('thread-input')), findsOneWidget);

      final msgs = ticket('1').messages.map((m) => {'id': m.id, 'from': m.from, 'fromId': m.fromId, 'role': m.role, 'text': m.text, 'at': m.at!.toIso8601String(), 'attachments': m.attachments}).toList()
        ..add({'id': 'm3', 'from': 'Marie Support', 'fromId': 'a1', 'role': 'admin_support', 'text': 'Nouveau message en direct', 'at': '2026-10-25T09:30:00.000Z', 'attachments': <String>[]});
      fakes.api.tickets[0] = ticket('1', unread: 1, messages: msgs);
      SupportStore.instance.applyPush(ticketJson('1', unread: 1, messages: msgs));
      await t.pumpAndSettle();
      expect(find.text('Nouveau message en direct'), findsOneWidget);
      expect(fakes.api.calls, contains('markRead:1'), reason: 'the rider is looking at it');
      expect(SupportStore.instance.unread, 0);

      SupportStore.instance.applyPush(ticketJson('1', status: 'resolved', messages: msgs));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('thread-input')), findsNothing);
      expect(find.byKey(const ValueKey('thread-closed')), findsOneWidget);
    });

    testWidgets('a ticket the list does not have yet (notice tap) is fetched; a failure shows a retry', (t) async {
      final fakes = fakeSupport(tickets: [ticket('7')]);
      SupportStore.instance.tickets.clear();
      fakes.api.failWith = ApiException('Ticket not found.');
      await pumpApp(t, 'fr', const SupportThreadScreen(ticketId: '7'));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('thread-error')), findsOneWidget);
      expect(find.text('Ticket introuvable.'), findsWidgets);
      fakes.api.failWith = null;
      await t.tap(find.byKey(const ValueKey('thread-retry')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('thread-subject')), findsOneWidget);
    });
  });

  group('open a ticket', () {
    Future<SupportTicket?> openForm(WidgetTester t, String lang) async {
      SupportTicket? result;
      await pumpApp(
        t,
        lang,
        Builder(
          builder: (ctx) => Scaffold(body: TextButton(key: const ValueKey('go'), onPressed: () async => result = await openNewTicket(ctx), child: const Text('go'))),
        ),
      );
      await t.tap(find.byKey(const ValueKey('go')));
      await t.pumpAndSettle();
      return result;
    }

    testWidgets('subject and message are required: inline errors, a snackbar, and nothing is sent', (t) async {
      final fakes = fakeSupport();
      await openForm(t, 'en');
      await t.tap(find.byKey(const ValueKey('ticket-submit')));
      await t.pump(const Duration(milliseconds: 300));
      Finder inline(String key, String text) => find.descendant(of: find.byKey(ValueKey(key)), matching: find.text(text));
      expect(inline('ticket-subject', Strings('en').ticketSubjectRequired), findsOneWidget);
      expect(inline('ticket-message', Strings('en').ticketMessageRequired), findsOneWidget);
      expect(find.text(Strings('en').ticketSubjectRequired), findsNWidgets(2), reason: 'inline under the field, and a snackbar');
      expect(fakes.api.calls.where((c) => c.startsWith('open')), isEmpty);
      await t.enterText(find.byKey(const ValueKey('ticket-subject')), 'Sujet');
      await t.pump();
      expect(inline('ticket-subject', Strings('en').ticketSubjectRequired), findsNothing, reason: 'the error clears as the rider types');
    });

    testWidgets('sends subject, message, category, the chosen task order and the uploaded photos, then closes with the ticket', (t) async {
      final fakes = fakeSupport();
      fakes.picker.result = [const PickedPhoto('/tmp/a.jpg'), const PickedPhoto('/tmp/b.jpg')];
      SupportTicket? result;
      await pumpApp(
        t,
        'en',
        Builder(
          builder: (ctx) => Scaffold(body: TextButton(key: const ValueKey('go'), onPressed: () async => result = await openNewTicket(ctx), child: const Text('go'))),
        ),
      );
      await t.tap(find.byKey(const ValueKey('go')));
      await t.pumpAndSettle();
      await t.enterText(find.byKey(const ValueKey('ticket-subject')), 'Colis abîmé');
      await t.enterText(find.byKey(const ValueKey('ticket-message')), 'Le carton est écrasé.');
      await t.tap(find.byKey(const ValueKey('cat-delivery')));
      await t.pump();
      // the order list has one entry per order among my tasks
      await t.tap(find.byKey(const ValueKey('ticket-order')));
      await t.pumpAndSettle();
      await t.tap(find.text('SOM-1042').last);
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('ticket-add-photos')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('photo-gallery')));
      await t.pumpAndSettle();
      await t.ensureVisible(find.byKey(const ValueKey('ticket-submit')));
      await t.tap(find.byKey(const ValueKey('ticket-submit')));
      await t.pumpAndSettle();
      final call = fakes.api.calls.firstWhere((c) => c.startsWith('open:'));
      expect(call, startsWith('open:Colis abîmé|Le carton est écrasé.|delivery|o-c|'));
      expect(call, contains('/uploads/22222222-2222-2222-2222-222222222221.jpg,'));
      expect(fakes.uploader.uploaded, ['/tmp/a.jpg', '/tmp/b.jpg']);
      expect(result, isNotNull);
      expect(result!.subject, 'Colis abîmé');
      expect(find.byKey(const ValueKey('ticket-subject')), findsNothing, reason: 'the form closed');
      expect(find.text(Strings('en').ticketSent), findsOneWidget);
      expect(SupportStore.instance.byId(result!.id), isNotNull, reason: 'the list shows it at once');
    });

    testWidgets('the order picker offers each order once, and the field is hidden when the rider has no task', (t) async {
      fakeSupport();
      await openForm(t, 'fr');
      await t.tap(find.byKey(const ValueKey('ticket-order')));
      await t.pumpAndSettle();
      expect(find.text(const Strings('fr').ticketOrderNone), findsWidgets);
      expect(find.text('SOM-1042'), findsNWidgets(3), reason: 'three tasks of three orders (ids differ), listed once each');
      await t.tapAt(const Offset(5, 5));
      await t.pumpAndSettle();

      RiderStore.instance.myTasks.clear();
      t.state<NavigatorState>(find.byType(Navigator)).pop();
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('go')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('ticket-order')), findsNothing);
    });

    testWidgets('a server error is shown (in French) and the form stays filled', (t) async {
      final fakes = fakeSupport();
      fakes.api.failWith = ApiException('Order not found.');
      await openForm(t, 'fr');
      await t.enterText(find.byKey(const ValueKey('ticket-subject')), 'Sujet');
      await t.enterText(find.byKey(const ValueKey('ticket-message')), 'Message');
      await t.tap(find.byKey(const ValueKey('ticket-submit')));
      await t.pumpAndSettle();
      expect(find.text('Commande introuvable.'), findsOneWidget);
      expect(find.byKey(const ValueKey('ticket-subject')), findsOneWidget);
      expect(t.widget<TextField>(find.byKey(const ValueKey('ticket-message'))).controller!.text, 'Message');
    });

    testWidgets('at most 6 photos', (t) async {
      final fakes = fakeSupport();
      fakes.picker.result = [for (var i = 0; i < 6; i++) PickedPhoto('/tmp/$i.jpg')];
      await openForm(t, 'en');
      await t.ensureVisible(find.byKey(const ValueKey('ticket-add-photos')));
      await t.tap(find.byKey(const ValueKey('ticket-add-photos')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const ValueKey('photo-gallery')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('remove-photo-/tmp/5.jpg')), findsOneWidget);
      await t.ensureVisible(find.byKey(const ValueKey('ticket-add-photos')));
      await t.tap(find.byKey(const ValueKey('ticket-add-photos')));
      await t.pumpAndSettle();
      expect(find.byKey(const ValueKey('photo-gallery')), findsNothing, reason: 'no sheet: the limit is reached');
      expect(find.text(Strings('en').photoLimit(6)), findsOneWidget);
    });

    testWidgets('one filled primary button and label-only buttons on the form (FR)', (t) async {
      fakeSupport();
      await openForm(t, 'fr');
      expectButtonRules(t);
    });
  });
}
