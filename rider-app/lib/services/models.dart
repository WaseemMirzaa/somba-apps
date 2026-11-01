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

/// A non-empty, trimmed text field; null when missing, blank or not a string (older servers omit the new fields).
String? textOrNull(Object? v) => v is String && v.trim().isNotEmpty ? v.trim() : null;

class NotificationDto {
  final String id;
  final String title;
  final String body;

  /// The server's French wording (null on older servers: the phone's own patterns translate instead).
  final String? titleFr;
  final String? bodyFr;
  final String type;
  final bool read;

  /// What it is about: the delivery task for `task` notices (a tap opens it).
  final String? entityId;
  final DateTime? createdAt;

  NotificationDto({
    required this.id,
    required this.title,
    required this.body,
    this.titleFr,
    this.bodyFr,
    required this.type,
    required this.read,
    this.entityId,
    this.createdAt,
  });

  factory NotificationDto.fromJson(Map<String, dynamic> j) => NotificationDto(
        id: j['id'] as String,
        title: j['title'] as String? ?? '',
        body: j['body'] as String? ?? '',
        titleFr: textOrNull(j['titleFr']),
        bodyFr: textOrNull(j['bodyFr']),
        type: j['type'] as String? ?? 'system',
        read: j['read'] as bool? ?? false,
        entityId: j['entityId'] is String && (j['entityId'] as String).isNotEmpty ? j['entityId'] as String : null,
        createdAt: j['createdAt'] is String ? DateTime.tryParse(j['createdAt'] as String)?.toLocal() : null,
      );

  NotificationDto asRead() =>
      NotificationDto(id: id, title: title, body: body, titleFr: titleFr, bodyFr: bodyFr, type: type, read: true, entityId: entityId, createdAt: createdAt);
}

/// Where the rider works (`rider:assignment` -> `{hub}`): the home warehouse, whose staff assign the rider's tasks.
/// Older payloads also carried zones; those keys are ignored.
class RiderAssignment {
  const RiderAssignment({this.hubId, this.hubName, this.hubCity, this.hubAddress, this.hubAreaId, this.coverage});

  final String? hubId;
  final String? hubName;
  final String? hubCity;
  final String? hubAddress;

  /// The area the warehouse itself stands in (`hub.areaId`; null on an older server).
  final String? hubAreaId;

  /// The areas the home warehouse delivers to (`hub.coverage`, or the `hubs:coverage` answer when the assignment does not
  /// carry it), read-only. Null when no server told the rider (then only the warehouse is shown); an empty list means
  /// the warehouse has no area yet.
  final List<CoverageArea>? coverage;

  /// The covered areas, empty when unknown.
  List<CoverageArea> get areas => coverage ?? const [];

  bool get hasHub => hubName != null;

  RiderAssignment withCoverage(List<CoverageArea> areas) =>
      RiderAssignment(hubId: hubId, hubName: hubName, hubCity: hubCity, hubAddress: hubAddress, hubAreaId: hubAreaId, coverage: areas);

  factory RiderAssignment.fromJson(Map<String, dynamic> j) {
    final hub = j['hub'] is Map ? (j['hub'] as Map).map((k, v) => MapEntry(k.toString(), v)) : null;
    return RiderAssignment(
      hubId: textOrNull(hub?['id']),
      hubName: textOrNull(hub?['name']),
      hubCity: textOrNull(hub?['city']),
      hubAddress: textOrNull(hub?['address']),
      hubAreaId: textOrNull(hub?['areaId']),
      coverage: hub != null && hub['coverage'] is List ? CoverageArea.listFrom(hub['coverage']) : null,
    );
  }
}

/// An area a warehouse covers (docs/contracts/areas.md: `hub.coverage` of `rider:assignment` and the `areas` of
/// `hubs:coverage`, each an `Area & {feeOverrideUsd}`): shown by name in the rider's language.
class CoverageArea {
  const CoverageArea({required this.id, required this.level, required this.name, this.nameEn});

  final String id;

  /// `country` | `province` | `city` | `district` | `commune` | `quartier`.
  final String level;

  /// The official (French) name, and the English one when it differs.
  final String name;
  final String? nameEn;

  String nameFor(String lang) => lang == 'en' ? (nameEn ?? name) : name;

  static const _order = ['country', 'province', 'city', 'district', 'commune', 'quartier'];

  factory CoverageArea.fromJson(Map<String, dynamic> j) {
    final name = textOrNull(j['name']) ?? textOrNull(j['googleName']) ?? textOrNull(j['nameEn']) ?? '';
    final en = textOrNull(j['nameEn']);
    return CoverageArea(id: '${j['id'] ?? j['areaId'] ?? name}', level: textOrNull(j['level']) ?? 'commune', name: name, nameEn: en == null || en == name ? null : en);
  }

  /// The areas of a payload, widest first (a province before its cities), then by name; malformed rows are dropped.
  static List<CoverageArea> listFrom(Object? raw) {
    if (raw is! List) return const [];
    final out = [for (final e in raw) if (e is Map) CoverageArea.fromJson(e.map((k, v) => MapEntry(k.toString(), v)))]..removeWhere((a) => a.name.isEmpty);
    out.sort((a, b) {
      final l = _order.indexOf(a.level).compareTo(_order.indexOf(b.level));
      return l != 0 ? l : a.name.compareTo(b.name);
    });
    return out;
  }
}

/// A transfer run (docs/contracts/areas.md, UC-11): one trip with many parcels from one warehouse to the next. The
/// sending warehouse plans, assigns and dispatches it; the receiving warehouse scans it in. The driver sees one card.
class TransferRun {
  const TransferRun({
    required this.id,
    required this.reference,
    this.fromHubId,
    this.fromHubName,
    this.toHubId,
    this.toHubName,
    this.riderId,
    this.riderName,
    this.status = 'planned',
    this.taskIds = const [],
    required this.count,
    this.receivedCount = 0,
    this.missingCount = 0,
    this.createdAt,
    this.dispatchedAt,
    this.arrivedAt,
    this.closedAt,
    this.inTransit = false,
    this.inTransitAt,
    this.hop,
    this.hops,
  });

  final String id;
  final String reference;
  final String? fromHubId, fromHubName, toHubId, toHubName, riderId, riderName;

  /// `planned` | `dispatched` | `arrived` | `closed`.
  final String status;
  final List<String> taskIds;
  final int count, receivedCount, missingCount;
  final DateTime? createdAt, dispatchedAt, arrivedAt, closedAt;

  /// The driver reported the run on the road (`Run.inTransit`: set by `rider:runStatus`, or by an `in_transit` update of
  /// one of its parcels) and when (`Run.inTransitAt`). False when the payload does not say (older servers).
  final bool inTransit;
  final DateTime? inTransitAt;

  /// Which hop of a multi-hop route this run carries, when the server says (else the parcels' own hop tells).
  final int? hop;
  final int? hops;

  bool get isPlanned => status == 'planned';
  bool get isDispatched => status == 'dispatched';
  bool get isArrived => status == 'arrived';
  bool get isClosed => status == 'closed';

  /// The receiving warehouse scanned in every parcel: the driver's part of the run is over.
  bool get allReceived => count > 0 && receivedCount >= count;

  /// Still the driver's job: not closed, and not every parcel scanned in yet (a run the warehouse has fully received
  /// moves to Done even before the desk closes it).
  bool get isActive => !isClosed && !(isArrived && allReceived);

  TransferRun copyWith({bool? inTransit}) => TransferRun(
        id: id,
        reference: reference,
        fromHubId: fromHubId,
        fromHubName: fromHubName,
        toHubId: toHubId,
        toHubName: toHubName,
        riderId: riderId,
        riderName: riderName,
        status: status,
        taskIds: taskIds,
        count: count,
        receivedCount: receivedCount,
        missingCount: missingCount,
        createdAt: createdAt,
        dispatchedAt: dispatchedAt,
        arrivedAt: arrivedAt,
        closedAt: closedAt,
        inTransit: inTransit ?? this.inTransit,
        inTransitAt: inTransitAt,
        hop: hop,
        hops: hops,
      );

  static DateTime? _t(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
  static int _n(Object? v) => v is num ? v.toInt() : 0;

  factory TransferRun.fromJson(Map<String, dynamic> j) {
    final ids = j['taskIds'] is List ? [for (final e in j['taskIds'] as List) if (e is String && e.isNotEmpty) e] : <String>[];
    final raw = textOrNull(j['status']) ?? 'planned';
    final leftAt = _t(j['inTransitAt']);
    return TransferRun(
      id: j['id'] as String,
      reference: textOrNull(j['reference']) ?? '',
      fromHubId: textOrNull(j['fromHubId']),
      fromHubName: textOrNull(j['fromHubName']),
      toHubId: textOrNull(j['toHubId']),
      toHubName: textOrNull(j['toHubName']),
      riderId: textOrNull(j['riderId']),
      riderName: textOrNull(j['riderName']),
      // a server that reports the road as a status of its own is read as "dispatched, on the road"
      status: raw == 'in_transit' ? 'dispatched' : raw,
      taskIds: ids,
      count: j['count'] is num ? _n(j['count']) : ids.length,
      receivedCount: _n(j['receivedCount']),
      missingCount: _n(j['missingCount']),
      createdAt: _t(j['createdAt']),
      dispatchedAt: _t(j['dispatchedAt']),
      arrivedAt: _t(j['arrivedAt']),
      closedAt: _t(j['closedAt']),
      // `inTransit` is the contract's flag; an older payload may only carry the time, or report the road as a status
      inTransit: j['inTransit'] is bool ? j['inTransit'] as bool : (raw == 'in_transit' || leftAt != null),
      inTransitAt: leftAt,
      hop: j['hop'] is num ? (j['hop'] as num).toInt() : null,
      hops: j['hops'] is num ? (j['hops'] as num).toInt() : null,
    );
  }

  static List<TransferRun> listFrom(Object? raw) {
    final list = raw is Map ? raw['runs'] : raw;
    if (list is! List) return const [];
    final out = <TransferRun>[];
    for (final e in list) {
      if (e is! Map || e['id'] is! String) continue;
      out.add(TransferRun.fromJson(e.map((k, v) => MapEntry(k.toString(), v))));
    }
    return out;
  }
}

/// The kinds of leg a delivery task can be (docs/contracts/logistics.md section 6).
abstract final class LegKind {
  static const pickup = 'pickup';
  static const transfer = 'transfer';
  static const delivery = 'delivery';
  static const returnPickup = 'return_pickup';
  static const returnTransfer = 'return_transfer';
  static const returnToSeller = 'return_to_seller';
  static const replacementDelivery = 'replacement_delivery';

  static const all = [pickup, transfer, delivery, returnPickup, returnTransfer, returnToSeller, replacementDelivery];

  /// Legs that end at a warehouse: finished by the warehouse staff scanning the parcel in, never by the rider.
  static const hubBound = {pickup, transfer, returnPickup, returnTransfer};
}

/// One end of a leg: `{type: seller|hub|customer, id, name, address, lat, lng, city, phone}`.
class TaskEndpoint {
  const TaskEndpoint({required this.type, this.id, this.name, this.address, this.lat, this.lng, this.city, this.phone});

  final String type;
  final String? id;
  final String? name;
  final String? address;
  final double? lat;
  final double? lng;
  final String? city;
  final String? phone;

  bool get isCustomer => type == 'customer';
  bool get isHub => type == 'hub';
  bool get isSeller => type == 'seller';

  /// The map point, when both coordinates are present and possible.
  ({double lat, double lng})? get pin {
    final la = lat, ln = lng;
    if (la == null || ln == null || la.abs() > 90 || ln.abs() > 180) return null;
    return (lat: la, lng: ln);
  }

  /// "Kinshasa Hub, 12 Boulevard du 30 Juin" (the name and the address, whichever exist).
  String get label => [name, address].whereType<String>().join(', ');

  static TaskEndpoint? fromJson(dynamic v) {
    if (v is! Map) return null;
    final m = v.map((k, x) => MapEntry(k.toString(), x));
    return TaskEndpoint(
      type: textOrNull(m['type']) ?? '',
      id: textOrNull(m['id']),
      name: textOrNull(m['name']),
      address: textOrNull(m['address']),
      lat: (m['lat'] as num?)?.toDouble(),
      lng: (m['lng'] as num?)?.toDouble(),
      city: textOrNull(m['city']),
      phone: textOrNull(m['phone']),
    );
  }
}

class OrderLine {
  final String name;
  final int qty;

  /// The name as the order snapshotted it in French (empty on older servers and old orders).
  final String nameFr;
  const OrderLine(this.name, this.qty, {this.nameFr = ''});

  /// The product name in the rider's language: French when asked and present, else the stored name.
  String displayName(String lang) => lang == 'fr' && nameFr.trim().isNotEmpty ? nameFr.trim() : name;

  /// "2× Phone" in [lang].
  String text(String lang) => '$qty× ${displayName(lang)}';
}

/// One leg of a delivery (a task): what the warehouse assigned, plus a snapshot of its order. Old payloads (no `kind`,
/// no endpoints) are a plain `delivery` read from the order's address.
class DeliveryTaskDto {
  final String id;
  final String orderId;
  final String orderReference;
  final String status; // assigned | picked_up | in_transit | delivered | failed (unassigned never reaches a rider)
  final double codAmountUsd;
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

  /// Which leg this is (`LegKind`); `delivery` when the server does not say.
  final String kind;
  final String? fromHubId;
  final String? toHubId;
  final String? sellerId;
  final String? sellerName;
  final String? parentTaskId;
  final String? disputeId;
  final String? replacementId;
  final String? exchangeId;
  final TaskEndpoint? from;
  final TaskEndpoint? to;
  final TaskEndpoint? fromHub;
  final TaskEndpoint? toHub;

  /// The transfer run this parcel travels in (null: on its own), and its reference.
  final String? runId;
  final String? runReference;

  /// Which hop of the route this transfer leg is, and how many hops there are (null on older servers: a single hop).
  final int? hop;
  final int? hops;

  /// The last warehouse of the chain this parcel is relayed along.
  final String? finalHubId;

  /// A replacement trip also collects the faulty unit.
  final bool collectOld;
  final bool? _needsCode;

  /// The leg belongs to the order's own journey (false for return / replacement legs).
  final bool orderFlow;

  /// Whether the payload carried the order snapshot (a `task:updated` push does not).
  final bool hasOrder;

  DeliveryTaskDto({
    required this.id,
    required this.orderId,
    required this.orderReference,
    required this.status,
    required this.codAmountUsd,
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
    this.kind = LegKind.delivery,
    this.fromHubId,
    this.toHubId,
    this.sellerId,
    this.sellerName,
    this.parentTaskId,
    this.disputeId,
    this.replacementId,
    this.exchangeId,
    this.from,
    this.to,
    this.fromHub,
    this.toHub,
    this.runId,
    this.runReference,
    this.hop,
    this.hops,
    this.finalHubId,
    this.collectOld = false,
    bool? needsCode,
    this.orderFlow = true,
    this.hasOrder = true,
  }) : _needsCode = needsCode;

  /// This leg is one hop of a route of several: "hop 1/2".
  bool get isRelayHop => hop != null && hops != null && hops! > 1;

  /// "26/10" for the card (null when the order has no estimate or it is malformed).
  String? get deliverByText {
    final v = estimatedDeliveryDate;
    if (v == null || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v)) return null;
    return '${v.substring(8, 10)}/${v.substring(5, 7)}';
  }

  bool get isActive => const {'assigned', 'picked_up', 'in_transit'}.contains(status);
  bool get isFinished => status == 'delivered' || status == 'failed';
  bool get collectsCash => codAmountUsd > 0;

  /// The leg ends at a warehouse: staff scan the parcel in, the rider can never mark it delivered.
  bool get endsAtHub => LegKind.hubBound.contains(kind);

  /// The rider meets the customer on this leg.
  bool get meetsCustomer => kind == LegKind.delivery || kind == LegKind.replacementDelivery || kind == LegKind.returnPickup;

  /// The customer's 4-digit delivery code is asked on this leg (the customer delivery of an order).
  bool get needsCode => _needsCode ?? kind == LegKind.delivery;

  /// The warehouse this leg ends at (hub-bound legs) or starts from, by name.
  String? get toHubName => toHub?.name ?? (to?.isHub == true ? to!.name : null);
  String? get fromHubName => fromHub?.name ?? (from?.isHub == true ? from!.name : null);
  String? get sellerLabel => sellerName ?? (from?.isSeller == true ? from!.name : null) ?? (to?.isSeller == true ? to!.name : null);

  TaskEndpoint? get _customerEnd => to?.isCustomer == true ? to : (from?.isCustomer == true ? from : null);

  /// A readable delivery address (the order stores it as JSON); empty when none was given.
  String get address {
    final raw = addressRaw;
    if (raw == null || raw.isEmpty) return _customerEnd?.address ?? '';
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
    if (raw == null || raw.isEmpty) return _customerEnd?.address ?? '';
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
    if (raw != null && raw.isNotEmpty) {
      try {
        final m = jsonDecode(raw);
        final g = m is Map ? m['geo'] : null;
        if (g is Map) {
          final lat = (g['lat'] as num?)?.toDouble();
          final lng = (g['lng'] as num?)?.toDouble();
          if (lat != null && lng != null && lat.abs() <= 90 && lng.abs() <= 180) return (lat: lat, lng: lng);
        }
      } catch (_) {/* plain text address */}
    }
    return _customerEnd?.pin;
  }

  String? get phone {
    final raw = addressRaw;
    if (raw != null) {
      try {
        final m = jsonDecode(raw);
        if (m is Map && m['phone'] != null && '${m['phone']}'.trim().isNotEmpty) return '${m['phone']}'.trim();
      } catch (_) {}
    }
    return _customerEnd?.phone;
  }

  static DateTime? _date(dynamic v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
  static String? _str(dynamic v) => v is String && v.trim().isNotEmpty ? v.trim() : null;

  static List<OrderLine> _lines(dynamic v) => v is! List
      ? const []
      : v
          .whereType<Map>()
          .map((e) => OrderLine(
                textOrNull(e['productName']) ?? textOrNull(e['name']) ?? '',
                (e['qty'] as num?)?.toInt() ?? 1,
                nameFr: textOrNull(e['productNameFr']) ?? textOrNull(e['nameFr']) ?? '',
              ))
          .toList();

  factory DeliveryTaskDto.fromJson(Map<String, dynamic> j) {
    final hasOrder = j['order'] is Map;
    final o = hasOrder ? (j['order'] as Map).map((k, v) => MapEntry(k.toString(), v)) : <String, dynamic>{};
    final from = TaskEndpoint.fromJson(j['from']);
    final to = TaskEndpoint.fromJson(j['to']);
    final orderItems = _lines(o['items']);
    final kindRaw = _str(j['kind']);
    return DeliveryTaskDto(
      id: j['id'] as String,
      orderId: j['orderId'] as String? ?? '',
      orderReference: j['orderReference'] as String? ?? '',
      status: j['status'] as String? ?? 'assigned',
      codAmountUsd: (j['codAmountUsd'] as num?)?.toDouble() ?? 0,
      addressRaw: (o['shippingAddress'] as String?) ?? (j['address'] as String?),
      customerName: _str(o['customerName']) ?? (to?.isCustomer == true ? to!.name : from?.isCustomer == true ? from!.name : null),
      paymentMethod: o['paymentMethod'] as String?,
      totalUsd: (o['totalUsd'] as num?)?.toDouble() ?? 0,
      items: orderItems.isNotEmpty ? orderItems : _lines(j['items']),
      createdAt: _date(j['createdAt']),
      pickupAddress: _str(j['pickupAddress']),
      attempts: (j['attempts'] as num?)?.toInt() ?? 1,
      failureReason: _str(j['failureReason']),
      readyAt: _date(j['readyAt']),
      receivedAt: _date(j['receivedAt']),
      estimatedDeliveryDate: _str(o['estimatedDeliveryDate']),
      kind: kindRaw ?? LegKind.delivery,
      fromHubId: _str(j['fromHubId']),
      toHubId: _str(j['toHubId']),
      sellerId: _str(j['sellerId']),
      sellerName: _str(j['sellerName']),
      parentTaskId: _str(j['parentTaskId']),
      disputeId: _str(j['disputeId']),
      replacementId: _str(j['replacementId']),
      exchangeId: _str(j['exchangeId']),
      from: from,
      to: to,
      fromHub: TaskEndpoint.fromJson(j['fromHub']),
      toHub: TaskEndpoint.fromJson(j['toHub']),
      runId: _str(j['runId']),
      runReference: _str(j['runReference']),
      hop: (j['hop'] as num?)?.toInt(),
      hops: (j['hops'] as num?)?.toInt(),
      finalHubId: _str(j['finalHubId']),
      collectOld: j['collectOld'] == true,
      needsCode: j['needsCode'] is bool ? j['needsCode'] as bool : null,
      orderFlow: j['orderFlow'] is bool ? j['orderFlow'] as bool : true,
      hasOrder: hasOrder,
    );
  }

  /// This (fresh) task from a push, which carries no order snapshot, completed with what [old] knew about the order.
  DeliveryTaskDto withOrderFrom(DeliveryTaskDto old) {
    if (hasOrder) return this;
    return DeliveryTaskDto(
      id: id,
      orderId: orderId,
      orderReference: orderReference,
      status: status,
      codAmountUsd: codAmountUsd,
      addressRaw: addressRaw ?? old.addressRaw,
      customerName: customerName ?? old.customerName,
      paymentMethod: old.paymentMethod,
      totalUsd: old.totalUsd,
      items: items.isNotEmpty ? items : old.items,
      createdAt: createdAt ?? old.createdAt,
      pickupAddress: pickupAddress,
      attempts: attempts,
      failureReason: failureReason,
      readyAt: readyAt,
      receivedAt: receivedAt,
      estimatedDeliveryDate: old.estimatedDeliveryDate,
      kind: kind,
      fromHubId: fromHubId,
      toHubId: toHubId,
      sellerId: sellerId,
      sellerName: sellerName,
      parentTaskId: parentTaskId,
      disputeId: disputeId,
      replacementId: replacementId,
      exchangeId: exchangeId,
      from: from,
      to: to,
      fromHub: fromHub,
      toHub: toHub,
      runId: runId,
      runReference: runReference,
      hop: hop,
      hops: hops,
      finalHubId: finalHubId,
      collectOld: collectOld,
      needsCode: _needsCode,
      orderFlow: orderFlow,
      hasOrder: old.hasOrder,
    );
  }
}

/// How many tasks of one kind (a delivery, a seller pickup, a transfer…) the rider completed, and what they paid.
class EarningsKind {
  final String kind;
  final int count;
  final double earningsUsd;

  const EarningsKind({required this.kind, required this.count, required this.earningsUsd});

  factory EarningsKind.fromJson(Map<String, dynamic> j) => EarningsKind(
        kind: j['kind'] as String? ?? '',
        count: (j['count'] as num?)?.toInt() ?? 0,
        earningsUsd: (j['earningsUsd'] as num?)?.toDouble() ?? 0,
      );
}

/// The server's earnings: the pay is flat per COMPLETED task of any kind, so [completed] (`delivered` on the wire)
/// counts every finished leg, not only customer deliveries; [byKind] is the breakdown and adds up to [earningsUsd].
class EarningsDto {
  final int totalTasks;
  final int completed;
  final int active;
  final double codCollectedUsd;
  final double earningsUsd;
  final double perTaskUsd;
  final List<EarningsKind> byKind;

  const EarningsDto({this.totalTasks = 0, this.completed = 0, this.active = 0, this.codCollectedUsd = 0, this.earningsUsd = 0, this.perTaskUsd = 0, this.byKind = const []});

  factory EarningsDto.fromJson(Map<String, dynamic> j) => EarningsDto(
        totalTasks: (j['totalTasks'] as num?)?.toInt() ?? 0,
        completed: (j['delivered'] as num?)?.toInt() ?? 0,
        active: (j['active'] as num?)?.toInt() ?? 0,
        codCollectedUsd: (j['codCollectedUsd'] as num?)?.toDouble() ?? 0,
        earningsUsd: (j['earningsUsd'] as num?)?.toDouble() ?? 0,
        perTaskUsd: (j['perTaskUsd'] as num?)?.toDouble() ?? 0,
        byKind: [
          for (final k in (j['byKind'] as List?) ?? const [])
            if (k is Map) EarningsKind.fromJson(k.map((a, b) => MapEntry(a.toString(), b))),
        ],
      );
}
