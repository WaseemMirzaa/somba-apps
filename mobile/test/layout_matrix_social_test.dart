// The chat, support and notification-preference screens at two phone widths (360 and 402 pt), in English and French,
// at text scale 1.0 and 1.3, with the app's real fonts and long names. Fails on any overflow or layout error, a button
// label that wraps or is cut, or text drawn over other text; each screen is also held to the button rules.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/screens/account_screen.dart';
import 'package:lipcart/screens/more/chat_compose.dart';
import 'package:lipcart/screens/more/chat_entry.dart';
import 'package:lipcart/screens/more/chat_inbox.dart';
import 'package:lipcart/screens/more/chat_thread.dart';
import 'package:lipcart/screens/more/settings_extra.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/chat_store.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/support_store.dart';
import 'package:lipcart/theme/app_theme.dart';

import 'button_rules.dart';
import 'gap_helpers.dart';
import 'layout_checks.dart';
import 'social_helpers.dart';

const _longStore = 'Mama Tech Électronique Centre Kinshasa-Gombe Boulevard';
const _longProduct = 'Chaussures de course Air Comfort Pro édition limitée pointure 42';
const _longText =
    'Bonjour, je voudrais savoir si ce modèle existe aussi en bleu marine et en pointure 43, et si la livraison à Limete est possible avant samedi. Merci beaucoup pour votre réponse rapide.';

Future<FakeServer> _seed(String lang) async {
  final server = await socialReset(lang: lang);
  final store = RealtimeStore.instance;
  store.user = gapUser(phone: '+243812345678');
  store.orders
    ..clear()
    ..add(OrderDto.fromJson({
      'id': 'o1', 'reference': 'SOM-1042', 'customerName': 'Aline', 'status': 'delivered', 'paymentMethod': 'wallet', 'totalUsd': 5,
      'createdAt': '2026-10-01T09:30:00Z', 'items': [],
    }));
  server.handlers['chat:list'] = (_) => [
        convJson(id: 'a', storeName: _longStore, unread: 12, productId: 'p1', productName: _longProduct, preview: _longText, logo: '/uploads/logo.png'),
        convJson(id: 'b', storeName: 'Kin Tech', orderId: 'o1', orderReference: 'SOM-1042', preview: 'Votre colis est parti aujourd’hui', at: '2026-10-20T09:30:00Z'),
        convJson(id: 'c', storeName: 'Boutique générale', preview: '📷', at: '2026-10-10T09:30:00Z', unread: 120),
      ];
  server.handlers['chat:unread'] = (_) => {'total': 132, 'buyer': 132, 'seller': 0};
  server.handlers['chat:messages'] = (b) => {
        'conversation': convJson(id: 'a', storeName: _longStore, productId: 'p1', productName: _longProduct, orderId: b?['orderId'] as String?),
        'messages': [
          msgJson('m1', text: _longText, senderName: 'Jean-Pierre Mukendi Kabongo', at: '2026-10-23T09:00:00Z'),
          msgJson('m2', side: 'buyer', text: 'Oui, pointure 43 en bleu marine.', at: '2026-10-23T09:05:00Z'),
          msgJson('m3', side: 'buyer', text: '', attachments: ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg', '/uploads/d.jpg'], at: '2026-10-23T09:06:00Z'),
          msgJson('m4', text: 'Voici la photo.', attachments: ['/uploads/e.jpg'], at: '2026-10-24T09:00:00Z'),
          msgJson('m5', side: 'buyer', text: _longText, at: '2026-10-24T09:10:00Z'),
        ],
        'hasMore': true,
      };
  server.handlers['support:list'] = (_) => [
        ticketJson('t1', subject: 'Mon colis n’est toujours pas arrivé après deux semaines d’attente', reference: 'TKT-12345678', status: 'pending', userUnread: 3, category: 'payment', orderId: 'o1', updatedAt: '2026-10-24T10:00:00Z', messages: _messages()),
        ticketJson('t2', subject: 'Remboursement', reference: 'TKT-2', status: 'resolved', category: 'return', updatedAt: '2026-10-23T10:00:00Z'),
        ticketJson('t0', subject: 'Ancien ticket', reference: 'TKT-0', legacy: true, updatedAt: '2026-10-01T10:00:00Z'),
      ];
  await ChatStore.instance.refresh();
  await SupportStore.instance.load();
  return server;
}

List<Map<String, dynamic>> _messages() => [
      {'id': 'tm1', 'from': 'Aline', 'fromId': 'u1', 'role': 'customer', 'text': _longText, 'at': '2026-10-24T09:30:00Z', 'attachments': <String>[]},
      {'id': 'tm2', 'from': 'Agent', 'fromId': 'ad1', 'role': 'admin_support', 'text': 'Nous vérifions avec le transporteur et revenons vers vous très vite.', 'at': '2026-10-24T10:00:00Z', 'attachments': ['/uploads/proof.jpg', '/uploads/proof2.jpg']},
    ];

TicketView _ticket(String id, {String status = 'pending', int unread = 0, String? orderId = 'o1'}) =>
    TicketView.fromJson(ticketJson(id, reference: 'TKT-12345678', subject: 'Mon colis n’est toujours pas arrivé après deux semaines d’attente', status: status, userUnread: unread, category: 'delivery', orderId: orderId, messages: _messages()));

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });

  tearDown(socialTearDown);

  final screens = <String, Widget Function(Locale l)>{
    'chat inbox': (l) => ChatInboxScreen(locale: l),
    'chat thread (product context, photos, paging)': (l) => ChatThreadScreen(conversation: ChatConversation.fromJson(convJson(id: 'a', storeName: _longStore, productId: 'p1', productName: _longProduct)), locale: l),
    'chat thread (order context)': (l) => ChatThreadScreen(conversation: ChatConversation.fromJson(convJson(id: 'a', storeName: 'Kin Tech', orderId: 'o1', orderReference: 'SOM-1042')), locale: l),
    'chat compose (product)': (l) => ChatComposeScreen(sellerId: 's1', storeName: _longStore, productId: 'p1', locale: l),
    'chat compose (order)': (l) => ChatComposeScreen(sellerId: 's1', storeName: 'Kin Tech', orderId: 'o1', locale: l),
    'message-the-seller button': (l) => Scaffold(body: Padding(padding: const EdgeInsets.all(16), child: MessageSellerButton(sellerId: 's1', storeName: _longStore, locale: l))),
    'support list': (l) => SupportListScreen(locale: l),
    'ticket (open, staff reply with photos)': (l) => SupportTicketDetailScreen(ticket: _ticket('t1', unread: 0), locale: l),
    'ticket (closed)': (l) => SupportTicketDetailScreen(ticket: _ticket('t2', status: 'resolved'), locale: l),
    'ticket (old, no new fields)': (l) => SupportTicketDetailScreen(ticket: TicketView.fromJson(ticketJson('t0', legacy: true, reference: 'TKT-0')), locale: l),
    'new ticket': (l) => NewTicketScreen(locale: l),
    'new ticket (from a closed one)': (l) => NewTicketScreen(orderId: 'o1', category: 'delivery', locale: l),
    'settings (notification categories)': (l) => CustomerSettingsScreen(locale: l),
    'account (unread badges)': (l) => AccountScreen(locale: l, onLocaleChanged: (_) {}),
  };

  for (final e in screens.entries) {
    testWidgets('layout matrix: ${e.key}', (tester) async {
      addTearDown(tester.view.reset);
      final found = <String>[];
      for (final c in layoutConfigs) {
        await _seed(c.lang);
        // A long French error would also have to fit: nothing to do here, snackbars are a framework widget.
        final locale = Locale(c.lang);
        final app = MaterialApp(
          theme: AppTheme.light(),
          locale: locale,
          supportedLocales: const [Locale('en'), Locale('fr')],
          localizationsDelegates: const [GlobalMaterialLocalizations.delegate, GlobalWidgetsLocalizations.delegate, GlobalCupertinoLocalizations.delegate],
          builder: scaleText(c),
          home: e.value(locale),
        );
        for (final p in await layoutProblems(tester, c, app)) {
          found.add('[$c] $p');
        }
        expectButtonRules(tester);
        expect(find.byType(CircularProgressIndicator), findsNothing, reason: '${e.key} [$c] is still loading: the layout was not checked');
      }
      expect(found, isEmpty, reason: found.join('\n'));
    });
  }
}
