/// Promo / coupon codes, mirroring the API `coupons` table. Hydrated from the
/// API at startup; the bundled list is the offline fallback.
class Promo {
  final String code;
  final String description;
  final String descriptionFr;
  final double minOrderUsd;
  final double? percentOff; // fraction, e.g. 0.10 for 10%
  final double? amountOffUsd; // fixed USD discount
  const Promo({
    required this.code,
    required this.description,
    String? descriptionFr,
    required this.minOrderUsd,
    this.percentOff,
    this.amountOffUsd,
  }) : descriptionFr = descriptionFr ?? description;

  String describe(String lang) => lang == 'fr' ? descriptionFr : description;

  /// Discount in USD for a given subtotal (0 if the minimum is not met).
  double discountFor(double subtotalUsd) {
    if (subtotalUsd < minOrderUsd) return 0;
    if (percentOff != null) return subtotalUsd * percentOff!;
    if (amountOffUsd != null) return amountOffUsd!;
    return 0;
  }

  factory Promo.fromJson(Map<String, dynamic> j) {
    double? d(dynamic v) => v == null ? null : (v is num ? v.toDouble() : double.tryParse('$v'));
    final pct = d(j['percentOff']);
    return Promo(
      code: (j['code'] ?? '').toString().toUpperCase(),
      description: (j['description'] ?? '').toString(),
      descriptionFr: (j['descriptionFr'] ?? j['description'] ?? '').toString(),
      minOrderUsd: d(j['minOrderUsd']) ?? 0,
      // API stores percent as 0–100; the app model uses a fraction.
      percentOff: pct == null ? null : pct / 100.0,
      amountOffUsd: d(j['amountOffUsd']),
    );
  }
}

final List<Promo> promos = [
  const Promo(code: 'SOMBA10', description: '10% off orders over \$50', descriptionFr: '10 % de réduction dès 50 \$', minOrderUsd: 50, percentOff: 0.10),
  const Promo(code: 'SAVE20', description: '\$20 off orders over \$100', descriptionFr: '20 \$ de réduction dès 100 \$', minOrderUsd: 100, amountOffUsd: 20),
  const Promo(code: 'WELCOME5', description: '\$5 off your first order', descriptionFr: '5 \$ de réduction sur votre première commande', minOrderUsd: 0, amountOffUsd: 5),
];

/// Case-insensitive lookup; null if the code does not exist.
Promo? findPromo(String code) {
  final c = code.trim().toUpperCase();
  for (final p in promos) {
    if (p.code == c) return p;
  }
  return null;
}
