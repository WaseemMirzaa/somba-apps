// Order times come from the API as UTC instants and must show in the device's time zone.
// SOM-821943591 was placed at 18:38 in Karachi (+05:00); the API sends 13:38Z.
// Run with a non-UTC zone to see the conversion: TZ=Asia/Karachi flutter test test/order_time_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/services/models.dart';

void main() {
  setUpAll(() async => initializeDateFormatting());

  OrderDto placed() => OrderDto.fromJson({
        'id': '1afcc7eb-e0fb-48ed-a434-b00532c0d818',
        'reference': 'SOM-821943591',
        'createdAt': '2026-10-22T13:38:02.221Z',
      });

  test('createdAt is the same instant, converted to device-local time', () {
    final at = placed().createdAt!;
    expect(at.isUtc, isFalse);
    expect(at.toUtc(), DateTime.utc(2026, 10, 22, 13, 38, 2, 221));
  });

  test('the order detail line shows local wall time, not UTC', () {
    final at = placed().createdAt!;
    const s = Strings('fr');
    final local = DateTime.utc(2026, 10, 22, 13, 38, 2, 221).toLocal();
    expect(s.dateTime(at), s.dateTime(local));
    if (local.timeZoneOffset == const Duration(hours: 5)) {
      // Karachi: what the customer saw on the simulator clock.
      expect(s.time(at), '18:38');
    }
    if (local.timeZoneOffset != Duration.zero) {
      expect(s.time(at), isNot('13:38'));
    }
  });
}
