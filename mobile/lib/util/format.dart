import 'package:intl/intl.dart';

final _usd = NumberFormat.currency(locale: 'en_US', symbol: '\$', decimalDigits: 0);

/// Formats a USD amount with a thousands separator, e.g. `$1,199`.
String money(num value) => _usd.format(value);

/// Compact count, e.g. `2.3k` reviews.
String compact(num value) {
  if (value >= 1000000) return '${(value / 1000000).toStringAsFixed(1)}M';
  if (value >= 1000) return '${(value / 1000).toStringAsFixed(1)}k';
  return value.toString();
}
