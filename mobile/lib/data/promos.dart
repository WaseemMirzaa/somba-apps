/// Promo / coupon codes, mirroring the admin promotions module and
/// `shared/mock/entities.ts` MOCK_PROMOS.
class Promo {
  final String code;
  final String description;
  final double minOrderUsd;
  final double? percentOff; // e.g. 0.10 for 10%
  final double? amountOffUsd; // fixed USD discount
  const Promo({
    required this.code,
    required this.description,
    required this.minOrderUsd,
    this.percentOff,
    this.amountOffUsd,
  });

  /// Discount in USD for a given subtotal (0 if the minimum is not met).
  double discountFor(double subtotalUsd) {
    if (subtotalUsd < minOrderUsd) return 0;
    if (percentOff != null) return subtotalUsd * percentOff!;
    if (amountOffUsd != null) return amountOffUsd!;
    return 0;
  }
}

const promos = [
  Promo(code: 'SOMBA10', description: '10% off orders over \$50', minOrderUsd: 50, percentOff: 0.10),
  Promo(code: 'SAVE20', description: '\$20 off orders over \$100', minOrderUsd: 100, amountOffUsd: 20),
  Promo(code: 'WELCOME5', description: '\$5 off your first order', minOrderUsd: 0, amountOffUsd: 5),
];

/// Case-insensitive lookup; null if the code does not exist.
Promo? findPromo(String code) {
  final c = code.trim().toUpperCase();
  for (final p in promos) {
    if (p.code == c) return p;
  }
  return null;
}
