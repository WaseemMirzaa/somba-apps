/// VAT and the delivery fee on a cart: the same arithmetic the server runs when it places an order
/// (`api/src/orders/vat.ts`, mirrored by the web shop's `lib/vat.ts`), so the cart and the checkout show the total the order
/// will charge. The order stays authoritative.
///
/// VAT is ADDED on top of the item prices, per line, on what the line costs after its share of the promo discount; the
/// customer sees ONE summed "VAT" / "TVA" line. When the seller pays the delivery fee the customer pays none; when the admin
/// hides the fee line it is folded into the total ("incl. delivery").
library;

/// One cart line as far as the totals go.
class TotalsLine {
  const TotalsLine({required this.priceUsd, required this.qty, this.vatPct = 0, this.discountable = true});

  final double priceUsd;
  final int qty;

  /// The listing's VAT % as the server serves it (0 while VAT is off).
  final double vatPct;

  /// The line takes part in the discount (a store coupon only discounts that store's lines).
  final bool discountable;
}

/// The money of a cart.
class CartTotals {
  const CartTotals({
    required this.subtotal,
    required this.discount,
    required this.vat,
    required this.fee,
    required this.showFeeLine,
    required this.feeInTotal,
    required this.feePaidBySeller,
    required this.total,
  });

  final double subtotal;
  final double discount;

  /// The one VAT line (0 = show none).
  final double vat;

  /// What the customer pays for delivery: 0 when the seller pays it.
  final double fee;

  /// Show the fee as its own row (the page writes "free" for a fee of 0).
  final bool showFeeLine;

  /// The fee is charged but folded into the total: the page writes "incl. delivery" next to Total.
  final bool feeInTotal;

  /// The seller pays the delivery fee: show no fee row at all.
  final bool feePaidBySeller;
  final double total;
}

/// Whole cents, rounded exactly as the server does (`Math.round((n + Number.EPSILON) * 100) / 100`), so an amount like 1.005 agrees.
double cents(double v) => ((v + 2.220446049250313e-16) * 100).roundToDouble() / 100;

/// Splits [totalUsd] over [weights] in whole cents, largest remainder first (the server's `allocate`), so the parts add up.
List<double> allocateCents(double totalUsd, List<double> weights) {
  final total = (cents(totalUsd) * 100).round();
  final sum = weights.fold<double>(0, (a, w) => a + (w > 0 ? w : 0));
  if (total <= 0 || sum <= 0) return [for (final _ in weights) 0.0];
  final raw = [for (final w in weights) (w > 0 ? w : 0) / sum * total];
  final parts = [for (final r in raw) (r + 1e-9).floor()];
  var left = total - parts.fold<int>(0, (a, p) => a + p);
  final order = [for (var i = 0; i < raw.length; i++) (i, raw[i] - (raw[i] + 1e-9).floor())]
    ..sort((a, b) {
      final c = b.$2.compareTo(a.$2);
      return c != 0 ? c : a.$1.compareTo(b.$1);
    });
  for (final (i, _) in order) {
    if (left <= 0) break;
    if (weights[i] > 0) {
      parts[i] += 1;
      left -= 1;
    }
  }
  return [for (final p in parts) p / 100];
}

/// The totals of a cart / an order being placed. [feeUsd] is the fee the quote shows (0 already when the seller pays).
CartTotals cartTotals({
  required List<TotalsLine> lines,
  required double discountUsd,
  required double feeUsd,
  bool vatEnabled = false,
  bool feePaidBySeller = false,
  bool showPlatformFee = true,
}) {
  final values = [for (final l in lines) cents(l.priceUsd * l.qty)];
  final subtotal = cents(values.fold<double>(0, (a, v) => a + v));
  final discount = cents(discountUsd.clamp(0, subtotal).toDouble());
  final shares = allocateCents(discount, [for (var i = 0; i < lines.length; i++) lines[i].discountable ? values[i] : 0.0]);
  var vat = 0.0;
  if (vatEnabled) {
    for (var i = 0; i < lines.length; i++) {
      final pct = lines[i].vatPct > 0 ? lines[i].vatPct : 0.0;
      final taxable = values[i] - shares[i];
      if (pct > 0 && taxable > 0) vat += cents(taxable * pct / 100);
    }
  }
  vat = cents(vat);
  final fee = feePaidBySeller ? 0.0 : cents(feeUsd > 0 ? feeUsd : 0);
  return CartTotals(
    subtotal: subtotal,
    discount: discount,
    vat: vat,
    fee: fee,
    showFeeLine: !feePaidBySeller && showPlatformFee,
    feeInTotal: !feePaidBySeller && !showPlatformFee && fee > 0,
    feePaidBySeller: feePaidBySeller,
    total: cents((subtotal - discount > 0 ? subtotal - discount : 0) + vat + fee),
  );
}
