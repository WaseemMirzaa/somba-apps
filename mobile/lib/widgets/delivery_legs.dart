import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/models.dart';
import '../theme/app_theme.dart';
import 'kit.dart';

/// "Part of your order was delivered" with how many items are delivered and how many are still coming. Shown only on a
/// split delivery (some live lines delivered, the rest not).
class PartialDeliveryBanner extends StatelessWidget {
  const PartialDeliveryBanner({super.key, required this.order});

  final OrderDto order;

  @override
  Widget build(BuildContext context) {
    if (!order.partiallyDelivered) return const SizedBox.shrink();
    final s = Strings.of(context);
    final done = order.deliveredItems.fold<int>(0, (n, i) => n + i.qty);
    final left = order.comingItems.fold<int>(0, (n, i) => n + i.qty);
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Container(
        key: const ValueKey('partial-banner'),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppColors.success.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.inventory_rounded, color: AppColors.success, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.orderPartDelivered, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
              const SizedBox(height: 2),
              Text(s.orderPartCounts(done, done + left, left), key: const ValueKey('partial-counts'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.35)),
            ]),
          ),
        ]),
      ),
    );
  }
}

/// Whether the order has anything worth listing leg by leg: more than one customer leg, or a leg that carries only
/// part of the order.
bool showsDeliveryLegs(OrderDto o) {
  final legs = o.customerLegs;
  return legs.length > 1 || legs.any((l) => l.isPartial);
}

/// The order's customer legs, one row each: which delivery it is, what it is doing, and what it carries. A split order
/// has one open leg at a time; an express order's one leg goes straight from the store.
class DeliveryLegsPanel extends StatelessWidget {
  const DeliveryLegsPanel({super.key, required this.order});

  final OrderDto order;

  @override
  Widget build(BuildContext context) {
    final legs = order.customerLegs;
    if (legs.isEmpty) return const SizedBox.shrink();
    final s = Strings.of(context);
    final byId = {for (final i in order.items) if (i.id.isNotEmpty) i.id: i};
    return Panel(
      key: const ValueKey('delivery-legs'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(s.deliveriesTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        for (var n = 0; n < legs.length; n++) ...[
          if (n > 0) const Divider(height: 20),
          _row(s, legs[n], n + 1, legs.length, byId),
        ],
      ]),
    );
  }

  Widget _row(Strings s, OrderLeg l, int n, int total, Map<String, OrderItemDto> byId) {
    final color = switch (l.status) {
      'delivered' => AppColors.success,
      'failed' => AppColors.danger,
      'picked_up' || 'in_transit' => AppColors.primary,
      _ => AppColors.amber,
    };
    final names = [for (final it in l.items) byId[it.orderItemId]?.displayName(s.lang)].whereType<String>().where((x) => x.isNotEmpty).toList();
    final qty = l.items.fold<int>(0, (a, i) => a + i.qty);
    return Column(
      key: ValueKey('delivery-leg-$n'),
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Text(l.isExpress ? s.deliveryLegExpress : s.deliveryLegN(n, total),
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5, color: AppColors.inkSoft)),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: Container(
              key: ValueKey('delivery-leg-status-$n'),
              padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
              decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(100)),
              child: Text(s.deliveryLegStatus(l.status),
                  maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w700)),
            ),
          ),
        ]),
        if (names.isNotEmpty || qty > 0) ...[
          const SizedBox(height: 4),
          Text(
            names.isNotEmpty ? names.join(', ') : s.deliveryLegItems(qty),
            key: ValueKey('delivery-leg-items-$n'),
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.35),
          ),
        ],
        if (l.completesOrder == true && total > 1)
          Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Text(s.deliveryLegLast, style: const TextStyle(color: AppColors.muted, fontSize: 12, fontWeight: FontWeight.w600)),
          ),
      ],
    );
  }
}

/// "Delivery attempt 1 failed: Customer not reachable. The rider will try again." for an order whose customer leg failed and
/// is not over. Renders nothing otherwise.
class FailedAttemptBanner extends StatelessWidget {
  const FailedAttemptBanner({super.key, required this.order});

  final OrderDto order;

  @override
  Widget build(BuildContext context) {
    final a = order.failedAttempt;
    if (a == null) return const SizedBox.shrink();
    final s = Strings.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Container(
        key: const ValueKey('failed-attempt'),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppColors.amber.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.report_problem_rounded, color: AppColors.amber, size: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Text(s.deliveryAttemptFailed(a.attempt, a.reason, a.retry),
                key: const ValueKey('failed-attempt-text'), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, height: 1.35)),
          ),
        ]),
      ),
    );
  }
}
