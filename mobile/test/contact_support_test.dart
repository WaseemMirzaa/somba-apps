// "Contact support" replaces "Message the seller" (messaging stores is closed): it opens a new ticket with the order, or the
// product or store, filled in; the ticket opens once it is created; only a signed-in shopper sees it.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/more/support_entry.dart';
import 'package:lipcart/screens/more/support_screens.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'button_rules.dart';
import 'gap_helpers.dart';
import 'social_helpers.dart';

Future<void> show(WidgetTester tester, Widget child, {String lang = 'en'}) async {
  gapTallViewport(tester);
  await Strings.setLang(lang, persist: false);
  await tester.pumpWidget(KeyedSubtree(key: UniqueKey(), child: gapApp(Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: child)), lang: lang)));
  await tester.pump(const Duration(milliseconds: 300));
}

Future<void> settle(WidgetTester tester) async {
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 500));
}

TextEditingController subjectField(WidgetTester tester) => tester.widget<TextField>(find.descendant(of: find.byKey(const ValueKey('ticket-subject')), matching: find.byType(TextField))).controller!;

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  late FakeServer server;
  setUp(() async => server = await socialReset());
  tearDown(socialTearDown);

  testWidgets('the button says "Contact support" (French too), is an outlined label-only button, and is gone for visitors and sellers', (tester) async {
    await show(tester, const ContactSupportButton(orderId: 'o1'));
    expect(find.byKey(const ValueKey('contact-support')), findsOneWidget);
    expect(find.text('Contact support'), findsOneWidget);
    expect(find.text('Message the seller'), findsNothing);
    expectButtonRules(tester);
    await show(tester, const ContactSupportButton(orderId: 'o1'), lang: 'fr');
    expect(find.text('Contacter l’assistance'), findsOneWidget);
    expect(find.text('Écrire au vendeur'), findsNothing);

    RealtimeStore.instance.user = null;
    await show(tester, const ContactSupportButton(orderId: 'o1'));
    expect(find.byKey(const ValueKey('contact-support')), findsNothing, reason: 'nobody is signed in');
    RealtimeStore.instance.user = gapUser(role: 'seller');
    await show(tester, const ContactSupportButton(orderId: 'o1'));
    expect(find.byKey(const ValueKey('contact-support')), findsNothing, reason: 'a seller account is not a shopper');
  });

  testWidgets('from an order: the ticket form opens with the order filled in and the order category', (tester) async {
    await show(tester, const ContactSupportButton(orderId: 'o1'));
    await tester.tap(find.byKey(const ValueKey('contact-support')));
    await settle(tester);
    expect(find.byType(NewTicketScreen), findsOneWidget);
    expect(tester.widget<DropdownButtonFormField<String?>>(find.byKey(const ValueKey('ticket-order'))).initialValue, 'o1');
    expect(tester.widget<ChoiceChip>(find.byKey(const ValueKey('ticket-cat-order'))).selected, isTrue);
    expect(subjectField(tester).text, isEmpty);
    expect(server.countOf('support:open'), 0, reason: 'opening the form creates nothing');
  });

  testWidgets('from a product: the subject starts with the product name (in the app language) and can be edited', (tester) async {
    await show(tester, const ContactSupportButton(about: 'Running shoes Air Comfort'));
    await tester.tap(find.byKey(const ValueKey('contact-support')));
    await settle(tester);
    expect(subjectField(tester).text, 'About: Running shoes Air Comfort');
    expect(tester.widget<DropdownButtonFormField<String?>>(find.byKey(const ValueKey('ticket-order'))).initialValue, isNull);
    await show(tester, const ContactSupportButton(about: 'Baskets de course'), lang: 'fr');
    await tester.tap(find.byKey(const ValueKey('contact-support')));
    await settle(tester);
    expect(subjectField(tester).text, 'À propos de : Baskets de course');
  });

  testWidgets('sending the ticket creates it with the order and opens its conversation, with a snackbar', (tester) async {
    server.handlers['support:open'] = (b) => ticketJson('t7', subject: b!['subject'] as String, reference: 'TKT-0007', orderId: b['orderId'] as String?, category: b['category'] as String?, messages: [
          {'id': 'tm1', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': b['message'], 'at': '2026-10-24T09:30:00Z', 'attachments': <String>[]},
        ]);
    await show(tester, const ContactSupportButton(orderId: 'o1'));
    await tester.tap(find.byKey(const ValueKey('contact-support')));
    await settle(tester);
    await tester.enterText(find.descendant(of: find.byKey(const ValueKey('ticket-subject')), matching: find.byType(TextField)), 'Wrong size');
    await tester.enterText(find.descendant(of: find.byKey(const ValueKey('ticket-message')), matching: find.byType(TextField)), 'The shoes are too small.');
    await tester.ensureVisible(find.text('Create ticket'));
    await tester.tap(find.text('Create ticket'));
    await settle(tester);
    await settle(tester);
    expect(server.bodiesOf('support:open').single, {'subject': 'Wrong size', 'message': 'The shoes are too small.', 'category': 'order', 'orderId': 'o1'});
    expect(find.byType(SupportTicketDetailScreen), findsOneWidget, reason: 'the shopper lands in the ticket they just opened');
    expect(find.text('TKT-0007'), findsWidgets);
    expect(find.text('The shoes are too small.'), findsOneWidget);
  });

  testWidgets('backing out of the form creates nothing and stays where it was', (tester) async {
    await show(tester, const ContactSupportButton(orderId: 'o1'));
    await tester.tap(find.byKey(const ValueKey('contact-support')));
    await settle(tester);
    await tester.tap(find.byIcon(Icons.arrow_back_rounded).last);
    await settle(tester);
    expect(find.byType(NewTicketScreen), findsNothing);
    expect(find.byType(SupportTicketDetailScreen), findsNothing);
    expect(server.countOf('support:open'), 0);
  });
}
