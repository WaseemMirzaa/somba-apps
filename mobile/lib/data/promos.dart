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
        description: (j['description'] as String?)?.isNotEmpty == true
            ? j['description'] as String
            : ((j['type'] == 'percent') ? '${(j['value'] as num).toInt()}% off' : '\$${(j['value'] as num).toInt()} off'),
        minOrderUsd: (j['minOrder'] as num?)?.toDouble() ?? 0,
        type: j['type'] as String? ?? 'percent',
        value: (j['value'] as num?)?.toDouble() ?? 0,
      );
}

/// A code the server accepted for a given subtotal.
class AppliedPromo {
  final String code;
  final double discountUsd;
  final double forSubtotal;
  const AppliedPromo({required this.code, required this.discountUsd, required this.forSubtotal});
}
