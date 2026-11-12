import 'models.dart' show DeliveryTaskDto;

/// Which side of the trip a scan belongs to: collecting the box, or handing it over.
enum ParcelStage {
  pickup,
  dropoff;

  /// The word the server expects (`rider:scanParcel` `stage`).
  String get wire => name;
}

/// One labelled box (`PKG-` + 8 characters) of a leg, as the server lists it.
class ParcelDto {
  const ParcelDto({required this.code, this.boxNo = 1, this.boxCount = 1, this.pickupScannedAt, this.dropoffScannedAt, this.groupId});

  final String code;
  final int boxNo, boxCount;

  /// The box set (several same-day orders of one customer) this box belongs to; null on an older server or a lone order.
  final String? groupId;
  final DateTime? pickupScannedAt, dropoffScannedAt;

  bool scanned(ParcelStage stage) => (stage == ParcelStage.pickup ? pickupScannedAt : dropoffScannedAt) != null;

  /// A "Box 2/3" label applies only when the package was split.
  bool get isSplit => boxCount > 1;

  static DateTime? _t(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;

  static ParcelDto? tryParse(Object? v) {
    if (v is! Map || v['code'] is! String || (v['code'] as String).isEmpty) return null;
    return ParcelDto(
      code: v['code'] as String,
      boxNo: v['boxNo'] is num ? (v['boxNo'] as num).toInt() : 1,
      boxCount: v['boxCount'] is num ? (v['boxCount'] as num).toInt() : 1,
      pickupScannedAt: _t(v['pickupScannedAt']),
      dropoffScannedAt: _t(v['dropoffScannedAt']),
      groupId: v['groupId'] is String && (v['groupId'] as String).isNotEmpty ? v['groupId'] as String : null,
    );
  }

  static List<ParcelDto> listFrom(Object? raw) => raw is List ? raw.map(tryParse).whereType<ParcelDto>().toList() : const [];
}

/// One product line inside a box set (`contents[]` of a label, a checklist, `parcelContents` of a leg): what is in the box, with
/// its size/options, and which order it belongs to.
class ParcelContent {
  const ParcelContent({required this.name, this.nameFr = '', this.variant, this.variantFr, this.qty = 1, this.orderReference = ''});

  final String name, nameFr;

  /// The size/options label ("128 GB / Black"); null for a product with none ("Default" is never sent).
  final String? variant, variantFr;
  final int qty;
  final String orderReference;

  String displayName(String lang) => lang == 'fr' && nameFr.trim().isNotEmpty ? nameFr.trim() : name;

  /// The size/options in [lang] (French when asked and present, else the stored one); null when there are none.
  String? variantText(String lang) => variantIn(lang, variant, variantFr);

  /// "2× Phone (128 GB / Black)" in [lang].
  String text(String lang) => contentLineText(qty, displayName(lang), variantText(lang));

  static String? _s(Object? v) => v is String && v.trim().isNotEmpty ? v.trim() : null;

  static ParcelContent? tryParse(Object? v) {
    if (v is! Map) return null;
    final name = _s(v['name']) ?? _s(v['productName']);
    if (name == null) return null;
    return ParcelContent(
      name: name,
      nameFr: _s(v['nameFr']) ?? _s(v['productNameFr']) ?? '',
      variant: _s(v['variant']),
      variantFr: _s(v['variantFr']),
      qty: v['qty'] is num ? (v['qty'] as num).toInt() : 1,
      orderReference: _s(v['orderReference']) ?? '',
    );
  }

  static List<ParcelContent> listFrom(Object? raw) => raw is List ? raw.map(tryParse).whereType<ParcelContent>().toList() : const [];
}

/// The size/options label in [lang]: the French one when asked and present, else the stored one; null when there is none.
String? variantIn(String lang, String? variant, String? variantFr) {
  final fr = variantFr?.trim() ?? '';
  final en = variant?.trim() ?? '';
  final v = lang == 'fr' && fr.isNotEmpty ? fr : en;
  return v.isEmpty ? null : v;
}

/// "2× Phone" or "2× Phone (128 GB / Black)": the one way a product line is written.
String contentLineText(int qty, String name, String? variant) => variant == null ? '$qty× $name' : '$qty× $name ($variant)';

/// An order a box set belongs to (`orders[]` / `parcelOrders[]`).
class ParcelOrderRef {
  const ParcelOrderRef({required this.orderId, required this.reference});
  final String orderId, reference;

  static ParcelOrderRef? tryParse(Object? v) {
    if (v is! Map) return null;
    final id = v['orderId'] ?? v['id'];
    final ref = v['reference'] ?? v['orderReference'];
    if (id is! String || id.isEmpty) return null;
    return ParcelOrderRef(orderId: id, reference: ref is String ? ref : '');
  }

  static List<ParcelOrderRef> listFrom(Object? raw) => raw is List ? raw.map(tryParse).whereType<ParcelOrderRef>().toList() : const [];
}

/// "2 of 3" for one stage of a list of boxes.
({int scanned, int total}) scanCount(List<ParcelDto> parcels, ParcelStage stage) => (scanned: parcels.where((p) => p.scanned(stage)).length, total: parcels.length);

bool stageComplete(List<ParcelDto> parcels, ParcelStage stage) => parcels.every((p) => p.scanned(stage));

/// The server's answer to `rider:scanParcel`.
class ParcelScan {
  const ParcelScan({required this.parcels, required this.code, required this.scanned, required this.total, required this.already, required this.required, required this.pickupComplete, required this.dropoffComplete, this.taskId, this.contents = const [], this.orders = const []});

  final List<ParcelDto> parcels;
  final String code;
  final int scanned, total;

  /// A repeat of the same scan: nothing changed.
  final bool already;
  final bool required, pickupComplete, dropoffComplete;
  final String? taskId;

  /// Everything in the box set the scanned box belongs to, and the orders it serves (absent on an older server).
  final List<ParcelContent> contents;
  final List<ParcelOrderRef> orders;

  factory ParcelScan.fromJson(Map<String, dynamic> j) {
    final parcels = ParcelDto.listFrom(j['parcels']);
    return ParcelScan(
      parcels: parcels,
      code: j['code'] is String ? j['code'] as String : '',
      scanned: j['scanned'] is num ? (j['scanned'] as num).toInt() : 0,
      total: j['total'] is num ? (j['total'] as num).toInt() : parcels.length,
      already: j['already'] == true,
      required: j['required'] != false,
      pickupComplete: j['pickupComplete'] is bool ? j['pickupComplete'] as bool : stageComplete(parcels, ParcelStage.pickup),
      dropoffComplete: j['dropoffComplete'] is bool ? j['dropoffComplete'] as bool : stageComplete(parcels, ParcelStage.dropoff),
      taskId: j['taskId'] is String ? j['taskId'] as String : null,
      contents: ParcelContent.listFrom(j['contents']),
      orders: ParcelOrderRef.listFrom(j['orders']),
    );
  }
}

/// The parcel code in whatever a QR or a keyboard gave: the first `PKG-XXXXXXXX` inside it, upper-cased, else the text as typed
/// (the server then says it is not a KOMORIKO code).
String normalizeParcelCode(String raw) {
  final text = raw.trim().toUpperCase();
  final m = RegExp(r'PKG-[A-Z0-9]{8}').firstMatch(text);
  return m?.group(0) ?? text;
}

/// What a leg's card needs to decide about scanning (the one place the rule lives).
extension LegScanRules on DeliveryTaskDto {
  /// The stage the rider is at: collecting while the leg is `assigned`, handing over once it is on the road. Null in between
  /// (picked up, not yet on the road) and once the leg is closed.
  ParcelStage? get scanStage => status == 'assigned'
      ? ParcelStage.pickup
      : status == 'in_transit'
          ? ParcelStage.dropoff
          : null;

  bool stageDone(ParcelStage stage) => stage == ParcelStage.pickup ? pickupComplete : dropoffComplete;

  /// The leg carries labelled boxes the rider has to account for.
  bool get hasParcels => parcels.isNotEmpty;

  /// The status change that ends [stage] is refused until every box is scanned (the server enforces the same rule).
  bool scanBlocks(ParcelStage stage) => scanRequired && hasParcels && !stageDone(stage);

  /// The scanner is offered (required or not) while the current stage has boxes left.
  bool get offersScan {
    final stage = scanStage;
    return isActive && hasParcels && stage != null && !stageDone(stage);
  }
}

/// Where a resolved box is going. [address], [phone] and [recipient] are only sent for the rider's own customer delivery or
/// express leg (never at the pickup, never for a box that is not theirs): null means "not for you", never "empty".
class ResolvedDestination {
  const ResolvedDestination({this.area, this.address, this.phone, this.recipient});
  final String? area, address, phone, recipient;

  bool get hasPrivate => address != null || phone != null || recipient != null;

  static String? _s(Object? v) => v is String && v.trim().isNotEmpty ? v.trim() : null;

  factory ResolvedDestination.fromJson(Object? v) {
    final m = v is Map ? v : const {};
    return ResolvedDestination(area: _s(m['area']), address: _s(m['address']), phone: _s(m['phone']), recipient: _s(m['recipient']));
  }
}

/// A leg that carries the resolved box (`legs[]` of `parcels:resolve`).
class ResolvedLeg {
  const ResolvedLeg({required this.id, required this.orderReference, required this.kind, required this.status});
  final String id, orderReference, kind, status;

  static ResolvedLeg? tryParse(Object? v) {
    if (v is! Map) return null;
    return ResolvedLeg(
      id: v['id'] is String ? v['id'] as String : '',
      orderReference: v['orderReference'] is String ? v['orderReference'] as String : '',
      kind: v['kind'] is String ? v['kind'] as String : '',
      status: v['status'] is String ? v['status'] as String : '',
    );
  }
}

/// The server's answer to `parcels:resolve { code }`: what a box is. Every field but the code is optional (an older or a
/// narrower answer still shows what it has).
class ParcelResolution {
  const ParcelResolution({
    required this.code,
    this.boxNo = 1,
    this.boxCount = 1,
    this.voided = false,
    this.storeName,
    this.destination = const ResolvedDestination(),
    this.contents = const [],
    this.orders = const [],
    this.legs = const [],
    this.locked,
  });

  final String code;
  final int boxNo, boxCount;

  /// The label was cancelled (a new one replaced it).
  final bool voided;
  final String? storeName;
  final ResolvedDestination destination;
  final List<ParcelContent> contents;
  final List<ParcelOrderRef> orders;
  final List<ResolvedLeg> legs;

  /// The box set is locked (a rider collected a box): null when the server did not say or the box has no set.
  final bool? locked;

  /// "Box 2/3" applies only when the package was split.
  bool get isSplit => boxCount > 1;

  /// The area to show: the destination's, else the label's.
  String? get area => destination.area;

  factory ParcelResolution.fromJson(Map<String, dynamic> j) {
    final area = j['destinationArea'];
    var dest = ResolvedDestination.fromJson(j['destination']);
    if (dest.area == null && area is String && area.trim().isNotEmpty) {
      dest = ResolvedDestination(area: area.trim(), address: dest.address, phone: dest.phone, recipient: dest.recipient);
    }
    final group = j['group'];
    return ParcelResolution(
      code: j['code'] is String ? j['code'] as String : '',
      boxNo: j['boxNo'] is num ? (j['boxNo'] as num).toInt() : 1,
      boxCount: j['boxCount'] is num ? (j['boxCount'] as num).toInt() : 1,
      voided: j['voided'] == true,
      storeName: j['storeName'] is String && (j['storeName'] as String).trim().isNotEmpty ? (j['storeName'] as String).trim() : null,
      destination: dest,
      contents: ParcelContent.listFrom(j['contents']),
      orders: ParcelOrderRef.listFrom(j['orders']),
      legs: (j['legs'] is List ? (j['legs'] as List) : const []).map(ResolvedLeg.tryParse).whereType<ResolvedLeg>().toList(),
      locked: group is Map && group['locked'] is bool ? group['locked'] as bool : null,
    );
  }
}

/// One stop of the rider's list: one leg, or several legs of the same box set (same `parcelOrders`, same kind and status, same
/// rider) that are met at one address and worked as one. A leg without a box set (an older server, a lone order) is a stop of
/// one, so everything that reads [LegStop] works on both.
class LegStop {
  LegStop(this.legs) : assert(legs.isNotEmpty);

  final List<DeliveryTaskDto> legs;

  DeliveryTaskDto get first => legs.first;

  /// Several orders met at once.
  bool get isGroup => legs.length > 1;

  /// The order references, in leg order.
  List<String> get references => [for (final l in legs) l.orderReference];

  /// The key the card, its buttons and its tests use: the first leg's id.
  String get id => first.id;

  /// The products of the whole box set, with options: the box set's own list when the server sent it, else every leg's own lines
  /// (tagged with their order, so a stop of several orders still says which is which).
  List<ParcelContent> get contents {
    for (final l in legs) {
      if (l.parcelContents.isNotEmpty) return l.parcelContents;
    }
    return const [];
  }

  /// The boxes of the stop, one line per box: a box the sibling legs share counts once, and it is scanned for [stage] only when
  /// every leg that holds it has it scanned (the server records one scan on every sibling, so they agree).
  List<ParcelDto> get parcels {
    if (!isGroup) return first.parcels;
    final order = <String>[];
    final byCode = <String, List<ParcelDto>>{};
    for (final l in legs) {
      for (final p in l.parcels) {
        (byCode[p.code] ??= []).add(p);
        if (!order.contains(p.code)) order.add(p.code);
      }
    }
    return [
      for (final code in order)
        ParcelDto(
          code: code,
          boxNo: byCode[code]!.first.boxNo,
          boxCount: byCode[code]!.first.boxCount,
          groupId: byCode[code]!.first.groupId,
          pickupScannedAt: byCode[code]!.every((p) => p.pickupScannedAt != null) ? byCode[code]!.first.pickupScannedAt : null,
          dropoffScannedAt: byCode[code]!.every((p) => p.dropoffScannedAt != null) ? byCode[code]!.first.dropoffScannedAt : null,
        ),
    ];
  }

  bool get hasParcels => parcels.isNotEmpty;

  /// The status change that ends [stage] waits for the scans while any leg of the stop says so.
  bool scanBlocks(ParcelStage stage) => legs.any((l) => l.scanBlocks(stage));

  bool get offersScan => legs.any((l) => l.offersScan);

  bool stageDone(ParcelStage stage) => legs.every((l) => !l.hasParcels || l.stageDone(stage));
}

/// The key two legs share when they are one stop, or null for a leg that stands alone: an open leg of a box set of several
/// orders. The rider is the same by construction (the list holds only this rider's legs).
String? stopKey(DeliveryTaskDto t) {
  if (!t.isActive || t.parcelOrders.length < 2) return null;
  final ids = [for (final o in t.parcelOrders) o.orderId]..sort();
  return '${t.kind}|${t.status}|${ids.join(',')}';
}

/// [tasks] as stops, in the order of their first leg: legs with the same [stopKey] become one stop, the rest stand alone.
List<LegStop> groupStops(Iterable<DeliveryTaskDto> tasks) {
  final out = <LegStop>[];
  final byKey = <String, List<DeliveryTaskDto>>{};
  for (final t in tasks) {
    final key = stopKey(t);
    if (key == null) {
      out.add(LegStop([t]));
      continue;
    }
    final legs = byKey[key];
    if (legs == null) {
      final fresh = <DeliveryTaskDto>[t];
      byKey[key] = fresh;
      out.add(LegStop(fresh));
    } else {
      legs.add(t);
    }
  }
  return out;
}
