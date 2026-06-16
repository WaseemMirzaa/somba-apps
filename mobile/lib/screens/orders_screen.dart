import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/app_badge.dart';
import '../widgets/app_card.dart';
import '../widgets/price_text.dart';

class OrdersScreen extends StatelessWidget {
  final Locale locale;

  const OrdersScreen({super.key, required this.locale});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);
    final orders = [
      {'id': 'ORD-2024-001', 'status': 'delivered', 'amount': 1498, 'date': '12 Jun 2026', 'items': 2},
      {'id': 'ORD-2024-003', 'status': 'shipped', 'amount': 349, 'date': '14 Jun 2026', 'items': 1},
    ];

    return Scaffold(
      appBar: AppBar(title: Text(s.myOrders)),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: orders.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          final o = orders[i];
          final status = o['status'] as String;
          return AppCard(
            padding: const EdgeInsets.all(16),
            onTap: () => ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('${s.trackOrder} ${o['id']} (mock)')),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(o['id'] as String, style: Theme.of(context).textTheme.titleMedium),
                    ),
                    AppBadge(s.statusLabel(status), tone: _tone(status), icon: _icon(status)),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  '${o['date']} · ${o['items']} ${s.items}',
                  style: const TextStyle(color: AppColors.slate500, fontSize: 13),
                ),
                const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Divider()),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    PriceText(
                      amount: (o['amount'] as int).toDouble(),
                      style: Theme.of(context).textTheme.titleMedium!.copyWith(color: AppColors.slate900),
                    ),
                    Row(
                      children: [
                        Text(s.trackOrder, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 13)),
                        const Icon(Icons.chevron_right_rounded, color: AppColors.primary, size: 20),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  BadgeTone _tone(String status) {
    switch (status) {
      case 'delivered':
        return BadgeTone.success;
      case 'shipped':
        return BadgeTone.royal;
      case 'processing':
        return BadgeTone.warning;
      default:
        return BadgeTone.neutral;
    }
  }

  IconData _icon(String status) {
    switch (status) {
      case 'delivered':
        return Icons.check_circle_outline_rounded;
      case 'shipped':
        return Icons.local_shipping_outlined;
      default:
        return Icons.schedule_rounded;
    }
  }
}
