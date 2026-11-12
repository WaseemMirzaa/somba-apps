// docs/contracts/stored-text-i18n.md, the fields of PR #152 on the customer app, shown with no tap: support tickets
// (subjectI18n, messages[].textI18n), returns and disputes (reasonI18n, sellerReasonI18n, resolutionI18n, thread textI18n),
// exchanges and replacements (reasonI18n, sellerReasonI18n). The translation for the app's language shows at once with the
// "Translated automatically" note and a "See original" link; text written in the app's language shows as it is; no request is
// made when the payload carries the translation, and an older payload falls back to the on-demand `translate:text`.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/screens/more/aftersale_status.dart';
import 'package:lipcart/screens/more/aftersale_widgets.dart';
import 'package:lipcart/screens/more/returns_extra.dart';
import 'package:lipcart/screens/more/support_screens.dart';
import 'package:lipcart/services/aftersale_models.dart';
import 'package:lipcart/services/aftersale_store.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/support_store.dart';
import 'package:lipcart/l10n/strings.dart';

import 'aftersale_helpers.dart';
import 'gap_helpers.dart';
import 'social_helpers.dart' as social;

Map<String, dynamic> _i18n(String src, String en, String fr) => {'sourceLang': src, 'en': en, 'fr': fr};

/// What `translate:text` was asked (a request means the payload did not carry the translation).
List<Map<String, dynamic>?> _watchTranslate() {
  final asked = <Map<String, dynamic>?>[];
  RealtimeStore.instance.debugTranslateRequest = (event, [body]) async {
    asked.add(body);
    return {'text': 'On-demand translation', 'sourceLang': 'fr', 'same': false};
  };
  return asked;
}

String _text(WidgetTester tester, String key) => tester.widget<Text>(find.byKey(ValueKey(key))).data!;

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });

  group('the models parse the translations', () {
    test('a return: reason, the old store answer, the resolution and each thread message', () {
      final d = DisputeView.fromJson({
        ...disputeJson(reason: 'La semelle s’est décollée', sellerReason: 'Usure normale', resolution: 'Remboursement accordé', messages: [
          {...msgJ('m1', role: 'admin_support', text: 'Nous regardons.'), 'textI18n': _i18n('fr', 'We are looking.', 'Nous regardons.')},
          msgJ('m2', role: 'customer', text: 'Merci'),
        ]),
        'reasonI18n': _i18n('fr', 'The sole came off', 'La semelle s’est décollée'),
        'sellerReasonI18n': _i18n('fr', 'Normal wear', 'Usure normale'),
        'resolutionI18n': _i18n('fr', 'Refund granted', 'Remboursement accordé'),
      });
      expect(d.reasonI18n!.en, 'The sole came off');
      expect(d.sellerReasonI18n!.forLang('fr'), 'Usure normale');
      expect(d.resolutionI18n!.sourceLang, 'fr');
      expect(d.messages![0].textI18n!.en, 'We are looking.');
      expect(d.messages![1].textI18n, isNull);
      expect(d.copyWith(messageCount: 2).reasonI18n, d.reasonI18n, reason: 'a copy keeps them');
      expect(d.keepingMessagesOf(d).resolutionI18n, d.resolutionI18n);
    });

    test('replacements and exchanges: reasonI18n and sellerReasonI18n', () {
      final r = ReplacementView.fromJson({...replacementJson(sellerReason: 'Non couvert'), 'reasonI18n': _i18n('fr', 'One shoe is torn', 'Une chaussure est déchirée'), 'sellerReasonI18n': _i18n('fr', 'Not covered', 'Non couvert')});
      expect((r.reasonI18n!.en, r.sellerReasonI18n!.en), ('One shoe is torn', 'Not covered'));
      final x = ExchangeView.fromJson({...exchangeJson(), 'reasonI18n': _i18n('fr', 'Too small', 'Trop petit'), 'sellerReasonI18n': _i18n('en', 'Out of stock', 'En rupture')});
      expect((x.reasonI18n!.fr, x.sellerReasonI18n!.sourceLang), ('Trop petit', 'en'));
    });

    test('a ticket: subjectI18n and messages[].textI18n; anything else means none', () {
      final t = TicketView.fromJson({
        ...social.ticketJson('t1', subject: 'Colis perdu', messages: [
          {'id': 'a', 'from': 'Agent', 'fromId': 'ad', 'role': 'admin_support', 'text': 'Bonjour', 'textI18n': _i18n('fr', 'Hello', 'Bonjour'), 'at': '2026-10-24T10:00:00Z', 'attachments': <String>[]},
          {'id': 'b', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': 'Merci', 'textI18n': 'junk', 'at': '2026-10-24T10:05:00Z', 'attachments': <String>[]},
        ]),
        'subjectI18n': _i18n('fr', 'Lost parcel', 'Colis perdu'),
      });
      expect(t.subjectFor('en'), 'Lost parcel');
      expect(t.subjectFor('fr'), 'Colis perdu');
      expect(t.messages[0].textI18n!.en, 'Hello');
      expect(t.messages[1].textI18n, isNull);
      expect(TicketView.fromJson(social.ticketJson('t2', subject: 'As written')).subjectFor('fr'), 'As written', reason: 'an older server sends none');
      expect(TicketView.fromJson({...social.ticketJson('t3'), 'subjectI18n': <String, dynamic>{}}).subjectI18n, isNull);
    });

    test('a ticket copy made by the store keeps the subject translations', () async {
      final fake = await social.socialReset();
      fake.handlers['support:list'] = (_) => [
            {...social.ticketJson('t1', userUnread: 2), 'subjectI18n': _i18n('fr', 'Lost parcel', 'Colis perdu')}
          ];
      fake.handlers['support:markRead'] = (_) => {'ok': true};
      await SupportStore.instance.load();
      await SupportStore.instance.markRead('t1');
      expect(SupportStore.instance.byId('t1')!.subjectI18n, isNotNull);
      social.socialTearDown();
    });
  });

  group('return and dispute screen', () {
    late AsFake server;
    late Map<String, dynamic> current;
    setUp(() async {
      server = await asReset();
      current = disputeJson(messages: []);
      server.handlers['disputes:get'] = (_) => current;
    });
    tearDown(() {
      RealtimeStore.instance.debugTranslateRequest = null;
      asTearDown();
    });

    Future<void> open(WidgetTester tester, {String lang = 'en'}) async {
      await asOpen(tester, ReturnStatusScreen(returnRequest: DisputeView.fromJson(current)), lang: lang);
      await asSettle(tester);
    }

    testWidgets('the reason shows in the app language at once, with the note and a link; no request is made', (tester) async {
      final asked = _watchTranslate();
      current = {...disputeJson(reason: 'La semelle s’est décollée', messages: []), 'reasonI18n': _i18n('fr', 'The sole came off', 'La semelle s’est décollée')};
      await open(tester);
      expect(_text(tester, 'tt-text-dispute_reason-d1'), 'The sole came off');
      expect(find.text('Translated automatically'), findsOneWidget);
      expect(find.byKey(const ValueKey('tt-link-dispute_reason-d1')), findsOneWidget);
      expect(asked, isEmpty);
      await tester.tap(find.byKey(const ValueKey('tt-link-dispute_reason-d1')));
      await tester.pump();
      expect(_text(tester, 'tt-text-dispute_reason-d1'), 'La semelle s’est décollée', reason: '"See original" gives the written text back');
    });

    testWidgets('in French the same reason is French, with no note: it was written in French', (tester) async {
      final asked = _watchTranslate();
      current = {...disputeJson(reason: 'La semelle s’est décollée', messages: []), 'reasonI18n': _i18n('fr', 'The sole came off', 'La semelle s’est décollée')};
      await open(tester, lang: 'fr');
      expect(_text(tester, 'tt-text-dispute_reason-d1'), 'La semelle s’est décollée');
      expect(find.byKey(const ValueKey('tt-link-dispute_reason-d1')), findsNothing);
      expect(find.text('Traduit automatiquement'), findsNothing);
      expect(asked, isEmpty);
    });

    testWidgets('the thread: a support message and a customer message are each shown in the app language, with no request', (tester) async {
      final asked = _watchTranslate();
      current = disputeJson(messages: [
        {...msgJ('m1', role: 'admin_support', name: 'Chantal', text: 'Nous regardons votre demande.'), 'textI18n': _i18n('fr', 'We are looking at your request.', 'Nous regardons votre demande.')},
        {...msgJ('m2', role: 'customer', name: 'Aline', text: 'Merci beaucoup'), 'textI18n': _i18n('fr', 'Thank you very much', 'Merci beaucoup')},
        {...msgJ('m3', role: 'seller', name: 'Jean', text: 'Old store message'), 'textI18n': _i18n('en', 'Old store message', 'Ancien message')},
      ]);
      await open(tester);
      expect(_text(tester, 'tt-text-dispute_message-m1'), 'We are looking at your request.');
      expect(_text(tester, 'tt-text-dispute_message-m2'), 'Thank you very much');
      expect(find.byKey(const ValueKey('tt-link-dispute_message-m3')), findsNothing, reason: 'written in English: no link');
      expect(asked.where((b) => b!['kind'] == 'dispute_message'), isEmpty, reason: 'the messages carried their translations');
    });

    testWidgets('the store answer from before support decided (sellerReasonI18n) stays as translated history', (tester) async {
      current = {...disputeJson(sellerReason: 'Usure normale', messages: []), 'sellerReasonI18n': _i18n('fr', 'Normal wear', 'Usure normale')};
      await open(tester);
      expect(_text(tester, 'tt-text-dispute_reply-d1'), 'Normal wear');
    });

    testWidgets('the decision: the resolution is shown translated in the banner and in the decision panel', (tester) async {
      current = {
        ...disputeJson(status: 'resolved', stage: 'closed', refundUsd: 12.5, outcome: 'return_refund', resolution: 'Remboursement accordé après examen', items: [disputeItemJson('di1', refund: 12.5)], messages: []),
        'resolutionI18n': _i18n('fr', 'Refund granted after review', 'Remboursement accordé après examen'),
      };
      await open(tester);
      expect(_text(tester, 'tt-text-dispute_resolution-d1'), 'Refund granted after review');
      await open(tester, lang: 'fr');
      expect(_text(tester, 'tt-text-dispute_resolution-d1'), 'Remboursement accordé après examen');
    });

    testWidgets('a refusal: the banner carries the support\'s words in the app language', (tester) async {
      current = {
        ...disputeJson(type: 'dispute', status: 'rejected', stage: 'closed', resolution: 'Non couvert par la politique', messages: []),
        'resolutionI18n': _i18n('fr', 'Not covered by the policy', 'Non couvert par la politique'),
      };
      await open(tester);
      expect(tester.widget<Text>(find.byKey(const ValueKey('stage-body'))).data, 'Not covered by the policy');
      expect(find.byKey(const ValueKey('request-resolution')), findsNothing, reason: 'a plain refusal has no decision panel');
    });

    testWidgets('a fixed server sentence (no translations) is put into French by the app; support\'s own words are not touched', (tester) async {
      current = disputeJson(status: 'resolved', stage: 'closed', resolution: 'Refunded to wallet', messages: []);
      expect(resolutionText(const Strings('fr'), DisputeView.fromJson(current)), 'Remboursé sur le portefeuille', reason: 'a known sentence gets its French text');
      expect(resolutionText(const Strings('fr'), DisputeView.fromJson({...current, 'resolution': 'Custom words by an agent'})), 'Custom words by an agent');
      expect(resolutionText(const Strings('en'), DisputeView.fromJson(current)), 'Refunded to wallet');
    });

    testWidgets('an older payload without translations falls back to the on-demand translation of the reader\'s own record', (tester) async {
      final asked = _watchTranslate();
      current = disputeJson(reason: 'La semelle s’est décollée', messages: [{...msgJ('m1', role: 'admin_support', text: 'Nous regardons.')}]);
      await open(tester);
      await tester.pump();
      await tester.pump();
      expect(asked.map((b) => '${b!['kind']}:${b['id']}'), containsAll(['dispute_reason:d1', 'dispute_message:m1']));
      expect(asked.every((b) => b!['target'] == 'en'), isTrue);
    });
  });

  group('replacement and exchange screens', () {
    late AsFake server;
    setUp(() async => server = await asReset());
    tearDown(() {
      RealtimeStore.instance.debugTranslateRequest = null;
      asTearDown();
    });

    testWidgets('a replacement: the reason and the support decision note (declined) in the app language', (tester) async {
      final asked = _watchTranslate();
      final json = {
        ...replacementJson(status: 'rejected', sellerReason: 'Non couvert par la garantie'),
        'reason': 'Une chaussure est déchirée',
        'reasonI18n': _i18n('fr', 'One shoe is torn', 'Une chaussure est déchirée'),
        'sellerReasonI18n': _i18n('fr', 'Not covered by the warranty', 'Non couvert par la garantie'),
      };
      await asOpen(tester, ReplacementDetailScreen(replacement: ReplacementView.fromJson(json)));
      await asSettle(tester);
      expect(_text(tester, 'tt-text-replacement_reason-r1'), 'One shoe is torn');
      expect(tester.widget<Text>(find.byKey(const ValueKey('transfer-body'))).data, 'Reason: Not covered by the warranty');
      expect(find.text('Reason: Not covered by the warranty'), findsWidgets, reason: 'the progress list says it too');
      expect(asked, isEmpty);
      await asOpen(tester, ReplacementDetailScreen(replacement: ReplacementView.fromJson(json)), lang: 'fr');
      await asSettle(tester);
      expect(_text(tester, 'tt-text-replacement_reason-r1'), 'Une chaussure est déchirée');
      expect(find.textContaining('Non couvert par la garantie'), findsWidgets);
      expect(server.countOf('translate:text'), 0);
    });

    testWidgets('an exchange: the reason and the decision note in the app language; no link for text written in the app language', (tester) async {
      final json = {
        ...exchangeJson(status: 'rejected', sellerReason: 'Out of stock'),
        'reason': 'Trop petit',
        'reasonI18n': _i18n('fr', 'Too small', 'Trop petit'),
        'sellerReasonI18n': _i18n('en', 'Out of stock', 'En rupture de stock'),
      };
      await asOpen(tester, ExchangeDetailScreen(exchange: ExchangeView.fromJson(json)));
      await asSettle(tester);
      expect(_text(tester, 'tt-text-exchange_reason-x1'), 'Too small');
      expect(find.text('Reason: Out of stock'), findsWidgets);
      await asOpen(tester, ExchangeDetailScreen(exchange: ExchangeView.fromJson(json)), lang: 'fr');
      await asSettle(tester);
      expect(_text(tester, 'tt-text-exchange_reason-x1'), 'Trop petit');
      expect(find.textContaining('En rupture de stock'), findsWidgets);
    });

    testWidgets('the returns list row summarises a line-less request with its reason in the app language', (tester) async {
      server.handlers['disputes:list'] = (_) => [
            {...disputeJson(items: [], reason: 'La semelle s’est décollée'), 'items': <dynamic>[], 'reasonI18n': _i18n('fr', 'The sole came off', 'La semelle s’est décollée')}
          ];
      server.handlers['replacements:mine'] = (_) => [];
      server.handlers['exchanges:mine'] = (_) => [];
      await asOpen(tester, const ReturnsListScreen());
      await asSettle(tester);
      expect(find.text('The sole came off'), findsOneWidget);
      expect(AfterSaleStore.instance.disputes, hasLength(1));
    });
  });

  group('support screens', () {
    late social.FakeServer server;
    setUp(() async => server = await social.socialReset());
    tearDown(() {
      RealtimeStore.instance.debugTranslateRequest = null;
      social.socialTearDown();
    });

    Future<void> open(WidgetTester tester, Widget screen, {String lang = 'en'}) async {
      gapTallViewport(tester);
      await Strings.setLang(lang, persist: false);
      await tester.pumpWidget(gapApp(screen, lang: lang));
      await tester.pump(const Duration(milliseconds: 300));
    }

    Map<String, dynamic> ticket() => {
          ...social.ticketJson('t1', subject: 'Colis perdu', messages: [
            {'id': 'tm1', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': 'Mon colis n’est pas arrivé.', 'textI18n': _i18n('fr', 'My parcel did not arrive.', 'Mon colis n’est pas arrivé.'), 'at': '2026-10-24T09:30:00Z', 'attachments': <String>[]},
            {'id': 'tm2', 'from': 'Agent', 'fromId': 'ad1', 'role': 'admin_support', 'text': 'We are checking with the carrier.', 'textI18n': _i18n('en', 'We are checking with the carrier.', 'Nous vérifions avec le transporteur.'), 'at': '2026-10-24T10:00:00Z', 'attachments': <String>[]},
          ]),
          'subjectI18n': _i18n('fr', 'Lost parcel', 'Colis perdu'),
        };

    testWidgets('the list row shows the subject in the app language; French shows it as written', (tester) async {
      server.handlers['support:list'] = (_) => [ticket()];
      await open(tester, const SupportListScreen());
      await tester.pump(const Duration(milliseconds: 300));
      expect(_text(tester, 'ticket-subject-t1'), 'Lost parcel');
      await open(tester, const SupportListScreen(locale: Locale('fr')), lang: 'fr');
      await tester.pump(const Duration(milliseconds: 300));
      expect(_text(tester, 'ticket-subject-t1'), 'Colis perdu');
    });

    testWidgets('the ticket: subject and the support message are translated at once with no request; your own message stays as written', (tester) async {
      final asked = _watchTranslate();
      await open(tester, SupportTicketDetailScreen(ticket: TicketView.fromJson(ticket())));
      expect(_text(tester, 'tt-text-support_ticket-t1'), 'Lost parcel');
      expect(find.text('We are checking with the carrier.'), findsOneWidget, reason: 'written in English: shown as it is');
      expect(find.byKey(const ValueKey('tt-link-support_message-tm2')), findsNothing);
      expect(find.text('Mon colis n’est pas arrivé.'), findsOneWidget, reason: 'your own message shows as written');
      expect(find.byKey(const ValueKey('tt-link-support_message-tm1')), findsNothing);
      expect(find.byKey(const ValueKey('tt-link-support_ticket-t1')), findsOneWidget);
      expect(asked, isEmpty);

      await open(tester, SupportTicketDetailScreen(ticket: TicketView.fromJson(ticket()), locale: const Locale('fr')), lang: 'fr');
      expect(find.text('Nous vérifions avec le transporteur.'), findsOneWidget);
      expect(find.text('Translated automatically'), findsNothing);
      expect(find.text('Traduit automatiquement'), findsOneWidget, reason: 'the English support message carries the note in French');
      expect(asked, isEmpty);
    });

    testWidgets('an older ticket (no translations): the on-demand translation is asked for the support message only', (tester) async {
      final asked = _watchTranslate();
      await open(tester, SupportTicketDetailScreen(ticket: TicketView.fromJson(social.ticketJson('t9', subject: 'Colis perdu', messages: [
        {'id': 'a', 'from': 'Agent', 'fromId': 'ad', 'role': 'admin_support', 'text': 'Bonjour', 'at': '2026-10-24T10:00:00Z', 'attachments': <String>[]},
      ]))));
      await tester.pump();
      await tester.pump();
      expect(asked.map((b) => '${b!['kind']}:${b['id']}'), containsAll(['support_ticket:t9', 'support_message:a']));
    });
  });
}
