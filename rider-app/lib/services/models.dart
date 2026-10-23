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

  /// What it is about: the delivery task for `task` notices (a tap opens it).
  final String? entityId;
  final DateTime? createdAt;

  NotificationDto({required this.id, required this.title, required this.body, required this.type, required this.read, this.entityId, this.createdAt});

  factory NotificationDto.fromJson(Map<String, dynamic> j) => NotificationDto(
        id: j['id'] as String,
        title: j['title'] as String? ?? '',
        body: j['body'] as String? ?? '',
        type: j['type'] as String? ?? 'system',
        read: j['read'] as bool? ?? false,
        entityId: j['entityId'] is String && (j['entityId'] as String).isNotEmpty ? j['entityId'] as String : null,
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
      );

  NotificationDto asRead() => NotificationDto(id: id, title: title, body: body, type: type, read: true, entityId: entityId, createdAt: createdAt);
}

/// Where the rider works (`rider:assignment`): home warehouse, the zones it serves and the rider's own zones.
class RiderAssignment {
  const RiderAssignment({this.hubName, this.hubCity, this.preferredZones = const [], this.hubZones = const []});

  final String? hubName;
  final String? hubCity;
  final List<String> preferredZones;
  final List<String> hubZones;

  bool get hasHub => hubName != null;

  static List<String> _names(dynamic v) =>
      v is List ? v.whereType<Map>().map((z) => '${z['name'] ?? z['id'] ?? ''}').where((n) => n.isNotEmpty).toList() : const [];

  factory RiderAssignment.fromJson(Map<String, dynamic> j) {
    final hub = j['hub'] is Map ? j['hub'] as Map : null;
    return RiderAssignment(
      hubName: hub?['name'] as String?,
      hubCity: hub?['city'] as String?,
      preferredZones: _names(j['preferredZones']),
      hubZones: _names(j['hubZones']),
    );
  }
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

  /// The zone's name, and whether it is one of the rider's own zones (the server lists those first).
  final String? zoneName;
  final bool preferred;
  final String? addressRaw;
  final String? customerName;
  final String? paymentMethod;
  final double totalUsd;
  final List<OrderLine> items;
  final DateTime? createdAt;
  final String? pickupAddress;
  final int attempts;
  final String? failureReason;
  final DateTime? readyAt;
  final DateTime? receivedAt;

  /// Expected delivery day (YYYY-MM-DD), from the sellers' delivery times for the order's products.
  final String? estimatedDeliveryDate;

  DeliveryTaskDto({
    required this.id,
    required this.orderId,
    required this.orderReference,
    required this.status,
    required this.codAmountUsd,
    this.zoneId,
    this.zoneName,
    this.preferred = false,
    this.addressRaw,
    this.customerName,
    this.paymentMethod,
    this.totalUsd = 0,
    this.items = const [],
    this.createdAt,
    this.pickupAddress,
    this.attempts = 1,
    this.failureReason,
    this.readyAt,
    this.receivedAt,
    this.estimatedDeliveryDate,
  });

  /// "26/10" for the card (null when the order has no estimate or it is malformed).
  String? get deliverByText {
    final v = estimatedDeliveryDate;
    if (v == null || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v)) return null;
    return '${v.substring(8, 10)}/${v.substring(5, 7)}';
  }

  bool get isActive => const {'assigned', 'picked_up', 'in_transit'}.contains(status);
  bool get isOpen => status == 'unassigned';
  bool get isFinished => status == 'delivered' || status == 'failed';
  bool get collectsCash => codAmountUsd > 0;

  /// A readable delivery address (the order stores it as JSON); empty when none was given.
  String get address {
    final raw = addressRaw;
    if (raw == null || raw.isEmpty) return '';
    try {
      final m = jsonDecode(raw);
      if (m is Map) {
        final parts = [m['line1'], m['line2'], m['commune'], m['city']].where((e) => e != null && '$e'.trim().isNotEmpty).map((e) => '$e'.trim());
        if (parts.isNotEmpty) return parts.join(', ');
      }
    } catch (_) {/* plain text */}
    return raw;
  }

  /// The address as a maps search: street, commune and city only. The landmark (`line2`, "blue gate, near the
  /// church") helps the rider on the spot but makes a geocoder find nothing, so it is left out.
  String get mapsQuery {
    final raw = addressRaw;
    if (raw == null || raw.isEmpty) return '';
    try {
      final m = jsonDecode(raw);
      if (m is Map) {
        final parts = [m['line1'], m['commune'], m['city']].where((e) => e != null && '$e'.trim().isNotEmpty).map((e) => '$e'.trim());
        if (parts.isNotEmpty) return parts.join(', ');
      }
    } catch (_) {/* plain text */}
    return raw;
  }

  /// The exact spot the customer pinned on the map when ordering (null when the address was typed by hand).
  ({double lat, double lng})? get pin {
    final raw = addressRaw;
    if (raw == null || raw.isEmpty) return null;
    try {
      final m = jsonDecode(raw);
      final g = m is Map ? m['geo'] : null;
      if (g is Map) {
        final lat = (g['lat'] as num?)?.toDouble();
        final lng = (g['lng'] as num?)?.toDouble();
        if (lat != null && lng != null && lat.abs() <= 90 && lng.abs() <= 180) return (lat: lat, lng: lng);
      }
    } catch (_) {/* plain text address */}
    return null;
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

  static DateTime? _date(dynamic v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
  static String? _str(dynamic v) => v is String && v.trim().isNotEmpty ? v.trim() : null;

  factory DeliveryTaskDto.fromJson(Map<String, dynamic> j) {
    final o = j['order'] is Map ? (j['order'] as Map).map((k, v) => MapEntry(k.toString(), v)) : <String, dynamic>{};
    return DeliveryTaskDto(
      id: j['id'] as String,
      orderId: j['orderId'] as String? ?? '',
      orderReference: j['orderReference'] as String? ?? '',
      status: j['status'] as String? ?? 'unassigned',
      codAmountUsd: (j['codAmountUsd'] as num?)?.toDouble() ?? 0,
      zoneId: j['zoneId'] as String?,
      zoneName: _str(j['zoneName']),
      preferred: j['preferred'] == true,
      addressRaw: (o['shippingAddress'] as String?) ?? (j['address'] as String?),
      customerName: o['customerName'] as String?,
      paymentMethod: o['paymentMethod'] as String?,
      totalUsd: (o['totalUsd'] as num?)?.toDouble() ?? 0,
      items: ((o['items'] as List?) ?? const [])
          .map((e) => OrderLine((e as Map)['productName']?.toString() ?? '', (e['qty'] as num?)?.toInt() ?? 1))
          .toList(),
      createdAt: _date(j['createdAt']),
      pickupAddress: _str(j['pickupAddress']),
      attempts: (j['attempts'] as num?)?.toInt() ?? 1,
      failureReason: _str(j['failureReason']),
      readyAt: _date(j['readyAt']),
      receivedAt: _date(j['receivedAt']),
      estimatedDeliveryDate: _str(o['estimatedDeliveryDate']),
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
