// Translations that arrive with the data: `TextI18n` parsing (tolerant), the DTOs that carry it, and the
// `TranslatableText` rule - payload first (no request, instant language switch), the on-demand fetch only without it.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/product_detail_screen.dart' show reviewTile;
import 'package:lipcart/services/chat_store.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/text_i18n.dart';
import 'package:lipcart/widgets/translatable_text.dart';

import 'engage_helpers.dart' show gapAppScaled;
import 'gap_helpers.dart';

final _asked = <Map<String, dynamic>>[];

Future<dynamic> _fakeTranslate(String event, [Map<String, dynamic>? body]) async {
  _asked.add(body!);
  return {'text': body['target'] == 'fr' ? 'Texte du serveur' : 'Server text', 'sourceLang': body['target'] == 'fr' ? 'en' : 'fr', 'same': false};
}

void main() {
  setUpAll(() async {
    await gapLoadFonts();
  });
  setUp(() {
    _asked.clear();
    RealtimeStore.instance.debugTranslateRequest = _fakeTranslate;
    RealtimeStore.instance.translationAvailable = true;
  });
  tearDown(() {
    RealtimeStore.instance.debugTranslateRequest = null;
    RealtimeStore.instance.debugClearTranslations();
  });

  group('TextI18n.tryParse', () {
    test('reads sourceLang, en and fr', () {
      final t = TextI18n.tryParse({'sourceLang': 'FR', 'en': 'Hello', 'fr': 'Bonjour'})!;
      expect((t.sourceLang, t.en, t.fr), ('fr', 'Hello', 'Bonjour'));
      expect(t.forLang('en'), 'Hello');
      expect(t.forLang('fr'), 'Bonjour');
      expect(t.forLang('sw'), isNull);
    });

    test('a language that is missing, blank or not a string is just absent', () {
      final t = TextI18n.tryParse({'sourceLang': null, 'en': 'Hello', 'fr': '  '})!;
      expect(t.sourceLang, isNull);
      expect(t.fr, isNull);
      expect(TextI18n.tryParse({'en': 5, 'fr': 'Salut'})!.en, isNull);
      expect(TextI18n.tryParse({'en': 'Hi'})!.sourceLang, isNull, reason: 'sourceLang is optional');
    });

    test('anything that is not a usable object is "no translations"', () {
      for (final odd in [null, 'text', 3, <dynamic>[], <String, dynamic>{}, {'sourceLang': 'fr'}, {'en': '', 'fr': null}]) {
        expect(TextI18n.tryParse(odd), isNull, reason: '$odd');
      }
    });

    test('equal contents are equal', () {
      expect(TextI18n.tryParse({'sourceLang': 'en', 'en': 'a'}), TextI18n.tryParse({'sourceLang': 'en', 'en': 'a'}));
      expect(TextI18n.tryParse({'sourceLang': 'en', 'en': 'a'}), isNot(TextI18n.tryParse({'sourceLang': 'fr', 'en': 'a'})));
    });
  });

  group('DTOs carry the translations (and old payloads still parse)', () {
    test('review: textI18n and replyI18n', () {
      final r = ReviewDto.fromJson({
        'id': 'r1',
        'author': 'Jo',
        'rating': 5,
        'text': 'Super',
        'sellerReply': 'Merci',
        'textI18n': {'sourceLang': 'fr', 'en': 'Great', 'fr': 'Super'},
        'replyI18n': {'sourceLang': 'fr', 'en': 'Thanks', 'fr': 'Merci'},
      });
      expect(r.textI18n!.en, 'Great');
      expect(r.replyI18n!.en, 'Thanks');
      final old = ReviewDto.fromJson({'id': 'r2', 'text': 'x', 'textI18n': 'oops', 'replyI18n': 7});
      expect(old.textI18n, isNull);
      expect(old.replyI18n, isNull);
      expect(ReviewDto.fromJson({'id': 'r3'}).textI18n, isNull);
    });

    test('question: questionI18n and answerI18n', () {
      final q = QuestionDto.fromJson({
        'id': 'q1',
        'question': 'Étanche ?',
        'answer': 'Oui',
        'questionI18n': {'sourceLang': 'fr', 'en': 'Waterproof?', 'fr': 'Étanche ?'},
        'answerI18n': {'sourceLang': 'fr', 'en': 'Yes'},
      });
      expect(q.questionI18n!.forLang('en'), 'Waterproof?');
      expect(q.answerI18n!.forLang('fr'), isNull, reason: 'a key is only there when the value exists');
      final bare = QuestionDto.fromJson({'id': 'q2', 'question': 'x'});
      expect(bare.questionI18n, isNull);
      expect(bare.answerI18n, isNull);
    });

    test('chat message: textI18n', () {
      final m = ChatMessage.fromJson({'id': 'm1', 'text': 'Bonjour', 'textI18n': {'sourceLang': 'fr', 'en': 'Hello', 'fr': 'Bonjour'}});
      expect(m.textI18n!.en, 'Hello');
      expect(ChatMessage.fromJson({'id': 'm2', 'text': 'x'}).textI18n, isNull);
      expect(ChatMessage.fromJson({'id': 'm3', 'text': 'x', 'textI18n': []}).textI18n, isNull);
    });

    test('conversation preview: the payload text for the language, else the preview as sent', () {
      final c = ChatConversation(id: 'c', lastMessagePreview: 'Bonjour', lastMessageI18n: const TextI18n(sourceLang: 'fr', en: 'Hello', fr: 'Bonjour'));
      expect(c.previewFor('en'), 'Hello');
      expect(c.previewFor('fr'), 'Bonjour');
      expect(const ChatConversation(id: 'c', lastMessagePreview: 'Bonjour').previewFor('en'), 'Bonjour');
      expect(c.copyWith(unread: 2).lastMessageI18n, c.lastMessageI18n, reason: 'a copy keeps it');
      expect(c.copyWith(lastMessageI18n: null).lastMessageI18n, isNull, reason: 'and can clear it');
    });
  });

  group('TranslatableText with the payload', () {
    Future<void> show(WidgetTester tester, Widget child, {String lang = 'en'}) async {
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: child)), lang: lang));
      await tester.pump();
      await tester.pump();
    }

    Widget tt({String text = 'Bonjour le monde', TextI18n? i18n, String id = 't1'}) =>
        TranslatableText(kind: 'review', id: id, auto: true, text: text, i18n: i18n, style: const TextStyle(fontSize: 14));

    Finder link(String id) => find.byKey(ValueKey('tt-link-review-$id'));
    String shown(WidgetTester tester, String id) => tester.widget<Text>(find.byKey(ValueKey('tt-text-review-$id'))).data!;

    const fromFrench = TextI18n(sourceLang: 'fr', en: 'Hello world', fr: 'Bonjour le monde');
    const fromEnglish = TextI18n(sourceLang: 'en', en: 'Hello world', fr: 'Bonjour le monde');

    testWidgets('the translation is shown at once, with the note and "See original", and no request', (tester) async {
      await show(tester, tt(i18n: fromFrench));
      expect(shown(tester, 't1'), 'Hello world');
      expect(find.text('Translated automatically'), findsOneWidget);
      expect(find.text('See original'), findsOneWidget);
      expect(_asked, isEmpty);
    });

    testWidgets('switching the app language swaps the text with no request, in both directions', (tester) async {
      await show(tester, tt(i18n: fromFrench));
      expect(shown(tester, 't1'), 'Hello world');

      await show(tester, tt(i18n: fromFrench), lang: 'fr');
      expect(shown(tester, 't1'), 'Bonjour le monde');
      expect(find.text('Translated automatically'), findsNothing, reason: 'written in French, read in French');
      expect(link('t1'), findsNothing);

      await show(tester, tt(i18n: fromEnglish, text: 'Hello world'), lang: 'fr');
      expect(shown(tester, 't1'), 'Bonjour le monde');
      expect(find.text('Traduit automatiquement'), findsOneWidget);
      expect(find.text('Voir l’original'), findsOneWidget);

      await show(tester, tt(i18n: fromFrench));
      expect(shown(tester, 't1'), 'Hello world');
      expect(_asked, isEmpty);
    });

    testWidgets('written in the app language: the written text, no note, no link, no request', (tester) async {
      await show(tester, tt(text: 'Hello world', i18n: fromEnglish));
      expect(shown(tester, 't1'), 'Hello world');
      expect(find.byType(MachineNote), findsNothing);
      expect(link('t1'), findsNothing);
      expect(_asked, isEmpty);
    });

    testWidgets('unknown source language: a value equal to the written text is not a translation, a different one is', (tester) async {
      await show(tester, tt(text: 'Hello world', i18n: const TextI18n(en: 'Hello world', fr: 'Bonjour le monde')));
      expect(find.byType(MachineNote), findsNothing);
      expect(link('t1'), findsNothing);
      await show(tester, tt(text: 'Bonjour le monde', i18n: const TextI18n(en: 'Hello world', fr: 'Bonjour le monde')));
      expect(shown(tester, 't1'), 'Hello world');
      expect(find.byType(MachineNote), findsOneWidget);
      expect(link('t1'), findsOneWidget);
    });

    testWidgets('"See original" shows the written text and sticks until the language changes', (tester) async {
      await show(tester, tt(i18n: fromFrench));
      await tester.tap(link('t1'));
      await tester.pump();
      expect(shown(tester, 't1'), 'Bonjour le monde');
      expect(find.text('See translation'), findsOneWidget);
      expect(find.byType(MachineNote), findsNothing);
      await tester.pump(const Duration(seconds: 1));
      expect(shown(tester, 't1'), 'Bonjour le monde', reason: 'stays on the written text');
      expect(_asked, isEmpty);

      await tester.tap(link('t1'));
      await tester.pump();
      expect(shown(tester, 't1'), 'Hello world', reason: 'the link brings the translation back, with no request');

      await tester.tap(link('t1'));
      await tester.pump();
      await show(tester, tt(i18n: const TextI18n(sourceLang: 'fr', en: 'Hello world', fr: 'Bonjour le monde'), text: 'Bonjour le monde'), lang: 'fr');
      await show(tester, tt(i18n: fromFrench));
      expect(shown(tester, 't1'), 'Hello world', reason: 'a language change starts again from the translation');
      expect(_asked, isEmpty);
    });

    testWidgets('a record replaced with the same translations keeps the shopper\'s choice; changed ones start again', (tester) async {
      await show(tester, tt(i18n: fromFrench));
      await tester.tap(link('t1'));
      await tester.pump();
      await show(tester, tt(i18n: const TextI18n(sourceLang: 'fr', en: 'Hello world', fr: 'Bonjour le monde')));
      expect(shown(tester, 't1'), 'Bonjour le monde');
      await show(tester, tt(i18n: const TextI18n(sourceLang: 'fr', en: 'Hello there', fr: 'Bonjour le monde')));
      expect(shown(tester, 't1'), 'Hello there');
    });

    testWidgets('no i18n at all: falls back to the automatic fetch, exactly as before', (tester) async {
      await show(tester, tt());
      expect(_asked, [
        {'kind': 'review', 'id': 't1', 'target': 'en'}
      ]);
      expect(shown(tester, 't1'), 'Server text');
      expect(find.text('Translated automatically'), findsOneWidget);
    });

    testWidgets('i18n without the app language: the fetch takes over; with it again no further request', (tester) async {
      await show(tester, tt(i18n: const TextI18n(sourceLang: 'fr', fr: 'Bonjour le monde')));
      expect(_asked.single['target'], 'en');
      expect(shown(tester, 't1'), 'Server text');
      await show(tester, tt(i18n: const TextI18n(sourceLang: 'fr', fr: 'Bonjour le monde')), lang: 'fr');
      expect(shown(tester, 't1'), 'Bonjour le monde');
      expect(_asked, hasLength(1), reason: 'French was in the payload');
    });

    testWidgets('a failing fetch stays silent and the written text stays; the payload path never touches the network', (tester) async {
      RealtimeStore.instance.debugTranslateRequest = (event, [body]) async => throw Exception('offline');
      await show(tester, tt());
      expect(shown(tester, 't1'), 'Bonjour le monde');
      expect(find.byType(SnackBar), findsNothing);
      expect(link('t1'), findsOneWidget, reason: 'the link can retry');
    });

    testWidgets('a service that is switched off does not stop the payload translation', (tester) async {
      RealtimeStore.instance.translationAvailable = false;
      await show(tester, tt(i18n: fromFrench));
      expect(shown(tester, 't1'), 'Hello world');
      expect(link('t1'), findsOneWidget);
    });

    testWidgets('survives 200% text scale in a narrow column', (tester) async {
      tester.view.physicalSize = const Size(320, 640);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      await Strings.setLang('en', persist: false);
      await tester.pumpWidget(gapAppScaled(Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: tt(i18n: fromFrench))), lang: 'en', scale: 2));
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(find.text('Translated automatically'), findsOneWidget);
    });
  });

  group('a review list', () {
    testWidgets('each review and seller reply follows the app language from its payload, with no request', (tester) async {
      final reviews = [
        ReviewDto.fromJson({
          'id': 'r1',
          'author': 'Jo',
          'rating': 5,
          'text': 'Super produit',
          'sellerReply': 'Merci Jo',
          'textI18n': {'sourceLang': 'fr', 'en': 'Great product', 'fr': 'Super produit'},
          'replyI18n': {'sourceLang': 'fr', 'en': 'Thanks Jo', 'fr': 'Merci Jo'},
        }),
        ReviewDto.fromJson({
          'id': 'r2',
          'author': 'Ann',
          'rating': 4,
          'text': 'Nice',
          'textI18n': {'sourceLang': 'en', 'en': 'Nice', 'fr': 'Sympa'},
        }),
      ];
      Widget list(String lang) => gapApp(Scaffold(body: ListView(children: [for (final r in reviews) reviewTile(r, Strings(lang))])), lang: lang);
      await Strings.setLang('en', persist: false);
      await tester.pumpWidget(list('en'));
      await tester.pump();
      await tester.pump();
      expect(find.text('Great product'), findsOneWidget);
      expect(find.text('Thanks Jo'), findsOneWidget);
      expect(find.text('Nice'), findsOneWidget);
      expect(find.text('Translated automatically'), findsNWidgets(2), reason: 'the French review and its reply; the English one is as written');

      await Strings.setLang('fr', persist: false);
      await tester.pumpWidget(list('fr'));
      await tester.pump();
      expect(find.text('Super produit'), findsOneWidget);
      expect(find.text('Merci Jo'), findsOneWidget);
      expect(find.text('Sympa'), findsOneWidget);
      expect(find.text('Traduit automatiquement'), findsOneWidget, reason: 'only the English review is machine French now');
      expect(_asked, isEmpty);
    });
  });
}
