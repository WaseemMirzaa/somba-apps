import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import '../data/market_profiles.dart';

/// App-wide market/currency selection. France → USD, DRC → Congolese Franc
/// (converted at the profile FX rate). Wrapping the app in a
/// [ValueListenableBuilder] on this notifier makes prices update instantly.
final marketNotifier = ValueNotifier<MarketProfileId>(MarketProfileId.france);

MarketProfile get currentMarket => marketProfiles[marketNotifier.value]!;

final _usd = NumberFormat.currency(locale: 'en_US', symbol: '\$', decimalDigits: 0);
final _cdf = NumberFormat.currency(locale: 'en_US', symbol: 'FC ', decimalDigits: 0);

/// Formats a USD amount in the active market's currency.
/// France → `$1,199`  ·  DRC → `FC 3,417,150`.
String money(num usdValue) {
  final m = currentMarket;
  if (m.fxRateUsdCdf != null) {
    return _cdf.format(usdValue * m.fxRateUsdCdf!);
  }
  return _usd.format(usdValue);
}

/// Compact count, e.g. `2.3k` reviews.
String compact(num value) {
  if (value >= 1000000) return '${(value / 1000000).toStringAsFixed(1)}M';
  if (value >= 1000) return '${(value / 1000).toStringAsFixed(1)}k';
  return value.toString();
}
