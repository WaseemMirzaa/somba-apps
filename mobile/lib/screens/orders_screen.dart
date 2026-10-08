import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../services/models.dart';
import '../services/realtime_store.dart';
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

    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final store = RealtimeStore.instance;
        final orders = store.orders.where((o) => _match(o.status)).toList();
        return Scaffold(
          appBar: AppBar(
            title: Text(s.myOrders),
            automaticallyImplyLeading: Navigator.canPop(context),
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
                child: !store.hydrated
                    ? const Center(child: CircularProgressIndicator())
                    : orders.isEmpty
                        ? Center(
                            child: Text(s.isFr ? 'Aucune commande pour le moment' : 'No orders here yet',
                                style: const TextStyle(color: AppColors.muted)))
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                            itemCount: orders.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 12),
                            itemBuilder: (_, i) => _orderCard(orders[i], s),
                          ),
              ),
            ],
          ),
        );
      },
    );
  }

  void _open(OrderDto o) =>
      Navigator.push(context, MaterialPageRoute(builder: (_) => OrderDetailScreen(locale: widget.locale, orderId: o.id)));

  Widget _orderCard(OrderDto o, Strings s) {
    final c = _statusColor(o.status);
    return GestureDetector(
      key: ValueKey('order-${o.reference}'),
      onTap: () => _open(o),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
        child: Column(children: [
          Row(children: [
            Container(
              height: 48,
              width: 48,
              decoration: BoxDecoration(color: c.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(14)),
              child: Icon(_statusIcon(o.status), color: c),
            ),
            const SizedBox(width: 12),
            Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(o.reference, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
              const SizedBox(height: 3),
              Text('${s.itemsCount(o.itemCount)} · ${money(o.totalUsd)}', style: const TextStyle(color: AppColors.muted, fontSize: 13)),
            ])),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(100)),
              child: Text(s.orderStatus(o.status), style: TextStyle(color: c, fontSize: 11.5, fontWeight: FontWeight.w700)),
            ),
          ]),
          const Divider(height: 22),
          Row(children: [
            Icon(_statusIcon(o.status), size: 16, color: c),
            const SizedBox(width: 6),
            Expanded(child: Text(_statusHint(o, s), style: const TextStyle(fontSize: 12.5, color: AppColors.inkSoft, fontWeight: FontWeight.w500))),
            TextButton(
              onPressed: () => _open(o),
              style: TextButton.styleFrom(
                  foregroundColor: AppColors.primary, padding: const EdgeInsets.symmetric(horizontal: 8), textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
              child: Text(s.isFr ? 'Détails' : 'Details'),
            ),
          ]),
        ]),
      ),
    );
  }

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
      case 'pending':
        return Icons.hourglass_top_rounded;
      default:
        return Icons.inventory_2_rounded;
    }
  }

  String _statusHint(OrderDto o, Strings s) {
    final fr = s.isFr;
    switch (o.status) {
      case 'delivered':
        return fr ? 'Livrée' : 'Delivered';
      case 'out_for_delivery':
        return fr ? 'Le livreur arrive' : 'Rider is on the way';
      case 'shipped':
        return fr ? 'En route' : 'On the way';
      case 'confirmed':
        return fr ? 'Commande confirmée' : 'Order confirmed';
      case 'pending':
        return fr ? 'En attente du paiement' : 'Waiting for payment';
      case 'cancelled':
        return fr ? 'Commande annulée' : 'Order cancelled';
      case 'returned':
        return fr ? 'Retour remboursé' : 'Return refunded';
      default:
        return fr ? "En préparation à l'entrepôt" : 'Being prepared at the warehouse';
    }
  }
}
