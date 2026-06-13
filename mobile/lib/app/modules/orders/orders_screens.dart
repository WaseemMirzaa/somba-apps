import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../core/services/session_service.dart';
import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../routes/app_routes.dart';
import '../../widgets/common.dart';
import '../shell/shell_screen.dart';

/// CF-22 — Order history with ongoing / delivered / other tabs.
class OrdersTab extends StatelessWidget {
  const OrdersTab({super.key});

  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>();
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text('orders'.tr),
          bottom: TabBar(
            tabs: [
              Tab(text: 'orders_ongoing'.tr),
              Tab(text: 'orders_delivered'.tr),
              Tab(text: 'orders_other'.tr),
            ],
          ),
        ),
        body: Obx(() {
          if (shop.orders.isEmpty) {
            return EmptyState(
              icon: Icons.receipt_long_outlined,
              message: 'orders_empty'.tr,
              actionLabel: 'start_shopping'.tr,
              onAction: () => Get.find<ShellController>().index.value = 0,
            );
          }
          final ongoing = shop.orders
              .where((o) =>
                  !o.status.isException &&
                  o.status != OrderStatus.delivered &&
                  o.status != OrderStatus.completed)
              .toList();
          final delivered = shop.orders
              .where((o) =>
                  o.status == OrderStatus.delivered ||
                  o.status == OrderStatus.completed)
              .toList();
          final other =
              shop.orders.where((o) => o.status.isException).toList();
          return TabBarView(
            children: [
              _OrderList(orders: ongoing),
              _OrderList(orders: delivered),
              _OrderList(orders: other),
            ],
          );
        }),
      ),
    );
  }
}

class _OrderList extends StatelessWidget {
  final List<Order> orders;

  const _OrderList({required this.orders});

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionService>();
    if (orders.isEmpty) {
      return EmptyState(
          icon: Icons.inbox_outlined, message: 'orders_empty'.tr);
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: orders.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final order = orders[i];
        return Card(
          child: InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => Get.toNamed(AppRoutes.orderDetail, arguments: order),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(order.id,
                            style: const TextStyle(
                                fontWeight: FontWeight.w800, fontSize: 14)),
                      ),
                      StatusChip(status: order.status),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      NetImage(
                        seed: order.items.first.product.imageSeeds.first,
                        width: 52,
                        height: 52,
                        radius: BorderRadius.circular(10),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(order.items.first.product.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: 13)),
                            Text(
                              '${order.store.name} · ${'items_count'.trParams({
                                    'count': '${order.items.length}'
                                  })}',
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.muted),
                            ),
                            Text(formatDate(order.placedAt),
                                style: const TextStyle(
                                    fontSize: 12, color: AppColors.muted)),
                          ],
                        ),
                      ),
                      Text(session.money(order.total),
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              color: AppColors.primary)),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// CF-23 — Order detail with contextual actions.
class OrderDetailScreen extends StatelessWidget {
  const OrderDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final order = Get.arguments as Order;
    final shop = Get.find<ShopService>();
    final session = Get.find<SessionService>();

    return Scaffold(
      appBar: AppBar(title: Text('order_detail'.tr)),
      body: Obx(
        () {
          // Touch the observable so status changes rebuild this screen.
          shop.orders.length;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(order.id,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800)),
                          ),
                          StatusChip(status: order.status),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                          '${'placed_on'.tr} ${formatDate(order.placedAt)} · ${'paid_with'.tr} ${order.paymentMethod.trKey.tr}',
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.muted)),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(order.store.name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13)),
                      const Divider(height: 16),
                      for (final item in order.items)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Row(
                            children: [
                              NetImage(
                                seed: item.product.imageSeeds.first,
                                width: 44,
                                height: 44,
                                radius: BorderRadius.circular(8),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(item.product.name,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            fontSize: 13,
                                            fontWeight: FontWeight.w600)),
                                    Text(
                                      [
                                        if (item.variantLabel.isNotEmpty)
                                          item.variantLabel,
                                        '× ${item.quantity}',
                                      ].join(' · '),
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.muted),
                                    ),
                                  ],
                                ),
                              ),
                              Text(
                                  session
                                      .money(item.price * item.quantity),
                                  style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ),
                      const Divider(height: 16),
                      _row('subtotal'.tr, session.money(order.subtotal)),
                      const SizedBox(height: 4),
                      _row('delivery_fee'.tr,
                          session.money(order.deliveryFee)),
                      if (order.discount > 0) ...[
                        const SizedBox(height: 4),
                        _row('discount'.tr,
                            '-${session.money(order.discount)}',
                            color: AppColors.success),
                      ],
                      const Divider(height: 16),
                      _row('total'.tr, session.money(order.total),
                          bold: true),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Card(
                child: ListTile(
                  leading: const Icon(Icons.location_on,
                      color: AppColors.brandRed),
                  title: Text(order.address.label,
                      style: const TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 14)),
                  subtitle: Text(
                      '${order.address.detail}\n${order.address.commune}, ${order.address.city}'),
                  isThreeLine: true,
                ),
              ),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: () =>
                    Get.toNamed(AppRoutes.orderTracking, arguments: order),
                icon: const Icon(Icons.location_searching, size: 18),
                label: Text('track_order'.tr),
              ),
              const SizedBox(height: 10),
              if (order.canCancel)
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.danger,
                    side: const BorderSide(color: AppColors.danger),
                  ),
                  onPressed: () => _confirmCancel(order, shop),
                  icon: const Icon(Icons.cancel_outlined, size: 18),
                  label: Text('cancel_order'.tr),
                ),
              if (order.status == OrderStatus.delivered ||
                  order.status == OrderStatus.completed) ...[
                OutlinedButton.icon(
                  onPressed: () {
                    shop.reorder(order);
                    Get.snackbar('cart'.tr, 'reorder_done'.tr,
                        snackPosition: SnackPosition.BOTTOM);
                  },
                  icon: const Icon(Icons.replay, size: 18),
                  label: Text('reorder'.tr),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () {
                    if (shop.isReturnable(order)) {
                      Get.toNamed(AppRoutes.returnRequest,
                          arguments: order);
                    } else {
                      Get.snackbar(
                          'returns'.tr, 'return_not_eligible'.tr,
                          snackPosition: SnackPosition.BOTTOM);
                    }
                  },
                  icon: const Icon(Icons.assignment_return_outlined,
                      size: 18),
                  label: Text('return_item'.tr),
                ),
                const SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () => Get.toNamed(AppRoutes.reviewCompose,
                      arguments: order.items.first.product),
                  icon: const Icon(Icons.star_outline, size: 18),
                  label: Text('write_review'.tr),
                ),
              ],
              const SizedBox(height: 24),
            ],
          );
        },
      ),
    );
  }

  void _confirmCancel(Order order, ShopService shop) {
    Get.dialog(
      AlertDialog(
        title: Text('cancel_order'.tr),
        content: Text('cancel_order_confirm'.tr),
        actions: [
          TextButton(onPressed: Get.back, child: Text('no'.tr)),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: () {
              shop.cancelOrder(order);
              Get.back();
              Get.snackbar('orders'.tr, 'order_cancelled_msg'.tr,
                  snackPosition: SnackPosition.BOTTOM);
            },
            child: Text('yes'.tr),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false, Color? color}) {
    final style = TextStyle(
      fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
      fontSize: bold ? 15 : 13,
      color: color,
    );
    return Row(
      children: [
        Expanded(child: Text(label, style: style)),
        Text(value, style: style),
      ],
    );
  }
}

/// CF-24 — Status timeline plus the parcel journey on a map
/// (seller → warehouse → customer).
class OrderTrackingScreen extends StatelessWidget {
  const OrderTrackingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final order = Get.arguments as Order;
    final shop = Get.find<ShopService>();

    return Scaffold(
      appBar: AppBar(title: Text('tracking_title'.tr)),
      body: Obx(() {
        shop.orders.length; // rebuild when the mock progression ticks
        final mainStatuses =
            OrderStatus.values.where((s) => !s.isException).toList();
        final reached = order.status.isException
            ? 0
            : mainStatuses.indexOf(order.status);
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(order.id,
                          style:
                              const TextStyle(fontWeight: FontWeight.w800)),
                    ),
                    StatusChip(status: order.status),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            Text('parcel_journey'.tr,
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            SizedBox(
              height: 220,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: GoogleMap(
                  initialCameraPosition: CameraPosition(
                    target: order.route[1],
                    zoom: 11.5,
                  ),
                  markers: {
                    Marker(
                      markerId: const MarkerId('seller'),
                      position: order.route.first,
                      infoWindow:
                          InfoWindow(title: 'seller_location'.tr),
                      icon: BitmapDescriptor.defaultMarkerWithHue(
                          BitmapDescriptor.hueAzure),
                    ),
                    Marker(
                      markerId: const MarkerId('warehouse'),
                      position: order.route[1],
                      infoWindow: InfoWindow(title: 'warehouse'.tr),
                      icon: BitmapDescriptor.defaultMarkerWithHue(
                          BitmapDescriptor.hueViolet),
                    ),
                    Marker(
                      markerId: const MarkerId('customer'),
                      position: order.route.last,
                      infoWindow: InfoWindow(title: 'your_address'.tr),
                    ),
                  },
                  polylines: {
                    Polyline(
                      polylineId: const PolylineId('route'),
                      points: order.route,
                      color: AppColors.primary,
                      width: 4,
                      patterns: [PatternItem.dash(24), PatternItem.gap(12)],
                    ),
                  },
                  myLocationButtonEnabled: false,
                  zoomControlsEnabled: false,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    for (var i = 0; i < mainStatuses.length; i++)
                      _TimelineRow(
                        status: mainStatuses[i],
                        entry: order.timeline[i],
                        done: !order.status.isException && i <= reached,
                        active: i == reached && !order.status.isException,
                        isLast: i == mainStatuses.length - 1,
                      ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
          ],
        );
      }),
    );
  }
}

class _TimelineRow extends StatelessWidget {
  final OrderStatus status;
  final TimelineEntry entry;
  final bool done;
  final bool active;
  final bool isLast;

  const _TimelineRow({
    required this.status,
    required this.entry,
    required this.done,
    required this.active,
    required this.isLast,
  });

  @override
  Widget build(BuildContext context) {
    final color = done ? AppColors.success : AppColors.border;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Column(
            children: [
              Container(
                width: 22,
                height: 22,
                decoration: BoxDecoration(
                  color: done ? AppColors.success : AppColors.surface,
                  shape: BoxShape.circle,
                  border: Border.all(color: color, width: 2),
                ),
                child: done
                    ? const Icon(Icons.check, size: 14, color: Colors.white)
                    : null,
              ),
              if (!isLast)
                Expanded(child: Container(width: 2, color: color)),
            ],
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          status.trKey.tr,
                          style: TextStyle(
                            fontWeight:
                                active ? FontWeight.w800 : FontWeight.w600,
                            fontSize: 14,
                            color: done ? AppColors.ink : AppColors.muted,
                          ),
                        ),
                      ),
                      if (entry.at != null)
                        Text(
                          formatDate(entry.at!),
                          style: const TextStyle(
                              fontSize: 11, color: AppColors.muted),
                        ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'status_desc_${status.name}'.tr,
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.muted, height: 1.3),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
