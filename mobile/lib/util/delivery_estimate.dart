/// Estimated delivery (mirrors api/src/common/delivery/estimate.ts). The seller sets each product's delivery
/// time in days; an order is expected on the order day (Kinshasa time, UTC+1) plus its slowest line.
/// Shoppers never choose a date.
const deliveryDaysMin = 1;
const deliveryDaysMax = 30;
const deliveryDaysFallback = 3;

/// A product's total (its delivery time plus the store's handling time, up to 14 days) can pass [deliveryDaysMax].
const deliveryTotalDaysMax = 45;

int deliveryDaysOf(Object? value, {int maxDays = deliveryDaysMax}) {
  final n = value is num ? value : num.tryParse('$value');
  if (n == null || !n.isFinite || n < deliveryDaysMin) return deliveryDaysFallback;
  return n.round().clamp(deliveryDaysMin, maxDays);
}

/// The Kinshasa calendar day (YYYY-MM-DD) `plusDays` from now.
String localDayPlus(int plusDays, [DateTime? now]) =>
    (now ?? DateTime.now()).toUtc().add(Duration(hours: 1, days: plusDays)).toIso8601String().substring(0, 10);

/// Expected day for lines taking these delivery times (the slowest wins), plus [extraDays] when the parcels travel
/// between warehouses (the lanes' transit times).
String estimateFor(Iterable<Object?> days, [DateTime? now, int maxDays = deliveryDaysMax, int extraDays = 0]) {
  final list = days.map((d) => deliveryDaysOf(d, maxDays: maxDays)).toList();
  final extra = extraDays > 0 ? extraDays : 0;
  return localDayPlus((list.isEmpty ? deliveryDaysFallback : list.reduce((a, b) => a > b ? a : b)) + extra, now);
}

/// "Mon 26 Oct" / "lun. 26 oct." for a YYYY-MM-DD day, without locale data; null when missing or malformed.
String? dayLabel(String? ymd, String lang) {
  if (ymd == null || !RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(ymd)) return null;
  final d = DateTime.parse(ymd);
  const en = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const fr = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  const enM = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const frM = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return '${(lang == 'fr' ? fr : en)[d.weekday - 1]} ${d.day} ${(lang == 'fr' ? frM : enM)[d.month - 1]}';
}
