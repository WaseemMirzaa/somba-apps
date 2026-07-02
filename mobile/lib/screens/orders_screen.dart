import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import 'more/order_screens.dart';

class OrdersScreen extends StatefulWidget {
  final Locale locale;

  const OrdersScreen({super.key, required this.locale});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  int _tab = 0;

  static const _orders = [
    {'id': 'SMB-2026-4821', 'status': 'processing', 'amount': 1498, 'items': 2, 'icon': Icons.devices_other_rounded},
    {'id': 'SMB-2026-4805', 'status': 'confirmed', 'amount': 74, 'items': 1, 'icon': Icons.watch_rounded},
    {'id': 'SMB-2026-4790', 'status': 'out_for_delivery', 'amount': 349, 'items': 1, 'icon': Icons.headphones_rounded},
    {'id': 'SMB-2026-4762', 'status': 'shipped', 'amount': 129, 'items': 2, 'icon': Icons.memory_rounded},
    {'id': 'SMB-2026-4712', 'status': 'delivered', 'amount': 218, 'items': 3, 'icon': Icons.checkroom_rounded},
    {'id': 'SMB-2026-4655', 'status': 'cancelled', 'amount': 56, 'items': 1, 'icon': Icons.close_rounded},
    {'id': 'SMB-2026-4610', 'status': 'returned', 'amount': 168, 'items': 1, 'icon': Icons.assignment_return_rounded},
  ];

  static const _tabs = ['All', 'Active', 'Delivered', 'Cancelled'];
  static const _active = {'pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'};

  bool _match(String status) {
    switch (_tab) {
      case 1:
        return _active.contains(status);
      case 2:
        return status == 'delivered';
      case 3:
        return status == 'cancelled' || status == 'returned';
      default:
        return true;
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final orders = _orders.where((o) => _match(o['status'] as String)).toList();

    return Scaffold(
      appBar: AppBar(
        title: Text(s.myOrders),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(
        children: [
          SizedBox(
            height: 46,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              itemCount: _tabs.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final sel = _tab == i;
                return GestureDetector(
                  onTap: () => setState(() => _tab = i),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: sel ? AppColors.primary : AppColors.surface,
                      borderRadius: BorderRadius.circular(100),
                      border: Border.all(color: sel ? AppColors.primary : AppColors.line),
                    ),
                    child: Text(_tabs[i],
                        style: TextStyle(color: sel ? Colors.white : AppColors.inkSoft, fontWeight: FontWeight.w700, fontSize: 12.5)),
                  ),
                );
              },
            ),
          ),
          Expanded(
            child: orders.isEmpty
                ? const Center(child: Text('No orders here yet', style: TextStyle(color: AppColors.muted)))
                : ListView.separated(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
                    itemCount: orders.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 12),
                    itemBuilder: (_, i) => _orderCard(orders[i], s),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _orderCard(Map<String, Object> o, Strings s) {
    final status = o['status'] as String;
    final c = _statusColor(status);
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(locale: widget.locale, delivered: status == 'delivered'))),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
        child: Column(children: [
          Row(children: [
            Container(
              height: 48, width: 48,
              decoration: BoxDecoration(color: c.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(14)),
              child: Icon(o['icon'] as IconData, color: c),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(o['id'] as String, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
              const SizedBox(height: 3),
              Text('${s.itemsCount(o['items'] as int)} · ${money(o['amount'] as int)}',
                  style: const TextStyle(color: AppColors.muted, fontSize: 13)),
            ])),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(100)),
              child: Text(s.orderStatus(status), style: TextStyle(color: c, fontSize: 11.5, fontWeight: FontWeight.w700)),
            ),
          ]),
          const Divider(height: 22),
          Row(children: [
            Icon(_statusIcon(status), size: 16, color: c),
            const SizedBox(width: 6),
            Expanded(child: Text(_statusHint(status, s), style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft, fontWeight: FontWeight.w500))),
            _actionFor(status, s),
          ]),
        ]),
      ),
    );
  }

  Widget _actionFor(String status, Strings s) {
    // Status-specific primary action, mirroring the web order detail.
    if (status == 'delivered') {
      return TextButton(
        onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(locale: widget.locale, delivered: true))),
        style: _btnStyle(),
        child: Text(s.isFr ? 'Évaluer' : 'Review'),
      );
    }
    if (status == 'cancelled' || status == 'returned') {
      return TextButton(
        onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Re-ordering these items…'))),
        style: _btnStyle(),
        child: Text(s.isFr ? 'Recommander' : 'Reorder'),
      );
    }
    return TextButton(
      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderTrackingScreen(locale: widget.locale))),
      style: _btnStyle(),
      child: Text(s.trackOrder),
    );
  }

  ButtonStyle _btnStyle() => TextButton.styleFrom(
        foregroundColor: AppColors.primary,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
      );

  Color _statusColor(String status) {
    switch (status) {
      case 'delivered':
        return AppColors.success;
      case 'shipped':
      case 'out_for_delivery':
        return AppColors.primary;
      case 'confirmed':
      case 'pending':
      case 'processing':
        return AppColors.amber;
      case 'cancelled':
      case 'returned':
        return AppColors.danger;
      default:
        return AppColors.muted;
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'delivered':
        return Icons.check_circle_rounded;
      case 'out_for_delivery':
        return Icons.electric_moped_rounded;
      case 'shipped':
        return Icons.local_shipping_rounded;
      case 'cancelled':
        return Icons.cancel_rounded;
      case 'returned':
        return Icons.assignment_return_rounded;
      case 'confirmed':
        return Icons.task_alt_rounded;
      default:
        return Icons.inventory_2_rounded;
    }
  }

  String _statusHint(String status, Strings s) {
    final fr = s.isFr;
    switch (status) {
      case 'delivered':
        return fr ? 'Livré le 24 juin' : 'Delivered on Jun 24';
      case 'out_for_delivery':
        return fr ? 'Le livreur arrive' : 'Rider is on the way';
      case 'shipped':
        return fr ? 'En route — arrive demain' : 'On the way — arrives tomorrow';
      case 'confirmed':
        return fr ? 'Commande confirmée' : 'Order confirmed';
      case 'cancelled':
        return fr ? 'Commande annulée' : 'Order cancelled';
      case 'returned':
        return fr ? 'Retour remboursé' : 'Return refunded';
      default:
        return fr ? 'En préparation à l\'entrepôt' : 'Being prepared at the warehouse';
    }
  }
}
