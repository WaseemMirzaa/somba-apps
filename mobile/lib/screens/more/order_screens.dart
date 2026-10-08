import 'package:flutter/material.dart';
import '../../data/catalog_live.dart';
import '../../l10n/strings.dart';
import '../../services/models.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';
import '../../widgets/product_image.dart';
import '../payment_pending_screen.dart';
import 'returns_extra.dart';
import 'support_extra.dart';

/// Order detail — straight from the live order (updated by server pushes).
class OrderDetailScreen extends StatefulWidget {
  final Locale locale;
  final String orderId;
  const OrderDetailScreen({super.key, this.locale = const Locale('en'), required this.orderId});

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  bool _busy = false;

  Future<void> _cancel(OrderDto o) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this order?'),
        content: Text(o.status == 'pending'
            ? 'It has not been paid yet; nothing will be charged.'
            : 'You will be refunded to your Somba&Teka wallet.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep order')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Cancel order')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = true);
    try {
      await RealtimeStore.instance.cancelOrder(o.id);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final store = RealtimeStore.instance;
        final o = store.orderById(widget.orderId);
        if (o == null) {
          return Scaffold(appBar: backAppBar(context, 'Order'), body: const Center(child: Text('Order not found.')));
        }
        final payment = store.paymentForOrder(o.id);
        final cancellable = o.status == 'pending' || o.status == 'confirmed';
        final trackable = const {'processing', 'shipped', 'out_for_delivery'}.contains(o.status);
        final c = switch (o.status) {
          'delivered' => AppColors.success,
          'cancelled' || 'returned' => AppColors.danger,
          'out_for_delivery' || 'shipped' => AppColors.primary,
          _ => AppColors.amber,
        };

        return Scaffold(
          appBar: backAppBar(context, 'Order ${o.reference}'),
          body: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
            children: [
              Panel(
                child: Row(children: [
                  Container(
                    height: 44,
                    width: 44,
                    decoration: BoxDecoration(color: c.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(12)),
                    child: Icon(Icons.inventory_2_rounded, color: c),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(s.orderStatus(o.status), key: const ValueKey('order-status'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                      const SizedBox(height: 2),
                      if (o.createdAt != null)
                        Text('Placed ${_when(o.createdAt!)}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                    ]),
                  ),
                  if (o.status == 'pending' && payment != null && payment.isPending)
                    FilledButton(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => PaymentPendingScreen(locale: widget.locale, orderId: o.id))),
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 14)),
                      child: const Text('Pay'),
                    )
                  else if (trackable)
                    FilledButton(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrderTrackingScreen(locale: widget.locale, orderId: o.id))),
                      style: FilledButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 14)),
                      child: const Text('Track'),
                    ),
                ]),
              ),
              const SizedBox(height: 14),
              Panel(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Items', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 12),
                  ...o.items.map((i) {
                    final p = productByUuid(i.productId);
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Row(children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: SizedBox(
                            height: 60,
                            width: 60,
                            child: p != null
                                ? ProductImage(product: p, iconSize: 26)
                                : Container(color: AppColors.background, child: const Icon(Icons.shopping_bag_outlined, color: AppColors.faint)),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(i.productName, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                          const SizedBox(height: 2),
                          Text('Qty ${i.qty}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                        ])),
                        Text(money(i.priceUsd * i.qty), style: const TextStyle(fontWeight: FontWeight.w800)),
                      ]),
                    );
                  }),
                ]),
              ),
              const SizedBox(height: 14),
              Panel(
                child: Column(children: [
                  _row('Subtotal', money(o.subtotalUsd)),
                  const SizedBox(height: 8),
                  _row('Delivery', o.deliveryFeeUsd == 0 ? 'Free' : money(o.deliveryFeeUsd)),
                  if (o.discountUsd > 0) ...[
                    const SizedBox(height: 8),
                    _row('Promo ${o.promoCode ?? ''}', '- ${money(o.discountUsd)}'),
                  ],
                  const Divider(height: 22),
                  _row('Total', money(o.totalUsd), bold: true),
                  const SizedBox(height: 12),
                  Row(children: [
                    Icon(
                      payment == null || payment.status == 'succeeded' ? Icons.verified_rounded : (payment.isPending ? Icons.hourglass_top_rounded : Icons.error_outline_rounded),
                      size: 18,
                      color: payment?.status == 'failed' ? AppColors.danger : (payment?.isPending == true ? AppColors.amber : AppColors.success),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${_paymentState(payment)} · ${s.paymentLabel(o.paymentMethod)}',
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                    ),
                  ]),
                ]),
              ),
              const SizedBox(height: 14),
              Row(children: [
                if (cancellable)
                  Expanded(
                    child: OutlinedButton.icon(
                      key: const ValueKey('cancel-order'),
                      onPressed: _busy ? null : () => _cancel(o),
                      icon: const Icon(Icons.close_rounded, size: 18),
                      label: const Text('Cancel order'),
                    ),
                  )
                else if (o.status == 'delivered')
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReturnRequestScreen(locale: widget.locale, order: o))),
                      icon: const Icon(Icons.assignment_return_rounded, size: 18),
                      label: const Text('Return'),
                    ),
                  ),
                if (cancellable || o.status == 'delivered') const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => HelpScreen(locale: widget.locale))),
                    icon: const Icon(Icons.headset_mic_rounded, size: 18),
                    label: const Text('Help'),
                  ),
                ),
              ]),
            ],
          ),
        );
      },
    );
  }

  static String _paymentState(PaymentDto? p) {
    if (p == null) return 'Paid';
    return switch (p.status) {
      'succeeded' => 'Paid',
      'pending' => 'Awaiting payment',
      'refunded' => 'Refunded',
      _ => 'Payment failed',
    };
  }

  static String _when(DateTime d) {
    final now = DateTime.now();
    final sameDay = now.year == d.year && now.month == d.month && now.day == d.day;
    final hm = '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
    return sameDay ? 'today, $hm' : '${d.day}/${d.month}/${d.year} $hm';
  }

  Widget _row(String l, String v, {bool bold = false}) => Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(l, style: TextStyle(fontSize: bold ? 15 : 13.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? AppColors.ink : AppColors.muted)),
        Text(v, style: TextStyle(fontSize: bold ? 17 : 13.5, fontWeight: FontWeight.w800, color: bold ? AppColors.primary : AppColors.ink)),
      ]);
}

/// Tracking — the timeline follows the order status and the rider's position is
/// the one the rider app streams (`delivery:location`). Nothing is simulated.
class OrderTrackingScreen extends StatelessWidget {
  final Locale locale;
  final String orderId;
  const OrderTrackingScreen({super.key, this.locale = const Locale('en'), required this.orderId});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final store = RealtimeStore.instance;
        final o = store.orderById(orderId);
        if (o == null) {
          return Scaffold(appBar: backAppBar(context, 'Track order'), body: const Center(child: Text('Order not found.')));
        }
        const flow = ['confirmed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
        final reached = flow.indexOf(o.status);
        final cancelled = o.status == 'cancelled' || o.status == 'returned';
        final loc = store.riderLocations[o.id];
        String label(int i) => s.orderStatus(flow[i]);
        final steps = <(String, String, bool)>[
          ('Order placed', o.reference, true),
          for (var i = 0; i < flow.length; i++)
            (label(i), i == reached ? 'Current status' : '', !cancelled && reached >= i),
        ];
        return Scaffold(
          appBar: backAppBar(context, 'Track order'),
          body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            Panel(
              child: Row(children: [
                Container(
                  height: 44,
                  width: 44,
                  decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(Icons.electric_moped_rounded, color: AppColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(
                      loc != null ? 'Your rider is on the way' : (o.status == 'out_for_delivery' ? 'Rider is heading to you' : 'Rider not on the road yet'),
                      style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5),
                    ),
                    Text(
                      loc != null
                          ? 'Live position: ${loc.lat.toStringAsFixed(4)}, ${loc.lng.toStringAsFixed(4)}'
                          : "Live location appears here once the rider starts the delivery.",
                      style: const TextStyle(color: AppColors.muted, fontSize: 12.5),
                    ),
                  ]),
                ),
              ]),
            ),
            const SizedBox(height: 14),
            Panel(child: cancelled ? Text(s.orderStatus(o.status), style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w800)) : StatusTimeline(steps)),
          ]),
        );
      },
    );
  }
}
