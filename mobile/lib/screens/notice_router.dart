import 'package:flutter/material.dart';
import '../data/catalog_live.dart' show productByUuid;
import '../services/aftersale_store.dart';
import '../services/chat_store.dart';
import '../services/realtime_store.dart';
import 'more/account_more.dart';
import 'more/aftersale_status.dart';
import 'more/chat_inbox.dart';
import 'more/chat_thread.dart';
import 'more/order_screens.dart';
import 'more/returns_extra.dart';
import 'more/support_extra.dart';
import 'deals_screen.dart';
import 'product_detail_screen.dart';
import 'wallet_screen.dart';

/// Where a notification takes the customer.
enum NoticeDest { product, deals, order, tracking, wallet, returnStatus, replacementStatus, exchangeStatus, returns, ticket, support, chat, messages, notifications }

class NoticeRoute {
  const NoticeRoute(this.dest, [this.id]);
  final NoticeDest dest;
  final String? id;

  @override
  bool operator ==(Object other) => other is NoticeRoute && other.dest == dest && other.id == id;
  @override
  int get hashCode => Object.hash(dest, id);
  @override
  String toString() => 'NoticeRoute($dest, $id)';
}

/// The screen for a notification `type` / `entityId` (the same for a push tap and
/// the in-app list). [hasOrder] tells whether an id is one of the customer's
/// orders: payment notices carry an order id, or a payment id for wallet top-ups.
NoticeRoute noticeRoute(String type, String? entityId, {required bool Function(String id) hasOrder}) {
  final id = entityId;
  switch (type) {
    case 'order':
      return id != null && hasOrder(id) ? NoticeRoute(NoticeDest.order, id) : const NoticeRoute(NoticeDest.notifications);
    case 'delivery':
      return id != null && hasOrder(id) ? NoticeRoute(NoticeDest.tracking, id) : const NoticeRoute(NoticeDest.notifications);
    case 'payment':
      return id != null && hasOrder(id) ? NoticeRoute(NoticeDest.order, id) : const NoticeRoute(NoticeDest.wallet);
    case 'return':
    case 'dispute':
      return id != null ? NoticeRoute(NoticeDest.returnStatus, id) : const NoticeRoute(NoticeDest.returns);
    case 'replacement':
      return id != null ? NoticeRoute(NoticeDest.replacementStatus, id) : const NoticeRoute(NoticeDest.returns);
    case 'exchange':
      return id != null ? NoticeRoute(NoticeDest.exchangeStatus, id) : const NoticeRoute(NoticeDest.returns);
    case 'support':
      return id != null ? NoticeRoute(NoticeDest.ticket, id) : const NoticeRoute(NoticeDest.support);
    case 'question':
      // "Your question was answered": the entityId is the PRODUCT id.
      return id != null ? NoticeRoute(NoticeDest.product, id) : const NoticeRoute(NoticeDest.notifications);
    case 'flash':
      return const NoticeRoute(NoticeDest.deals);
    case 'chat':
      // The notice's entityId is the conversation id.
      return id != null ? NoticeRoute(NoticeDest.chat, id) : const NoticeRoute(NoticeDest.messages);
    default:
      return const NoticeRoute(NoticeDest.notifications);
  }
}

/// Opens the screen for a notification on [nav] and marks it read. Returns,
/// tickets and the like are fetched by id; when one can't be found the list
/// screen opens instead, so a tap never leads nowhere.
Future<void> openNotice(
  NavigatorState nav,
  Locale locale, {
  required String type,
  String? entityId,
  String? notificationId,
  bool fromInbox = false,
}) async {
  final store = RealtimeStore.instance;
  if (notificationId != null && store.notifications.any((n) => n.id == notificationId && !n.read)) {
    store.markRead(notificationId).catchError((_) {});
  }
  final route = noticeRoute(type, entityId, hasOrder: (id) => store.orderById(id) != null);
  Widget? screen;
  switch (route.dest) {
    case NoticeDest.product:
      final product = productByUuid(route.id!);
      screen = product != null ? ProductDetailScreen(product: product, locale: locale) : (fromInbox ? null : NotificationsScreen(locale: locale));
    case NoticeDest.deals:
      screen = DealsScreen(locale: locale);
    case NoticeDest.order:
      screen = OrderDetailScreen(locale: locale, orderId: route.id!);
    case NoticeDest.tracking:
      screen = OrderTrackingScreen(locale: locale, orderId: route.id!);
    case NoticeDest.wallet:
      screen = WalletScreen(locale: locale);
    case NoticeDest.returnStatus:
      final r = await AfterSaleStore.instance.tryFetchDispute(route.id!);
      screen = r != null ? ReturnStatusScreen(locale: locale, returnRequest: r) : ReturnsListScreen(locale: locale);
    case NoticeDest.replacementStatus:
      final r = await AfterSaleStore.instance.tryFetchReplacement(route.id!);
      screen = r != null ? ReplacementDetailScreen(locale: locale, replacement: r) : ReturnsListScreen(locale: locale, initialTab: 1);
    case NoticeDest.exchangeStatus:
      final x = await AfterSaleStore.instance.tryFetchExchange(route.id!);
      screen = x != null ? ExchangeDetailScreen(locale: locale, exchange: x) : ReturnsListScreen(locale: locale, initialTab: 2);
    case NoticeDest.returns:
      screen = ReturnsListScreen(locale: locale);
    case NoticeDest.ticket:
      final t = await _find('support:list', route.id!, TicketView.fromJson);
      screen = t != null ? SupportTicketDetailScreen(ticket: t, locale: locale) : SupportListScreen(locale: locale);
    case NoticeDest.support:
      screen = SupportListScreen(locale: locale);
    case NoticeDest.chat:
      final c = await ChatStore.instance.conversationById(route.id!);
      screen = c != null ? ChatThreadScreen(conversation: c, locale: locale) : ChatInboxScreen(locale: locale);
    case NoticeDest.messages:
      screen = ChatInboxScreen(locale: locale);
    case NoticeDest.notifications:
      // Already on the list: nothing more to open.
      screen = fromInbox ? null : NotificationsScreen(locale: locale);
  }
  if (screen == null || !nav.mounted) return;
  await nav.push(MaterialPageRoute<void>(builder: (_) => screen!));
}

Future<T?> _find<T>(String event, String id, T Function(Map<String, dynamic>) parse) async {
  try {
    final rows = await RealtimeStore.instance.call(event) as List;
    for (final e in rows) {
      final m = (e as Map).map((k, v) => MapEntry(k.toString(), v));
      if (m['id'] == id) return parse(m);
    }
  } catch (_) {
    // Offline or refused: fall back to the list screen.
  }
  return null;
}
