import '../l10n/strings.dart';

/// A promo code as defined by the admin (`promos:list`). The app only PREVIEWS
/// discounts; the server validates and applies the code when the order is placed.
class Promo {
  final String code;
  final String description;
  final double minOrderUsd;
  final String type; // percent | fixed
  final double value;

  const Promo({
    required this.code,
    required this.description,
    required this.minOrderUsd,
    required this.type,
    required this.value,
  });

  factory Promo.fromJson(Map<String, dynamic> j) => Promo(
        code: j['code'] as String? ?? '',
        description: (j['description'] as String?)?.isNotEmpty == true ? j['description'] as String : '',
        minOrderUsd: (j['minOrder'] as num?)?.toDouble() ?? 0,
        type: j['type'] as String? ?? 'percent',
        value: (j['value'] as num?)?.toDouble() ?? 0,
      );

  /// The admin's description, or a generated "10 % off" in the user's language.
  String describe(Strings s) {
    if (description.isNotEmpty) return description;
    return type == 'percent' ? s.promoPercentOff(value.toInt()) : s.promoFixedOff(value.toInt());
  }
}

/// A code the server accepted for a given subtotal.
class AppliedPromo {
  final String code;
  final double discountUsd;
  final double forSubtotal;
  const AppliedPromo({required this.code, required this.discountUsd, required this.forSubtotal});
}
