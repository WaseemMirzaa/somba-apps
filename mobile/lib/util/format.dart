import 'package:flutter/foundation.dart';
import 'package:intl/intl.dart';
import '../data/market_profiles.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../services/realtime_store.dart';

/// App-wide market/currency selection. France → USD, DRC → Congolese Franc
/// (converted at the profile FX rate). Wrapping the app in a
/// [ValueListenableBuilder] on this notifier makes prices update instantly.
final marketNotifier = ValueNotifier<MarketProfileId>(MarketProfileId.drc);

MarketProfile get currentMarket => marketProfiles[marketNotifier.value]!;

// Amounts follow the language: `3 417 150 FC` / `1 199 $` in French, `FC 3,417,150` / `$1,199` in English.
final _usdEn = NumberFormat.currency(locale: 'en_US', symbol: '\$', decimalDigits: 0);
final _cdfEn = NumberFormat.currency(locale: 'en_US', symbol: 'FC ', decimalDigits: 0);
final _usdFr = NumberFormat.currency(locale: 'fr', symbol: '\$', decimalDigits: 0);
final _cdfFr = NumberFormat.currency(locale: 'fr', symbol: 'FC', decimalDigits: 0);

NumberFormat get _usd => Strings.current.isFr ? _usdFr : _usdEn;
NumberFormat get _cdf => Strings.current.isFr ? _cdfFr : _cdfEn;

/// Formats a USD amount in the active market's currency and language.
String money(num usdValue) {
  final rate = _fxRate;
  if (rate != null) return _cdf.format(usdValue * rate);
  return _usd.format(usdValue);
}

/// USD→CDF rate: the server's `fxRate` setting when known, else the profile default.
double? get _fxRate {
  if (currentMarket.fxRateUsdCdf == null) return null; // user chose USD display
  return RealtimeStore.instance.fxRate ?? currentMarket.fxRateUsdCdf;
}

/// Delivery zones: the server's list (source of truth for fees), else the fallback.
List<Zone> get activeZones => RealtimeStore.instance.zones.isNotEmpty ? RealtimeStore.instance.zones : fallbackZones;

/// The customer's currently selected delivery zone (defaults to the first
/// zone of the active market).
Zone get selectedZone {
  final zones = activeZones;
  final id = ShopState.instance.selectedZoneId;
  return zones.firstWhere((z) => z.id == id, orElse: () => zones.first);
}

/// Delivery fee (USD) for the selected zone in the active market.
double get deliveryFeeUsd => selectedZone.deliveryFeeUsd;

/// Secondary-currency line for dual display. In the DRC market prices show in
/// CDF (primary via [money]) with the USD equivalent underneath; France is
/// single-currency so this returns null.
String? secondaryMoney(num usdValue) {
  if (_fxRate != null) return '≈ ${_usd.format(usdValue)}';
  return null;
}

/// Compact count, e.g. `2.3k` reviews (`2,3 k` in French).
String compact(num value) {
  final s = Strings.current;
  if (value >= 1000000) return '${s.number(value / 1000000, decimals: 1)} M';
  if (value >= 1000) return '${s.number(value / 1000, decimals: 1)}${s.isFr ? ' k' : 'k'}';
  return value.toString();
}
