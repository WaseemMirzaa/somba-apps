import 'package:flutter/foundation.dart';
import 'feature_hooks.dart';
import 'models.dart' show pickLang;
import 'text_i18n.dart';
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

/// One customer <-> store thread, as the viewer sees it (`chat:list`, `chat:messages`).
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
    this.lastMessageI18n,
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

  /// The last message from the store in English and French, when the thread's push carried them (null otherwise).
  /// Only ever the store's text: what the customer wrote is shown as written.
  final TextI18n? lastMessageI18n;
  final int unread;

  /// The inbox preview in [lang]: the payload's text for that language when it has one, else the preview as sent.
  String previewFor(String lang) => lastMessageI18n?.forLang(lang) ?? lastMessagePreview;

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
        lastMessageI18n: TextI18n.tryParse(j['lastMessageI18n']),
        unread: _int(j['unread']),
      );
}

/// One message of a thread (`chat:messages`).
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
    this.textI18n,
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

  /// [text] in English and French, as the server already has them (null when it has none).
  final TextI18n? textI18n;

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
      textI18n: TextI18n.tryParse(j['textI18n']),
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

/// The shopper's OLD chats with stores. Messaging stores is closed (`docs/contracts/admin-controls.md` section 3): the
/// server still answers `chat:list` and `chat:messages`, so history stays readable, and nothing can be sent. The store
/// binds no live pushes, loads nothing at sign-in and keeps no unread count; it only forgets everything on sign-out.
class ChatStore extends ChangeNotifier {
  ChatStore._();
  static final ChatStore instance = ChatStore._();

  static const int pageSize = 30;

  final List<ChatConversation> _conversations = [];

  /// Conversations as the customer sees them, newest activity first.
  List<ChatConversation> get conversations => List.unmodifiable(_conversations);

  bool loaded = false;
  bool loading = false;

  /// More conversations exist beyond the ones loaded.
  bool hasMoreConversations = false;

  Future<dynamic> _call(String event, [Map<String, dynamic>? body]) => RealtimeStore.instance.call(event, body);

  FeatureHook get hook => FeatureHook(name: 'chat', reset: reset);

  void reset() {
    _conversations.clear();
    loaded = false;
    loading = false;
    hasMoreConversations = false;
    notifyListeners();
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

  /// One page of a thread (`chat:messages`), oldest first.
  Future<ChatPage> messages(String conversationId, {String? before, int limit = 30}) async {
    final res = await _call('chat:messages', {
      'conversationId': conversationId,
      if (before != null) 'before': before,
      'limit': limit,
    });
    return ChatPage.fromJson(_asMap(res));
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
