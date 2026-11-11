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
  const ParcelDto({required this.code, this.boxNo = 1, this.boxCount = 1, this.pickupScannedAt, this.dropoffScannedAt});

  final String code;
  final int boxNo, boxCount;
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
    );
  }

  static List<ParcelDto> listFrom(Object? raw) => raw is List ? raw.map(tryParse).whereType<ParcelDto>().toList() : const [];
}

/// "2 of 3" for one stage of a list of boxes.
({int scanned, int total}) scanCount(List<ParcelDto> parcels, ParcelStage stage) => (scanned: parcels.where((p) => p.scanned(stage)).length, total: parcels.length);

bool stageComplete(List<ParcelDto> parcels, ParcelStage stage) => parcels.every((p) => p.scanned(stage));

/// The server's answer to `rider:scanParcel`.
class ParcelScan {
  const ParcelScan({required this.parcels, required this.code, required this.scanned, required this.total, required this.already, required this.required, required this.pickupComplete, required this.dropoffComplete, this.taskId});

  final List<ParcelDto> parcels;
  final String code;
  final int scanned, total;

  /// A repeat of the same scan: nothing changed.
  final bool already;
  final bool required, pickupComplete, dropoffComplete;
  final String? taskId;

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
