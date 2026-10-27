import 'dart:async';
import 'package:flutter/foundation.dart';
import 'feature_hooks.dart';
import 'models.dart' show pickLang;
import 'realtime_store.dart';

Map<String, dynamic> _asMap(dynamic d) => (d as Map).map((k, v) => MapEntry(k.toString(), v));

String? _str(dynamic v) {
  if (v == null) return null;
  final s = v.toString();
  return s.isEmpty ? null : s;
}

DateTime? _date(dynamic v) {
  if (v is! String || v.isEmpty) return null;
  return DateTime.tryParse(v)?.toLocal();
}

int _int(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

/// One customer <-> store thread, as the viewer sees it (`chat:list`, `chat:start`, `chat:messages`, `chat:message`).
/// Every field the server may leave out has a safe default, so an older or partial payload still renders.
class ChatConversation {
  const ChatConversation({
    required this.id,
    this.side = 'buyer',
    this.buyerId = '',
    this.buyerName = '',
    this.sellerId = '',
    this.storeName = '',
    this.storeLogo,
    this.productId,
    this.productName,
    this.productNameFr,
    this.productImage,
    this.orderId,
    this.orderReference,
    this.lastMessageAt,
    this.lastMessagePreview = '',
    this.unread = 0,
  });

  final String id;

  /// The viewer's side: `buyer` or `seller`. The customer app only shows `buyer` threads.
  final String side;
  final String buyerId;
  final String buyerName;
  final String sellerId;
  final String storeName;
  final String? storeLogo;
  final String? productId;
  final String? productName;

  /// The product's French name (the server sends it next to [productName]; older servers do not).
  final String? productNameFr;
  final String? productImage;
  final String? orderId;
  final String? orderReference;
  final DateTime? lastMessageAt;
  final String lastMessagePreview;
  final int unread;

  /// The product's name in [lang]: French when asked and present, else the other language. Null without a product.
  String? displayProductName(String lang) {
    final name = pickLang(lang, productName, productNameFr);
    return name.isEmpty ? null : name;
  }

  bool get hasContext => (productId ?? '').isNotEmpty || (orderId ?? '').isNotEmpty;

  factory ChatConversation.fromJson(Map<String, dynamic> j) => ChatConversation(
        id: j['id']?.toString() ?? '',
        side: j['side']?.toString() == 'seller' ? 'seller' : 'buyer',
        buyerId: j['buyerId']?.toString() ?? '',
        buyerName: j['buyerName']?.toString() ?? '',
        sellerId: j['sellerId']?.toString() ?? '',
        storeName: j['storeName']?.toString() ?? '',
        storeLogo: _str(j['storeLogo']),
        productId: _str(j['productId']),
        productName: _str(j['productName']),
        productNameFr: _str(j['productNameFr']),
        productImage: _str(j['productImage']),
        orderId: _str(j['orderId']),
        orderReference: _str(j['orderReference']),
        lastMessageAt: _date(j['lastMessageAt']),
        lastMessagePreview: j['lastMessagePreview']?.toString() ?? '',
        unread: _int(j['unread']),
      );

  ChatConversation copyWith({int? unread, String? lastMessagePreview, DateTime? lastMessageAt}) => ChatConversation(
        id: id,
        side: side,
        buyerId: buyerId,
        buyerName: buyerName,
        sellerId: sellerId,
        storeName: storeName,
        storeLogo: storeLogo,
        productId: productId,
        productName: productName,
        productNameFr: productNameFr,
        productImage: productImage,
        orderId: orderId,
        orderReference: orderReference,
        lastMessageAt: lastMessageAt ?? this.lastMessageAt,
        lastMessagePreview: lastMessagePreview ?? this.lastMessagePreview,
        unread: unread ?? this.unread,
      );

  /// Does this thread cover the same store and context as a message started from [productId] / [orderId]?
  /// The server keeps one thread per customer + store + context; an order wins over a product.
  bool coversContext({required String sellerId, String? productId, String? orderId}) {
    if (this.sellerId != sellerId) return false;
    final o = (orderId ?? '').isEmpty ? null : orderId;
    final p = (productId ?? '').isEmpty ? null : productId;
    if (o != null) return this.orderId == o;
    if (p != null) return this.productId == p && this.orderId == null;
    return this.productId == null && this.orderId == null;
  }
}

/// One message of a thread (`chat:messages`, `chat:send`, `chat:start`, `chat:message`).
class ChatMessage {
  const ChatMessage({
    required this.id,
    this.conversationId = '',
    this.senderId = '',
    this.senderSide = 'buyer',
    this.senderName = '',
    this.text = '',
    this.attachments = const [],
    this.createdAt,
  });

  final String id;
  final String conversationId;
  final String senderId;

  /// `buyer` (the customer = me in this app) or `seller` (the store's team).
  final String senderSide;
  final String senderName;
  final String text;
  final List<String> attachments;
  final DateTime? createdAt;

  bool get mine => senderSide != 'seller';

  factory ChatMessage.fromJson(Map<String, dynamic> j) {
    final raw = j['attachments'];
    return ChatMessage(
      id: j['id']?.toString() ?? '',
      conversationId: j['conversationId']?.toString() ?? '',
      senderId: j['senderId']?.toString() ?? '',
      senderSide: j['senderSide']?.toString() == 'seller' ? 'seller' : 'buyer',
      senderName: j['senderName']?.toString() ?? '',
      text: j['text']?.toString() ?? '',
      attachments: raw is List ? [for (final u in raw) if (u is String && u.isNotEmpty) u] : const [],
      createdAt: _date(j['createdAt']),
    );
  }
}

/// A page of a thread: [messages] oldest first; [hasMore] says older ones exist.
class ChatPage {
  const ChatPage({required this.conversation, required this.messages, required this.hasMore});
  final ChatConversation? conversation;
  final List<ChatMessage> messages;
  final bool hasMore;

  factory ChatPage.fromJson(Map<String, dynamic> j) => ChatPage(
        conversation: j['conversation'] is Map ? ChatConversation.fromJson(_asMap(j['conversation'])) : null,
        messages: [
          if (j['messages'] is List)
            for (final m in j['messages'] as List)
              if (m is Map) ChatMessage.fromJson(_asMap(m)),
        ],
        hasMore: j['hasMore'] == true,
      );
}

/// The shopper's chats with stores: the inbox list, the unread total behind the badge, and the live pushes.
/// Plugs into the shared socket session through [hook] (see `feature_hooks.dart`).
class ChatStore extends ChangeNotifier {
  ChatStore._();
  static final ChatStore instance = ChatStore._();

  static const int pageSize = 30;

  final List<ChatConversation> _conversations = [];

  /// Conversations as the customer sees them, newest activity first.
  List<ChatConversation> get conversations => List.unmodifiable(_conversations);

  /// Unread messages across the customer's chats (the badge).
  int unread = 0;
  bool loaded = false;
  bool loading = false;

  /// More conversations exist beyond the ones loaded.
  bool hasMoreConversations = false;

  /// The thread on screen: a message that arrives for it is marked read at once.
  String? openConversationId;

  final StreamController<ChatMessage> _incoming = StreamController<ChatMessage>.broadcast();

  /// Every message pushed live (`chat:message`), for the thread screen that shows its conversation.
  Stream<ChatMessage> get incoming => _incoming.stream;

  Future<dynamic> _call(String event, [Map<String, dynamic>? body]) => RealtimeStore.instance.call(event, body);

  FeatureHook get hook => FeatureHook(
        name: 'chat',
        pushes: {'chat:message': onMessagePush, 'chat:read': onReadPush},
        hydrate: (_) => refresh(),
        reset: reset,
      );

  void reset() {
    _conversations.clear();
    unread = 0;
    loaded = false;
    loading = false;
    hasMoreConversations = false;
    openConversationId = null;
    notifyListeners();
  }

  // ---- reads ----

  /// Reloads the unread total and the first page of the inbox (after sign-in, a reconnect, pull to refresh).
  Future<void> refresh() async {
    await Future.wait([refreshUnread().catchError((Object _) {}), loadConversations()]);
  }

  Future<void> refreshUnread() async {
    final res = await _call('chat:unread');
    if (res is Map) {
      final m = _asMap(res);
      unread = _int(m.containsKey('buyer') ? m['buyer'] : m['total']);
      notifyListeners();
    }
  }

  /// Loads the inbox; with [more] the next page is appended. Throws when the server refuses (offline…).
  Future<void> loadConversations({bool more = false}) async {
    if (loading) return;
    loading = true;
    notifyListeners();
    try {
      final offset = more ? _conversations.length : 0;
      final res = await _call('chat:list', {'as': 'buyer', 'limit': pageSize, 'offset': offset});
      final rows = [
        if (res is List)
          for (final e in res)
            if (e is Map) ChatConversation.fromJson(_asMap(e)),
      ].where((c) => c.id.isNotEmpty && c.side == 'buyer').toList();
      if (!more) _conversations.clear();
      for (final c in rows) {
        _conversations.removeWhere((x) => x.id == c.id);
        _conversations.add(c);
      }
      _sort();
      hasMoreConversations = (res is List ? res.length : 0) >= pageSize;
      loaded = true;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// The thread for this store and context when the inbox already has one.
  ChatConversation? existingFor({required String sellerId, String? productId, String? orderId}) {
    for (final c in _conversations) {
      if (c.coversContext(sellerId: sellerId, productId: productId, orderId: orderId)) return c;
    }
    return null;
  }

  /// A conversation by id: from the inbox, or asked of the server. Null when it can't be found.
  Future<ChatConversation?> conversationById(String id) async {
    for (final c in _conversations) {
      if (c.id == id) return c;
    }
    try {
      return (await messages(id, limit: 1)).conversation;
    } catch (_) {
      return null;
    }
  }

  /// One page of a thread (`chat:messages`). Also brings the inbox row up to date.
  Future<ChatPage> messages(String conversationId, {String? before, int limit = 30}) async {
    final res = await _call('chat:messages', {
      'conversationId': conversationId,
      if (before != null) 'before': before,
      'limit': limit,
    });
    final page = ChatPage.fromJson(_asMap(res));
    final c = page.conversation;
    if (c != null && c.side == 'buyer') _upsert(c);
    return page;
  }

  // ---- writes ----

  /// First message to a store (`chat:start`): creates the thread, or reuses the one for the same context.
  Future<({ChatConversation conversation, ChatMessage message})> start({
    required String sellerId,
    String? productId,
    String? orderId,
    required String text,
    List<String> attachments = const [],
  }) async {
    final res = _asMap(await _call('chat:start', {
      'sellerId': sellerId,
      if ((productId ?? '').isNotEmpty) 'productId': productId,
      if ((orderId ?? '').isNotEmpty) 'orderId': orderId,
      'text': text,
      if (attachments.isNotEmpty) 'attachments': attachments,
    }));
    final conversation = ChatConversation.fromJson(_asMap(res['conversation']));
    final message = ChatMessage.fromJson(_asMap(res['message']));
    _upsert(conversation.copyWith(unread: 0));
    return (conversation: conversation, message: message);
  }

  /// Sends a message in an existing thread (`chat:send`).
  Future<ChatMessage> send(String conversationId, {String text = '', List<String> attachments = const []}) async {
    final res = _asMap(await _call('chat:send', {
      'conversationId': conversationId,
      'text': text,
      if (attachments.isNotEmpty) 'attachments': attachments,
    }));
    final message = ChatMessage.fromJson(_asMap(res['message']));
    final i = _conversations.indexWhere((c) => c.id == conversationId);
    if (i != -1) {
      _conversations[i] = _conversations[i].copyWith(
        lastMessagePreview: text.trim().isNotEmpty ? text.trim() : '📷',
        lastMessageAt: message.createdAt ?? DateTime.now(),
      );
      _sort();
      notifyListeners();
    }
    return message;
  }

  /// The customer read the thread: its unread count goes to zero here at once and on the server.
  Future<void> markRead(String conversationId) async {
    final i = _conversations.indexWhere((c) => c.id == conversationId);
    if (i != -1 && _conversations[i].unread > 0) {
      unread = (unread - _conversations[i].unread).clamp(0, 1 << 30);
      _conversations[i] = _conversations[i].copyWith(unread: 0);
      notifyListeners();
    }
    try {
      await _call('chat:markRead', {'conversationId': conversationId});
    } catch (_) {
      // Background: the next refresh corrects the counters.
    }
  }

  // ---- live pushes ----

  @visibleForTesting
  void onMessagePush(dynamic data) {
    if (data is! Map) return;
    final d = _asMap(data);
    if (d['conversation'] is! Map || d['message'] is! Map) return;
    final conv = ChatConversation.fromJson(_asMap(d['conversation']));
    if (conv.id.isEmpty || conv.side != 'buyer') return;
    final message = ChatMessage.fromJson(_asMap(d['message']));
    final known = _conversations.any((c) => c.id == conv.id);
    final open = openConversationId == conv.id;
    // The thread on screen reads what arrives at once.
    _upsert(open && !message.mine ? conv.copyWith(unread: 0) : conv);
    if (!known) unawaited(refreshUnread().catchError((Object _) {}));
    _incoming.add(message);
    if (open && !message.mine) unawaited(markRead(conv.id));
  }

  @visibleForTesting
  void onReadPush(dynamic data) {
    if (data is! Map) return;
    final d = _asMap(data);
    if (d['side']?.toString() == 'seller') return; // the store read our messages: nothing to change here
    final id = d['conversationId']?.toString() ?? '';
    final i = _conversations.indexWhere((c) => c.id == id);
    if (i == -1 || _conversations[i].unread == 0) return;
    unread = (unread - _conversations[i].unread).clamp(0, 1 << 30);
    _conversations[i] = _conversations[i].copyWith(unread: 0);
    notifyListeners();
  }

  // ---- helpers ----

  /// Replaces (or adds) a conversation and keeps [unread] in step with its unread count.
  void _upsert(ChatConversation c) {
    final i = _conversations.indexWhere((x) => x.id == c.id);
    final before = i == -1 ? 0 : _conversations[i].unread;
    if (i == -1) {
      _conversations.add(c);
    } else {
      _conversations[i] = c;
    }
    unread = (unread + c.unread - before).clamp(0, 1 << 30);
    _sort();
    notifyListeners();
  }

  void _sort() {
    // Newest activity first; a thread without any message yet goes last.
    _conversations.sort((a, b) {
      final x = a.lastMessageAt, y = b.lastMessageAt;
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return y.compareTo(x);
    });
  }
}
