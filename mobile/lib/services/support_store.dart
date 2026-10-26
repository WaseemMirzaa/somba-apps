import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'feature_hooks.dart';
import 'realtime_store.dart';

Map<String, dynamic> _asMap(dynamic d) => (d as Map).map((k, v) => MapEntry(k.toString(), v));

int _int(dynamic v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

DateTime? _date(dynamic v) => v is String && v.isNotEmpty ? DateTime.tryParse(v)?.toLocal() : null;

/// One message of a support ticket (an entry of the ticket's `messages` JSON array).
class TicketMessage {
  const TicketMessage({this.id = '', this.from = '', this.fromId = '', this.role = '', this.text = '', this.at, this.attachments = const []});

  final String id;
  final String from;
  final String fromId;

  /// The sender's role: `customer`, or an `admin…` role for Somba support staff.
  final String role;
  final String text;
  final DateTime? at;
  final List<String> attachments;

  bool get fromStaff => role.startsWith('admin');

  factory TicketMessage.fromJson(Map<String, dynamic> j) {
    final raw = j['attachments'];
    return TicketMessage(
      id: j['id']?.toString() ?? '',
      from: j['from']?.toString() ?? '',
      fromId: j['fromId']?.toString() ?? '',
      role: j['role']?.toString() ?? '',
      text: j['text']?.toString() ?? '',
      at: _date(j['at']),
      attachments: raw is List ? [for (final u in raw) if (u is String && u.isNotEmpty) u] : const [],
    );
  }
}

/// A support ticket as returned by `support:list` / `support:get` / `support:open` / `support:reply` and pushed by
/// `support:updated`. Older tickets lack the counters, the order link and the attachments: every one defaults.
class TicketView {
  const TicketView({
    required this.id,
    this.reference = '',
    this.subject = '',
    this.status = 'open',
    this.category = 'general',
    this.orderId,
    this.userUnread = 0,
    this.messages = const [],
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String reference;
  final String subject;

  /// `open` | `pending` | `resolved` | `closed`.
  final String status;
  final String category;
  final String? orderId;

  /// Staff messages the customer has not read.
  final int userUnread;
  final List<TicketMessage> messages;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  /// Resolved or closed tickets take no more replies.
  bool get isClosed => status == 'resolved' || status == 'closed';

  factory TicketView.fromJson(Map<String, dynamic> j) {
    // `messages` is a JSON STRING on the wire; an already-decoded list is accepted too.
    dynamic raw = j['messages'];
    if (raw is String) {
      try {
        raw = jsonDecode(raw.isEmpty ? '[]' : raw);
      } catch (_) {
        raw = const [];
      }
    }
    final order = j['orderId']?.toString() ?? '';
    return TicketView(
      id: j['id']?.toString() ?? '',
      reference: j['reference']?.toString() ?? '',
      subject: j['subject']?.toString() ?? '',
      status: (j['status']?.toString() ?? '').isEmpty ? 'open' : j['status'].toString(),
      category: (j['category']?.toString() ?? '').isEmpty ? 'general' : j['category'].toString(),
      orderId: order.isEmpty ? null : order,
      userUnread: _int(j['userUnread']),
      messages: [
        if (raw is List)
          for (final m in raw)
            if (m is Map) TicketMessage.fromJson(_asMap(m)),
      ],
      createdAt: _date(j['createdAt']),
      updatedAt: _date(j['updatedAt']),
    );
  }
}

/// The shopper's support tickets: the list, the unread total behind the Support badge, and the live updates.
class SupportStore extends ChangeNotifier {
  SupportStore._();
  static final SupportStore instance = SupportStore._();

  final List<TicketView> _tickets = [];

  /// Tickets, most recently updated first.
  List<TicketView> get tickets => List.unmodifiable(_tickets);

  bool loaded = false;
  bool loading = false;

  /// The ticket on screen: a staff reply that arrives for it is marked read at once.
  String? openTicketId;

  /// Staff replies the customer has not read, across all tickets.
  int get unread => _tickets.fold(0, (n, t) => n + t.userUnread);

  Future<dynamic> _call(String event, [Map<String, dynamic>? body]) => RealtimeStore.instance.call(event, body);

  FeatureHook get hook => FeatureHook(
        name: 'support',
        pushes: {'support:updated': onUpdatedPush},
        hydrate: (_) => load(),
        reset: reset,
      );

  void reset() {
    _tickets.clear();
    loaded = false;
    loading = false;
    openTicketId = null;
    notifyListeners();
  }

  TicketView? byId(String id) {
    for (final t in _tickets) {
      if (t.id == id) return t;
    }
    return null;
  }

  /// Loads every ticket of the account. Throws when the server refuses (offline…).
  Future<void> load() async {
    loading = true;
    notifyListeners();
    try {
      final res = await _call('support:list');
      final rows = [
        if (res is List)
          for (final e in res)
            if (e is Map) TicketView.fromJson(_asMap(e)),
      ].where((t) => t.id.isNotEmpty);
      _tickets
        ..clear()
        ..addAll(rows);
      _sort();
      loaded = true;
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// A ticket by id: kept, or fetched (`support:get`). Null when it can't be found.
  Future<TicketView?> fetch(String id) async {
    try {
      final res = await _call('support:get', {'id': id});
      if (res is! Map) return byId(id);
      final t = TicketView.fromJson(_asMap(res));
      if (t.id.isEmpty) return byId(id);
      _upsert(t);
      return t;
    } catch (_) {
      return byId(id);
    }
  }

  /// Opens a ticket (`support:open`).
  Future<TicketView> open({
    required String subject,
    required String message,
    String category = 'other',
    String? orderId,
    List<String> attachments = const [],
  }) async {
    final res = await _call('support:open', {
      'subject': subject,
      'message': message,
      'category': category,
      if ((orderId ?? '').isNotEmpty) 'orderId': orderId,
      if (attachments.isNotEmpty) 'attachments': attachments,
    });
    final t = TicketView.fromJson(_asMap(res));
    _upsert(t);
    return t;
  }

  /// Answers a ticket (`support:reply`): [text] and / or photos.
  Future<TicketView> reply(String id, {String text = '', List<String> attachments = const []}) async {
    final res = await _call('support:reply', {
      'id': id,
      if (text.isNotEmpty) 'text': text,
      if (attachments.isNotEmpty) 'attachments': attachments,
    });
    final t = TicketView.fromJson(_asMap(res));
    _upsert(t);
    return t;
  }

  /// The customer read the ticket: its unread count goes to zero here at once and on the server.
  Future<void> markRead(String id) async {
    final i = _tickets.indexWhere((t) => t.id == id);
    if (i != -1 && _tickets[i].userUnread > 0) {
      _tickets[i] = _copy(_tickets[i], userUnread: 0);
      notifyListeners();
    }
    try {
      final res = await _call('support:markRead', {'id': id});
      if (res is Map) {
        final t = TicketView.fromJson(_asMap(res));
        if (t.id.isNotEmpty) _upsert(t);
      }
    } catch (_) {
      // Background: the next load corrects the counter.
    }
  }

  @visibleForTesting
  void onUpdatedPush(dynamic data) {
    if (data is! Map) return;
    final t = TicketView.fromJson(_asMap(data));
    if (t.id.isEmpty) return;
    final open = openTicketId == t.id;
    _upsert(open && t.userUnread > 0 ? _copy(t, userUnread: 0) : t);
    // A staff message that lands while the ticket is open is read at once.
    if (open && t.userUnread > 0) unawaited(markRead(t.id));
  }

  void _upsert(TicketView t) {
    final i = _tickets.indexWhere((x) => x.id == t.id);
    if (i == -1) {
      _tickets.add(t);
    } else {
      _tickets[i] = t;
    }
    _sort();
    notifyListeners();
  }

  void _sort() {
    _tickets.sort((a, b) {
      final x = a.updatedAt ?? a.createdAt, y = b.updatedAt ?? b.createdAt;
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return y.compareTo(x);
    });
  }

  TicketView _copy(TicketView t, {int? userUnread}) => TicketView(
        id: t.id,
        reference: t.reference,
        subject: t.subject,
        status: t.status,
        category: t.category,
        orderId: t.orderId,
        userUnread: userUnread ?? t.userUnread,
        messages: t.messages,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      );
}
