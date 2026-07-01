import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import 'more/order_screens.dart';

class OrdersScreen extends StatelessWidget {
  final Locale locale;

  const OrdersScreen({super.key, required this.locale});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);
    const orders = [
      {'id': 'SMB-2026-4821', 'status': 'processing', 'amount': 1498, 'items': 2, 'icon': Icons.devices_other_rounded},
      {'id': 'SMB-2026-4790', 'status': 'shipped', 'amount': 349, 'items': 1, 'icon': Icons.headphones_rounded},
      {'id': 'SMB-2026-4712', 'status': 'delivered', 'amount': 218, 'items': 3, 'icon': Icons.checkroom_rounded},
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text(s.myOrders),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
        itemCount: orders.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          final o = orders[i];
          final status = o['status'] as String;
          final c = _statusColor(status);
          return GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(locale: locale))),
            child: Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(20),
              boxShadow: AppShadow.card,
            ),
            child: Column(
              children: [
                Row(
                  children: [
                    Container(
                      height: 48,
                      width: 48,
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.10),
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: Icon(o['icon'] as IconData, color: AppColors.primary),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(o['id'] as String,
                              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                          const SizedBox(height: 3),
                          Text('${s.itemsCount(o['items'] as int)} · ${money(o['amount'] as int)}',
                              style: const TextStyle(color: AppColors.muted, fontSize: 13)),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: c.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(100),
                      ),
                      child: Text(s.orderStatus(status),
                          style: TextStyle(color: c, fontSize: 11.5, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
                const Divider(height: 22),
                Row(
                  children: [
                    Icon(_statusIcon(status), size: 16, color: c),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(_statusHint(status, s),
                          style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft, fontWeight: FontWeight.w500)),
                    ),
                    TextButton(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderTrackingScreen(locale: locale))),
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(horizontal: 8),
                        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                      child: Text(s.trackOrder),
                    ),
                  ],
                ),
              ],
            ),
          ),
          );
        },
      ),
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'delivered':
        return AppColors.success;
      case 'shipped':
        return AppColors.primary;
      default:
        return AppColors.amber;
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'delivered':
        return Icons.check_circle_rounded;
      case 'shipped':
        return Icons.local_shipping_rounded;
      default:
        return Icons.inventory_2_rounded;
    }
  }

  String _statusHint(String status, Strings s) {
    final fr = s.isFr;
    switch (status) {
      case 'delivered':
        return fr ? 'Livré le 24 juin' : 'Delivered on Jun 24';
      case 'shipped':
        return fr ? 'En route — arrive demain' : 'On the way — arrives tomorrow';
      default:
        return fr ? 'En préparation à l\'entrepôt' : 'Being prepared at the warehouse';
    }
  }
}
