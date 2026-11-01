// Product Q&A: answered / unanswered state, live pushes, translation, asking (success and failure), and the
// "Your question was answered" notice opening the product.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/screens/more/account_more.dart';
import 'package:lipcart/screens/more/engage_qa.dart';
import 'package:lipcart/screens/notice_router.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/engage_store.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'button_rules.dart';
import 'engage_helpers.dart';
import 'gap_helpers.dart';

final _answered = {
  'id': 'q1',
  'productId': 'p1',
  'askerId': 'u1',
  'sellerId': 's1',
  'question': 'Does the 42 fit a wide foot?',
  'answer': 'Yes, the toe box is wide.',
  'createdAt': '2026-10-24T09:00:00.000Z',
  'answeredAt': '2026-10-25T10:30:00.000Z',
};
final _waiting = {'id': 'q2', 'productId': 'p1', 'askerId': 'u9', 'sellerId': 's1', 'question': 'Is it waterproof?', 'answer': null, 'createdAt': '2026-10-25T08:00:00.000Z'};

/// Records the calls and answers `questions:list` from [rows].
class _Server {
  _Server(this.rows);
  List<Map<String, dynamic>> rows;
  final calls = <String>[];
  Map<String, dynamic>? lastAsk;
  Object? askError;
  Object? listError;

  Future<dynamic> handle(String event, [Map<String, dynamic>? body]) async {
    calls.add(event);
    switch (event) {
      case 'questions:list':
        if (listError != null) throw listError!;
        return rows;
      case 'questions:ask':
        lastAsk = body;
        if (askError != null) throw askError!;
        return {'id': 'q-new', 'productId': body!['productId'], 'askerId': 'u1', 'question': body['question'], 'answer': null, 'createdAt': '2026-10-25T12:00:00.000Z'};
      default:
        return const <dynamic>[];
    }
  }

  int get lists => calls.where((c) => c == 'questions:list').length;
}

Future<_Server> _section(WidgetTester tester, List<Map<String, dynamic>> rows, {String lang = 'en', double scale = 1}) async {
  gapTallViewport(tester);
  await engageReset(products: [engageDto('p1')], lang: lang);
  final server = _Server(rows);
  RealtimeStore.instance.debugCallRequest = server.handle;
  await tester.pumpWidget(gapAppScaled(Scaffold(body: ListView(padding: const EdgeInsets.all(16), children: [QaSection(product: productOf('p1'))])), lang: lang, scale: scale));
  await tester.pump();
  await tester.pump();
  return server;
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(() {
    RealtimeStore.instance.debugTranslateRequest = null;
    engageTearDown();
  });

  group('the list', () {
    testWidgets('answered and unanswered questions, the seller\'s answer and when it was given', (tester) async {
      await _section(tester, [_answered, _waiting]);
      expect(find.text('Does the 42 fit a wide foot?'), findsOneWidget);
      expect(find.text('Is it waterproof?'), findsOneWidget);
      expect(find.text('Yes, the toe box is wide.'), findsOneWidget);
      expect(find.text('Seller’s answer'), findsOneWidget);
      expect(find.text('Answered on Oct 25, 2026'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('qa-state-q1')), matching: find.text('Answered')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('qa-state-q2')), matching: find.text('Awaiting answer')), findsOneWidget);
      expect(find.byKey(const ValueKey('qa-answer-q2')), findsNothing);
    });

    testWidgets('in French', (tester) async {
      await _section(tester, [_answered, _waiting], lang: 'fr');
      expect(find.text('Questions et réponses'), findsOneWidget);
      expect(find.text('Réponse du vendeur'), findsOneWidget);
      expect(find.text('Répondu le 25 oct. 2026'), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('qa-state-q1')), matching: find.text('Répondu')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('qa-state-q2')), matching: find.text('En attente de réponse')), findsOneWidget);
    });

    testWidgets('the asker\'s own question is marked', (tester) async {
      await _section(tester, [_answered, _waiting]);
      expect(find.byKey(const ValueKey('qa-mine-q1')), findsOneWidget, reason: 'u1 is the signed-in customer');
      expect(find.byKey(const ValueKey('qa-mine-q2')), findsNothing);
      expect(find.text('Your question'), findsOneWidget);
    });

    testWidgets('an old payload (no productId, askerId, answeredAt) still shows, without a date', (tester) async {
      await _section(tester, [
        {'id': 'q3', 'question': 'Old question?', 'answer': 'Old answer.'}
      ]);
      expect(find.text('Old question?'), findsOneWidget);
      expect(find.text('Old answer.'), findsOneWidget);
      expect(find.byKey(const ValueKey('qa-answered-at-q3')), findsNothing);
    });

    testWidgets('no question yet', (tester) async {
      await _section(tester, []);
      expect(find.text('No questions yet.'), findsOneWidget);
    });

    testWidgets('a long question and answer in French at 130% text on a narrow phone do not overflow', (tester) async {
      tester.view.physicalSize = const Size(360 * 3, 780 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      await engageReset(products: [engageDto('p1')], lang: 'fr');
      final server = _Server([
        {..._answered, 'question': 'Est-ce que la pointure 42 convient à un pied large avec une semelle orthopédique amovible ?', 'answer': 'Oui, l’avant du pied est large et la semelle d’origine se retire sans outil pour installer la vôtre.'},
        _waiting,
      ]);
      RealtimeStore.instance.debugCallRequest = server.handle;
      await tester.pumpWidget(gapAppScaled(Scaffold(body: ListView(padding: const EdgeInsets.all(16), children: [QaSection(product: productOf('p1'))])), lang: 'fr', scale: 1.3));
      await tester.pump();
      await tester.pump();
      expect(tester.takeException(), isNull);
    });
  });

  group('live updates', () {
    testWidgets('question:updated shows the seller\'s answer without leaving the page', (tester) async {
      final server = await _section(tester, [_answered, _waiting]);
      expect(find.text('Is it waterproof?'), findsOneWidget);
      expect(find.byKey(const ValueKey('qa-answer-q2')), findsNothing);
      RealtimeStore.instance.debugEmit('question:updated', {..._waiting, 'answer': 'Yes, it is splash proof.', 'answeredAt': '2026-10-25T11:45:00.000Z'});
      await tester.pump();
      expect(find.text('Yes, it is splash proof.'), findsOneWidget);
      expect(find.byKey(const ValueKey('qa-answer-q2')), findsOneWidget);
      expect(find.descendant(of: find.byKey(const ValueKey('qa-state-q2')), matching: find.text('Answered')), findsOneWidget);
      expect(server.lists, 1, reason: 'the push carries the question: no new request');
    });

    testWidgets('question:created adds the question at the top; the same question twice is shown once', (tester) async {
      await _section(tester, [_answered]);
      final fresh = {'id': 'q7', 'productId': 'p1', 'askerId': 'u5', 'question': 'Brand new question?', 'answer': null};
      RealtimeStore.instance.debugEmit('question:created', fresh);
      await tester.pump();
      RealtimeStore.instance.debugEmit('question:created', fresh);
      await tester.pump();
      expect(find.text('Brand new question?'), findsOneWidget);
      expect(tester.getTopLeft(find.text('Brand new question?')).dy, lessThan(tester.getTopLeft(find.text('Does the 42 fit a wide foot?')).dy));
    });

    testWidgets('a question about another product is ignored', (tester) async {
      final server = await _section(tester, [_answered]);
      RealtimeStore.instance.debugEmit('question:created', {'id': 'q8', 'productId': 'other', 'question': 'Not here?'});
      RealtimeStore.instance.debugEmit('question:updated', {'id': 'q9', 'productId': 'other', 'question': 'Nor here?', 'answer': 'No.'});
      await tester.pump();
      expect(find.text('Not here?'), findsNothing);
      expect(find.text('Nor here?'), findsNothing);
      expect(server.lists, 1);
    });

    testWidgets('a push that does not name its product (older server) makes the page ask again', (tester) async {
      final server = await _section(tester, [_answered]);
      server.rows = [_answered, _waiting];
      RealtimeStore.instance.debugEmit('question:created', {'id': 'q2', 'question': 'Is it waterproof?'});
      await tester.pump();
      await tester.pump();
      expect(server.lists, 2);
      expect(find.text('Is it waterproof?'), findsOneWidget);
    });

    testWidgets('a junk push is ignored', (tester) async {
      await _section(tester, [_answered]);
      RealtimeStore.instance.debugEmit('question:updated', 'nope');
      RealtimeStore.instance.debugEmit('question:updated', {'question': 'no id'});
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(find.text('Does the 42 fit a wide foot?'), findsOneWidget);
    });

    testWidgets('on the product page itself', (tester) async {
      gapTallViewport(tester);
      await engageReset(products: [engageDto('p1')]);
      final server = _Server([_waiting]);
      RealtimeStore.instance.debugCallRequest = server.handle;
      await tester.pumpWidget(gapApp(ProductDetailScreen(product: productOf('p1'), locale: const Locale('en'))));
      await tester.pump();
      await tester.pump();
      expect(find.text('Is it waterproof?'), findsOneWidget);
      RealtimeStore.instance.debugEmit('question:updated', {..._waiting, 'answer': 'It is.', 'answeredAt': '2026-10-25T11:45:00.000Z'});
      await tester.pump();
      expect(find.text('It is.'), findsOneWidget);
    });
  });

  group('translation', () {
    testWidgets('an answer has a "See translation" link that swaps the text', (tester) async {
      await _section(tester, [_answered]);
      RealtimeStore.instance.debugTranslateRequest = (event, [body]) async {
        expect(body, {'kind': 'answer', 'id': 'q1', 'target': 'en'});
        return {'text': 'Yes, the front of the shoe is wide.', 'sourceLang': 'fr', 'same': false};
      };
      await tester.tap(find.byKey(const ValueKey('tt-link-answer-q1')));
      await tester.pump();
      await tester.pump();
      expect(find.text('Yes, the front of the shoe is wide.'), findsOneWidget);
      expect(find.text('See original'), findsWidgets);
    });

    testWidgets('the question can be translated too', (tester) async {
      await _section(tester, [_waiting]);
      expect(find.byKey(const ValueKey('tt-link-question-q2')), findsOneWidget);
      expect(find.byKey(const ValueKey('tt-link-answer-q2')), findsNothing, reason: 'nothing to translate before the answer exists');
    });
  });

  group('asking a question', () {
    Future<void> openSheet(WidgetTester tester) async {
      await tester.tap(find.byKey(const ValueKey('qa-ask')));
      await tester.pumpAndSettle();
    }

    testWidgets('success: the question is sent, announced, and shown (once, even when the push arrives too)', (tester) async {
      final server = await _section(tester, [_answered]);
      await openSheet(tester);
      expect(find.text('Ask a question'), findsOneWidget);
      await tester.enterText(find.byKey(const ValueKey('qa-field')), '  Is the sole non-slip?  ');
      await tester.tap(find.text('Submit question'));
      await tester.pump();
      await tester.pumpAndSettle();
      expect(server.lastAsk, {'productId': 'p1', 'question': 'Is the sole non-slip?'});
      expect(find.text('Question sent to the seller'), findsOneWidget);
      expect(find.text('Is the sole non-slip?'), findsOneWidget);
      expect(find.text('Ask a question'), findsNothing, reason: 'the sheet closed');
      // The server also pushes it to every shopper, us included.
      RealtimeStore.instance.debugEmit('question:created', {'id': 'q-new', 'productId': 'p1', 'askerId': 'u1', 'question': 'Is the sole non-slip?', 'answer': null});
      await tester.pump();
      expect(find.text('Is the sole non-slip?'), findsOneWidget);
      expect(find.byKey(const ValueKey('qa-mine-q-new')), findsOneWidget);
    });

    testWidgets('success in French', (tester) async {
      await _section(tester, [], lang: 'fr');
      await openSheet(tester);
      expect(find.text('Poser une question'), findsWidgets);
      await tester.enterText(find.byKey(const ValueKey('qa-field')), 'La semelle est-elle antidérapante ?');
      await tester.tap(find.text('Envoyer la question'));
      await tester.pumpAndSettle();
      expect(find.text('Question envoyée au vendeur'), findsOneWidget);
    });

    testWidgets('an empty question: inline error and a snackbar, nothing is sent', (tester) async {
      final server = await _section(tester, []);
      await openSheet(tester);
      await tester.tap(find.text('Submit question'));
      await tester.pump();
      expect(find.text('Write your question first.'), findsWidgets);
      expect(find.byType(TextField), findsOneWidget);
      expect(server.lastAsk, isNull);
      expect(find.text('Ask a question'), findsOneWidget, reason: 'the sheet stays open');
      // Too short counts as empty (the server wants at least 3 characters).
      await tester.enterText(find.byKey(const ValueKey('qa-field')), 'ab');
      await tester.tap(find.text('Submit question'));
      await tester.pump();
      expect(server.lastAsk, isNull);
      // Typing clears the inline error.
      await tester.enterText(find.byKey(const ValueKey('qa-field')), 'abc');
      await tester.pump();
      expect(find.descendant(of: find.byType(TextField), matching: find.text('Write your question first.')), findsNothing);
    });

    testWidgets('an empty question in French', (tester) async {
      await _section(tester, [], lang: 'fr');
      await openSheet(tester);
      await tester.tap(find.text('Envoyer la question'));
      await tester.pump();
      expect(find.text('Écrivez d’abord votre question.'), findsWidgets);
    });

    testWidgets('a server refusal keeps what was typed, shows the message inline and in a snackbar (English and French)', (tester) async {
      final server = await _section(tester, []);
      server.askError = ApiException('Sign in to continue.');
      await openSheet(tester);
      await tester.enterText(find.byKey(const ValueKey('qa-field')), 'Is it original?');
      await tester.tap(find.text('Submit question'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Sign in to continue.'), findsWidgets);
      expect(find.descendant(of: find.byType(TextField), matching: find.text('Sign in to continue.')), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).controller!.text, 'Is it original?');
      expect(find.text('Ask a question'), findsOneWidget);
      expect(find.byType(SnackBar), findsOneWidget);
      // The button is usable again (not stuck on its spinner).
      server.askError = null;
      await tester.tap(find.text('Submit question'));
      await tester.pumpAndSettle();
      expect(find.text('Question sent to the seller'), findsOneWidget);
    });

    testWidgets('the French refusal', (tester) async {
      final server = await _section(tester, [], lang: 'fr');
      server.askError = ApiException('Write your question first.');
      await openSheet(tester);
      await tester.enterText(find.byKey(const ValueKey('qa-field')), 'Une question');
      await tester.tap(find.text('Envoyer la question'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Écrivez d’abord votre question.'), findsWidgets);
    });

    testWidgets('an offline failure speaks too', (tester) async {
      final server = await _section(tester, []);
      server.askError = ApiException.local('err_offline');
      await openSheet(tester);
      await tester.enterText(find.byKey(const ValueKey('qa-field')), 'Is it original?');
      await tester.tap(find.text('Submit question'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Can’t reach the server. Check your internet connection.'), findsWidgets);
    });

    testWidgets('one primary button on the sheet and none carries an icon', (tester) async {
      await _section(tester, []);
      await openSheet(tester);
      expectButtonRules(tester);
    });
  });

  group('loading', () {
    testWidgets('a failing load says so (snackbar and inline) and Try again loads it', (tester) async {
      gapTallViewport(tester);
      await engageReset(products: [engageDto('p1')]);
      final server = _Server([_answered])..listError = ApiException('Product not found.');
      RealtimeStore.instance.debugCallRequest = server.handle;
      await tester.pumpWidget(gapApp(Scaffold(body: ListView(children: [QaSection(product: productOf('p1'))]))));
      await tester.pump();
      await tester.pump();
      expect(find.text('Couldn’t load the questions.'), findsOneWidget);
      expect(find.text('Product not found.'), findsOneWidget, reason: 'the snackbar');
      server.listError = null;
      await tester.tap(find.byKey(const ValueKey('qa-retry')));
      await tester.pump();
      await tester.pump();
      expect(find.text('Does the 42 fit a wide foot?'), findsOneWidget);
      expect(find.text('Couldn’t load the questions.'), findsNothing);
    });
  });

  group('the "Your question was answered" notice', () {
    test('its entityId is the product id: the route is the product page', () {
      expect(noticeRoute('question', 'p1', hasOrder: (_) => false), const NoticeRoute(NoticeDest.product, 'p1'));
      expect(noticeRoute('question', null, hasOrder: (_) => false), const NoticeRoute(NoticeDest.notifications));
      expect(noticeRoute('flash', 'f1', hasOrder: (_) => false), const NoticeRoute(NoticeDest.deals));
    });

    testWidgets('openNotice opens the product page', (tester) async {
      gapTallViewport(tester);
      await engageReset(products: [engageDto('p1')]);
      RealtimeStore.instance.debugCallRequest = _Server([_answered]).handle;
      final nav = GlobalKey<NavigatorState>();
      await tester.pumpWidget(MaterialApp(navigatorKey: nav, home: const Scaffold(body: SizedBox())));
      openNotice(nav.currentState!, const Locale('en'), type: 'question', entityId: 'p1');
      await tester.pumpAndSettle();
      expect(find.byType(ProductDetailScreen), findsOneWidget);
      expect(find.text('Item p1'), findsWidgets);
    });

    testWidgets('a product that is gone falls back to the notifications list', (tester) async {
      gapTallViewport(tester);
      await engageReset(products: [engageDto('p1')]);
      final nav = GlobalKey<NavigatorState>();
      await tester.pumpWidget(MaterialApp(navigatorKey: nav, home: const Scaffold(body: SizedBox())));
      openNotice(nav.currentState!, const Locale('en'), type: 'question', entityId: 'gone');
      await tester.pumpAndSettle();
      expect(find.byType(ProductDetailScreen), findsNothing);
      expect(find.byType(NotificationsScreen), findsOneWidget);
    });

    testWidgets('a flash notice opens the deals page', (tester) async {
      gapTallViewport(tester);
      await engageReset(products: [engageDto('p1')]);
      final nav = GlobalKey<NavigatorState>();
      await tester.pumpWidget(MaterialApp(navigatorKey: nav, home: const Scaffold(body: SizedBox())));
      openNotice(nav.currentState!, const Locale('en'), type: 'flash', entityId: 'f1');
      await tester.pumpAndSettle();
      expect(find.text('Deals'), findsWidgets);
    });
  });

  test('the store keeps the latest question event for the open page', () {
    final store = EngageStore.instance;
    RealtimeStore.instance.debugEmit('question:created', _waiting);
    expect(store.questionEvents.value!.created, isTrue);
    expect(store.questionEvents.value!.question.id, 'q2');
    RealtimeStore.instance.debugEmit('question:updated', _answered);
    expect(store.questionEvents.value!.created, isFalse);
    store.reset();
    expect(store.questionEvents.value, isNull);
  });
}
