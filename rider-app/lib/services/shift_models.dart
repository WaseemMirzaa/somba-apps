// The rider's shifts (`shift:*` events, docs/contracts/rider-shift.md): clock in/out, breaks, the last 7 days.

/// "3 h 05 min", "45 min": the same in English and French.
String formatDuration(int minutes) {
  final m = minutes < 0 ? 0 : minutes;
  final h = m ~/ 60;
  final r = m % 60;
  if (h == 0) return '$r min';
  return '$h h ${r.toString().padLeft(2, '0')} min';
}

DateTime? _time(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
int _int(Object? v) => v is num ? v.toInt() : int.tryParse('$v') ?? 0;

/// One shift. The figures are a snapshot taken when the answer arrived ([seenAt]); [workedAt] carries an open shift forward.
class ShiftDto {
  const ShiftDto({
    required this.id,
    required this.startedAt,
    this.endedAt,
    this.breakMinutes = 0,
    this.onBreak = false,
    this.workedMinutes = 0,
    this.endReason,
    required this.seenAt,
  });

  final String id;
  final DateTime startedAt;
  final DateTime? endedAt;

  /// Minutes on break, a running break counted up to [seenAt].
  final int breakMinutes;
  final bool onBreak;

  /// Minutes worked (start to end, or to [seenAt] while open, minus the breaks).
  final int workedMinutes;

  /// `rider` (clocked out) or `auto` (the server closed a shift left open too long).
  final String? endReason;
  final DateTime seenAt;

  bool get isOpen => endedAt == null;
  bool get closedAutomatically => endReason == 'auto';

  /// Worked minutes as of [now]: an open shift that is not on a break keeps counting after the snapshot.
  int workedAt(DateTime now) {
    if (!isOpen || onBreak) return workedMinutes;
    final extra = now.difference(seenAt).inMinutes;
    return workedMinutes + (extra < 0 ? 0 : extra);
  }

  static ShiftDto? tryParse(Object? j, DateTime seenAt) {
    if (j is! Map) return null;
    final id = j['id'];
    final started = _time(j['startedAt']);
    if (id is! String || started == null) return null;
    return ShiftDto(
      id: id,
      startedAt: started,
      endedAt: _time(j['endedAt']),
      breakMinutes: _int(j['breakMinutes']),
      onBreak: j['onBreak'] == true,
      workedMinutes: _int(j['workedMinutes']),
      endReason: j['endReason'] is String ? j['endReason'] as String : null,
      seenAt: seenAt,
    );
  }
}

enum ShiftStatus { off, on, onBreak }

/// What the server says about the rider's shifts (`shift:mine` and every clock event).
class ShiftSummary {
  const ShiftSummary({required this.status, this.current, this.lastShift, this.minutesLast7Days = 0, this.shifts = const [], required this.seenAt});

  final ShiftStatus status;
  final ShiftDto? current;
  final ShiftDto? lastShift;
  final int minutesLast7Days;

  /// Shifts that started in the last 7 days, newest first (the open one included).
  final List<ShiftDto> shifts;
  final DateTime seenAt;

  bool get onShift => status != ShiftStatus.off;

  /// Hours of the last 7 days as of [now]: the open shift keeps counting.
  int minutesLast7DaysAt(DateTime now) => minutesLast7Days + (current == null ? 0 : current!.workedAt(now) - current!.workedMinutes);

  factory ShiftSummary.fromJson(Map<String, dynamic> j, {DateTime? now}) {
    final seen = now ?? DateTime.now();
    final status = switch (j['status']) {
      'on' => ShiftStatus.on,
      'break' => ShiftStatus.onBreak,
      _ => ShiftStatus.off,
    };
    final list = j['shifts'];
    return ShiftSummary(
      status: status,
      current: ShiftDto.tryParse(j['current'], seen),
      lastShift: ShiftDto.tryParse(j['lastShift'], seen),
      minutesLast7Days: _int(j['minutesLast7Days']),
      shifts: list is List ? list.map((e) => ShiftDto.tryParse(e, seen)).whereType<ShiftDto>().toList() : const [],
      seenAt: seen,
    );
  }
}
