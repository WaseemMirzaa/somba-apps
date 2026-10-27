import 'dart:convert';
import 'models.dart' show textOrNull;

/// A support ticket's states that no longer accept a reply: the rider opens a new ticket instead.
const kClosedTicketStatuses = {'closed', 'resolved'};

/// The categories a rider can pick when opening a ticket (texts: `cat_<id>`).
const kSupportCategories = ['general', 'delivery', 'orders', 'payment', 'account'];

/// One message of a ticket thread: `{id, from, fromId, role, text, at, attachments: [urls]}`.
class SupportMessage {
  const SupportMessage({required this.id, required this.from, this.fromId, this.role = '', this.text = '', this.at, this.attachments = const []});

  final String id;
  final String from;
  final String? fromId;
  final String role;
  final String text;
  final DateTime? at;
  final List<String> attachments;

  /// The rider wrote it (`userId` is the signed-in account); staff and admin messages are the other side.
  bool isMine(String? userId) => userId != null && fromId == userId;

  static SupportMessage? fromJson(dynamic v) {
    if (v is! Map) return null;
    final m = v.map((k, x) => MapEntry(k.toString(), x));
    return SupportMessage(
      id: '${m['id'] ?? ''}',
      from: m['from'] is String ? m['from'] as String : '',
      fromId: textOrNull(m['fromId']),
      role: m['role'] is String ? m['role'] as String : '',
      text: m['text'] is String ? m['text'] as String : '',
      at: m['at'] is String ? DateTime.tryParse(m['at'] as String)?.toLocal() : null,
      attachments: m['attachments'] is List ? (m['attachments'] as List).whereType<String>().toList() : const [],
    );
  }
}

/// A support ticket (`support:list` / `support:get` / `support:updated`). `messages` is a JSON string on the wire
/// (a list is accepted too).
class SupportTicket {
  const SupportTicket({
    required this.id,
    this.reference = '',
    this.subject = '',
    this.category = 'general',
    this.orderId,
    this.status = 'open',
    this.assigneeName,
    this.userUnread = 0,
    this.messages = const [],
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String reference;
  final String subject;
  final String category;
  final String? orderId;
  final String status;
  final String? assigneeName;

  /// Staff messages the rider has not read yet.
  final int userUnread;
  final List<SupportMessage> messages;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  bool get isClosed => kClosedTicketStatuses.contains(status);
  bool get hasUnread => userUnread > 0;
  SupportMessage? get last => messages.isEmpty ? null : messages.last;

  SupportTicket withUnread(int n) => SupportTicket(
        id: id,
        reference: reference,
        subject: subject,
        category: category,
        orderId: orderId,
        status: status,
        assigneeName: assigneeName,
        userUnread: n,
        messages: messages,
        createdAt: createdAt,
        updatedAt: updatedAt,
      );

  static List<SupportMessage> parseMessages(dynamic raw) {
    var v = raw;
    if (v is String) {
      try {
        v = jsonDecode(v);
      } catch (_) {
        return const [];
      }
    }
    if (v is! List) return const [];
    return v.map(SupportMessage.fromJson).whereType<SupportMessage>().toList();
  }

  static DateTime? _date(dynamic v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

  factory SupportTicket.fromJson(Map<String, dynamic> j) => SupportTicket(
        id: j['id'] as String,
        reference: j['reference'] is String ? j['reference'] as String : '',
        subject: j['subject'] is String ? j['subject'] as String : '',
        category: textOrNull(j['category']) ?? 'general',
        orderId: textOrNull(j['orderId']),
        status: textOrNull(j['status']) ?? 'open',
        assigneeName: textOrNull(j['assigneeName']),
        userUnread: (j['userUnread'] as num?)?.toInt() ?? 0,
        messages: parseMessages(j['messages']),
        createdAt: _date(j['createdAt']),
        updatedAt: _date(j['updatedAt']),
      );
}
