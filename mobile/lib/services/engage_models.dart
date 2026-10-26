import '../util/freshness.dart';
import 'models.dart' show pickLang, readBilingual, textOrNull;

/// A flash sale as the server serves it (`flashsales:list`, `flashsale:updated`).
///
/// The server sends how long is left (`startsInMs` / `endsInMs`), not a clock reading, so the phone turns that
/// into an absolute [endsAt] the moment the payload arrives (its own clock, immune to a wrong device date). A
/// payload without `endsInMs` falls back to the `endsAt` ISO text.
class FlashSaleDto {
  final String id;
  final String productId;
  final String title;
  final String titleFr;
  final String productName;
  final String productNameFr;
  final double flashPrice;

  /// The normal price (null when the server could not read the product).
  final double? basePrice;
  final int discount;

  /// `scheduled` | `running` | `ended`.
  final String phase;
  final DateTime? startsAt;
  final DateTime? endsAt;
  final bool active;

  const FlashSaleDto({
    required this.id,
    required this.productId,
    this.title = '',
    this.titleFr = '',
    this.productName = '',
    this.productNameFr = '',
    required this.flashPrice,
    this.basePrice,
    this.discount = 0,
    this.phase = 'running',
    this.startsAt,
    this.endsAt,
    this.active = true,
  });

  /// [now] is the moment the payload was received (tests pass a fixed clock).
  factory FlashSaleDto.fromJson(Map<String, dynamic> j, DateTime now) {
    DateTime? at(Object? inMs, Object? iso) {
      if (inMs is num && inMs.isFinite) return now.add(Duration(milliseconds: inMs.round()));
      return iso is String ? DateTime.tryParse(iso)?.toLocal() : null;
    }

    final startsAt = at(j['startsInMs'], j['startsAt']);
    final endsAt = at(j['endsInMs'], j['endsAt']);
    final active = j['active'] != false;
    final status = textOrNull(j['status']);
    // Older payloads have no phase: work it out from the dates.
    final phase = textOrNull(j['phase']) ??
        (!active || (status != null && status != 'approved')
          ? 'ended'
          : endsAt != null && !endsAt.isAfter(now)
              ? 'ended'
              : startsAt != null && startsAt.isAfter(now)
                  ? 'scheduled'
                  : 'running');
    final price = (j['flashPrice'] as num?)?.toDouble() ?? 0;
    return FlashSaleDto(
      id: j['id'] as String,
      productId: textOrNull(j['productId']) ?? '',
      title: textOrNull(j['title']) ?? '',
      titleFr: textOrNull(j['titleFr']) ?? '',
      productName: textOrNull(j['productName']) ?? '',
      productNameFr: textOrNull(j['productNameFr']) ?? '',
      flashPrice: price,
      basePrice: (j['basePrice'] as num?)?.toDouble(),
      discount: (j['discount'] as num?)?.round() ?? 0,
      phase: phase,
      startsAt: startsAt,
      endsAt: endsAt,
      active: active,
    );
  }

  String displayTitle(String lang) => pickLang(lang, title, titleFr);
  String displayProductName(String lang) => pickLang(lang, productName, productNameFr);

  /// The discount to show: the server's, else worked out from the two prices.
  int get percentOff {
    if (discount > 0) return discount;
    final base = basePrice;
    if (base == null || base <= 0 || flashPrice >= base) return 0;
    return (100 * (base - flashPrice) / base).round();
  }

  /// True while the sale is on at [now]: not ended, started, and before its end (a sale with no end date runs on).
  bool runningAt(DateTime now) {
    if (phase != 'running') return false;
    final end = endsAt;
    return end == null || end.isAfter(now);
  }

  /// Time left at [now] (null when the sale has no end date).
  Duration? remaining(DateTime now) => endsAt?.difference(now);
}

/// What a `store:vacation` push says about one store.
class StoreVacation {
  final String sellerId;
  final bool onVacation;
  final DateTime? until;
  final Map<String, String>? notice;

  /// See `nextStamp`: compared with the stamp of a product copy to decide which one is newer.
  final int stamp;

  StoreVacation({required this.sellerId, required this.onVacation, this.until, this.notice, int? stamp}) : stamp = stamp ?? nextStamp();

  factory StoreVacation.fromJson(Map<String, dynamic> j) {
    final on = j['onVacation'] == true;
    return StoreVacation(
      sellerId: textOrNull(j['sellerId']) ?? '',
      onVacation: on,
      until: on && j['vacationUntil'] is String ? DateTime.tryParse(j['vacationUntil'] as String)?.toLocal() : null,
      notice: on ? readBilingual(j['notice']) : null,
    );
  }
}

/// A store being away, as the screens show it.
class VacationInfo {
  final DateTime? until;
  final Map<String, String>? notice;
  const VacationInfo({this.until, this.notice});

  /// The server's notice in [lang]; null when it did not write one in that language.
  String? noticeIn(String lang) => notice?[lang];
}

/// The storefront payload (`sellers:storefront` -> `seller`) as far as this app reads it.
class StoreFront {
  final String? returnsPolicy;
  final String? returnsPolicyFr;
  final String? shippingPolicy;
  final String? shippingPolicyFr;
  final int handlingDays;
  final bool onVacation;
  final DateTime? vacationUntil;
  final Map<String, String>? vacationNotice;

  /// When this copy was fetched (see `nextStamp`).
  final int stamp;

  StoreFront({
    this.returnsPolicy,
    this.returnsPolicyFr,
    this.shippingPolicy,
    this.shippingPolicyFr,
    this.handlingDays = 0,
    this.onVacation = false,
    this.vacationUntil,
    this.vacationNotice,
    int? stamp,
  }) : stamp = stamp ?? nextStamp();

  factory StoreFront.fromJson(Map<String, dynamic> j) {
    final on = j['onVacation'] == true;
    return StoreFront(
      returnsPolicy: textOrNull(j['returnsPolicy']),
      returnsPolicyFr: textOrNull(j['returnsPolicyFr']),
      shippingPolicy: textOrNull(j['shippingPolicy']),
      shippingPolicyFr: textOrNull(j['shippingPolicyFr']),
      handlingDays: (j['handlingDays'] is num ? (j['handlingDays'] as num).toInt() : 0).clamp(0, 14),
      onVacation: on,
      vacationUntil: on && j['vacationUntil'] is String ? DateTime.tryParse(j['vacationUntil'] as String)?.toLocal() : null,
      vacationNotice: on ? readBilingual(j['vacationNotice']) : null,
    );
  }

  /// The policy in [lang] (the other language's text when it has not been translated yet); empty when none.
  String returnsIn(String lang) => pickLang(lang, returnsPolicy, returnsPolicyFr);
  String shippingIn(String lang) => pickLang(lang, shippingPolicy, shippingPolicyFr);
}
