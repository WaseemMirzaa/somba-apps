// Lightweight DTOs mirroring the API payloads.
import 'dart:convert';

class BackendUser {
  final String id;
  final String email;
  final String name;
  final String role;
  final String? phone;

  BackendUser({required this.id, required this.email, required this.name, required this.role, this.phone});

  factory BackendUser.fromJson(Map<String, dynamic> j) => BackendUser(
        id: j['id'] as String,
        email: j['email'] as String? ?? '',
        name: j['name'] as String? ?? '',
        role: j['role'] as String? ?? 'rider',
        phone: j['phone'] as String?,
      );
}

class NotificationDto {
  final String id;
  final String title;
  final String body;
  final String type;
  final bool read;

  NotificationDto({required this.id, required this.title, required this.body, required this.type, required this.read});

  factory NotificationDto.fromJson(Map<String, dynamic> j) => NotificationDto(
        id: j['id'] as String,
        title: j['title'] as String? ?? '',
        body: j['body'] as String? ?? '',
        type: j['type'] as String? ?? 'system',
        read: j['read'] as bool? ?? false,
      );
}

class OrderLine {
  final String name;
  final int qty;
  const OrderLine(this.name, this.qty);
}

/// One delivery: the task plus a snapshot of its order (customer, items, payment).
class DeliveryTaskDto {
  final String id;
  final String orderId;
  final String orderReference;
  final String status; // unassigned | assigned | picked_up | in_transit | delivered | failed
  final double codAmountUsd;
  final String? zoneId;
  final String? addressRaw;
  final String? customerName;
  final String? paymentMethod;
  final double totalUsd;
  final List<OrderLine> items;
  final DateTime? createdAt;

  DeliveryTaskDto({
    required this.id,
    required this.orderId,
    required this.orderReference,
    required this.status,
    required this.codAmountUsd,
    this.zoneId,
    this.addressRaw,
    this.customerName,
    this.paymentMethod,
    this.totalUsd = 0,
    this.items = const [],
    this.createdAt,
  });

  bool get isActive => const {'assigned', 'picked_up', 'in_transit'}.contains(status);
  bool get isOpen => status == 'unassigned';
  bool get isFinished => status == 'delivered' || status == 'failed';
  bool get collectsCash => codAmountUsd > 0;

  /// A readable delivery address (the order stores it as JSON).
  String get address {
    final raw = addressRaw;
    if (raw == null || raw.isEmpty) return 'Address not provided';
    try {
      final m = jsonDecode(raw);
      if (m is Map) {
        final parts = [m['line1'], m['line2'], m['commune'], m['city']].where((e) => e != null && '$e'.trim().isNotEmpty).map((e) => '$e'.trim());
        if (parts.isNotEmpty) return parts.join(', ');
      }
    } catch (_) {/* plain text */}
    return raw;
  }

  String? get phone {
    final raw = addressRaw;
    if (raw == null) return null;
    try {
      final m = jsonDecode(raw);
      if (m is Map && m['phone'] != null && '${m['phone']}'.trim().isNotEmpty) return '${m['phone']}'.trim();
    } catch (_) {}
    return null;
  }

  factory DeliveryTaskDto.fromJson(Map<String, dynamic> j) {
    final o = j['order'] is Map ? (j['order'] as Map).map((k, v) => MapEntry(k.toString(), v)) : <String, dynamic>{};
    return DeliveryTaskDto(
      id: j['id'] as String,
      orderId: j['orderId'] as String? ?? '',
      orderReference: j['orderReference'] as String? ?? '',
      status: j['status'] as String? ?? 'unassigned',
      codAmountUsd: (j['codAmountUsd'] as num?)?.toDouble() ?? 0,
      zoneId: j['zoneId'] as String?,
      addressRaw: (o['shippingAddress'] as String?) ?? (j['address'] as String?),
      customerName: o['customerName'] as String?,
      paymentMethod: o['paymentMethod'] as String?,
      totalUsd: (o['totalUsd'] as num?)?.toDouble() ?? 0,
      items: ((o['items'] as List?) ?? const [])
          .map((e) => OrderLine((e as Map)['productName']?.toString() ?? '', (e['qty'] as num?)?.toInt() ?? 1))
          .toList(),
      createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
    );
  }
}

class EarningsDto {
  final int totalTasks;
  final int delivered;
  final int active;
  final double codCollectedUsd;
  final double earningsUsd;

  const EarningsDto({this.totalTasks = 0, this.delivered = 0, this.active = 0, this.codCollectedUsd = 0, this.earningsUsd = 0});

  factory EarningsDto.fromJson(Map<String, dynamic> j) => EarningsDto(
        totalTasks: (j['totalTasks'] as num?)?.toInt() ?? 0,
        delivered: (j['delivered'] as num?)?.toInt() ?? 0,
        active: (j['active'] as num?)?.toInt() ?? 0,
        codCollectedUsd: (j['codCollectedUsd'] as num?)?.toDouble() ?? 0,
        earningsUsd: (j['earningsUsd'] as num?)?.toDouble() ?? 0,
      );
}
