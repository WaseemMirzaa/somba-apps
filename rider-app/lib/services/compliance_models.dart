/// The rider's vehicle and compliance documents (docs/contracts/rider-compliance.md). Plain data, no Flutter.
library;

/// The document types the API knows, in the order the upload form lists them.
const kDocumentTypes = ['driver_licence', 'vehicle_insurance', 'vehicle_registration', 'id_card', 'other'];

/// A document is "expiring" from this many days before its last valid day.
const kExpiringDays = 30;

enum ExpiryState { none, valid, expiring, expired }

class Expiry {
  const Expiry(this.state, this.daysLeft);
  final ExpiryState state;

  /// Whole days from today (UTC) to the last valid day; negative once past; null without a date.
  final int? daysLeft;
  static const none = Expiry(ExpiryState.none, null);
}

/// Where a `YYYY-MM-DD` date stands against [now] (UTC calendar days, the same rule as the API). Worked out on the phone so a
/// screen left open overnight stays right. The last valid day still counts as valid (it shows as expiring, 0 days left).
Expiry expiryOf(String? isoDay, DateTime now) {
  final d = parseDay(isoDay);
  if (d == null) return Expiry.none;
  final today = DateTime.utc(now.toUtc().year, now.toUtc().month, now.toUtc().day);
  final left = d.difference(today).inDays;
  if (left < 0) return Expiry(ExpiryState.expired, left);
  return Expiry(left <= kExpiringDays ? ExpiryState.expiring : ExpiryState.valid, left);
}

/// `YYYY-MM-DD` as a UTC date, or null when it is not a real calendar day.
DateTime? parseDay(String? iso) {
  if (iso == null) return null;
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(iso);
  if (m == null) return null;
  final y = int.parse(m.group(1)!), mo = int.parse(m.group(2)!), d = int.parse(m.group(3)!);
  final dt = DateTime.utc(y, mo, d);
  return dt.year == y && dt.month == mo && dt.day == d ? dt : null;
}

/// A day written `YYYY-MM-DD` (what the API takes).
String isoDay(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

String? _text(dynamic v) {
  if (v == null) return null;
  final s = '$v'.trim();
  return s.isEmpty ? null : s;
}

class RiderVehicleDto {
  const RiderVehicleDto({
    this.exists = false,
    this.model,
    this.type,
    this.plate,
    this.colour,
    this.odometerKm,
    this.fuel,
    this.insuranceValidUntil,
    this.lastServiceOn,
    this.nextServiceOn,
    this.updatedByName,
  });

  final bool exists;
  final String? model, type, plate, colour, fuel, insuranceValidUntil, lastServiceOn, nextServiceOn, updatedByName;
  final int? odometerKm;

  factory RiderVehicleDto.fromJson(Map<String, dynamic> j) => RiderVehicleDto(
        exists: j['exists'] == true,
        model: _text(j['model']),
        type: _text(j['type']),
        plate: _text(j['plate']),
        colour: _text(j['colour']),
        odometerKm: j['odometerKm'] is num ? (j['odometerKm'] as num).toInt() : null,
        fuel: _text(j['fuel']),
        insuranceValidUntil: _text(j['insuranceValidUntil']),
        lastServiceOn: _text(j['lastServiceOn']),
        nextServiceOn: _text(j['nextServiceOn']),
        updatedByName: _text(j['updatedByName']),
      );

  Expiry insurance(DateTime now) => expiryOf(insuranceValidUntil, now);

  /// For the next service, `expired` means overdue.
  Expiry service(DateTime now) => expiryOf(nextServiceOn, now);
}

class RiderDocumentDto {
  const RiderDocumentDto({
    required this.id,
    required this.type,
    this.number,
    this.expiresOn,
    this.status = 'pending',
    this.reviewedByName,
    this.rejectionReason,
    this.createdAt,
  });

  final String id, type, status;
  final String? number, expiresOn, reviewedByName, rejectionReason;
  final DateTime? createdAt;

  bool get isPending => status == 'pending';
  bool get isApproved => status == 'approved';
  bool get isRejected => status == 'rejected';

  factory RiderDocumentDto.fromJson(Map<String, dynamic> j) => RiderDocumentDto(
        id: '${j['id']}',
        type: _text(j['type']) ?? 'other',
        number: _text(j['number']),
        expiresOn: _text(j['expiresOn']),
        status: _text(j['status']) ?? 'pending',
        reviewedByName: _text(j['reviewedByName']),
        rejectionReason: _text(j['rejectionReason']),
        createdAt: DateTime.tryParse('${j['createdAt']}'),
      );

  Expiry expiry(DateTime now) => expiryOf(expiresOn, now);
}

/// How many documents need the rider's attention (a rejected document is not counted as expired: it needs a new copy anyway).
({int expired, int expiring}) documentWarnings(Iterable<RiderDocumentDto> docs, DateTime now) {
  var expired = 0, expiring = 0;
  for (final d in docs.where((d) => !d.isRejected)) {
    switch (d.expiry(now).state) {
      case ExpiryState.expired:
        expired++;
      case ExpiryState.expiring:
        expiring++;
      case ExpiryState.valid || ExpiryState.none:
        break;
    }
  }
  return (expired: expired, expiring: expiring);
}
