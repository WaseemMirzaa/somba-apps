import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../routes/app_routes.dart';
import '../../widgets/common.dart';

/// CF-25 — Return request (reason + photos), 7-day window enforced upstream.
class ReturnRequestScreen extends StatefulWidget {
  const ReturnRequestScreen({super.key});

  @override
  State<ReturnRequestScreen> createState() => _ReturnRequestScreenState();
}

class _ReturnRequestScreenState extends State<ReturnRequestScreen> {
  final _note = TextEditingController();
  String _reason = 'reason_damaged';
  bool _refundToWallet = true;
  int _photos = 0;

  static const _reasons = [
    'reason_damaged',
    'reason_wrong_item',
    'reason_not_as_described',
    'reason_no_longer_needed',
  ];

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final order = Get.arguments as Order;
    final shop = Get.find<ShopService>();

    return Scaffold(
      appBar: AppBar(title: Text('return_request'.tr)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: NetImage(
                seed: order.items.first.product.imageSeeds.first,
                width: 48,
                height: 48,
                radius: BorderRadius.circular(10),
              ),
              title: Text(order.id,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 14)),
              subtitle: Text(order.items.first.product.name,
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppColors.primaryLight,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.schedule, size: 18, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(
                  child: Text('return_window_note'.tr,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.primary)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text('return_reason'.tr,
              style: const TextStyle(fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          for (final reason in _reasons)
            RadioListTile<String>(
              contentPadding: EdgeInsets.zero,
              value: reason,
              groupValue: _reason,
              title: Text(reason.tr, style: const TextStyle(fontSize: 14)),
              onChanged: (v) => setState(() => _reason = v!),
            ),
          TextField(
            controller: _note,
            maxLines: 3,
            decoration: InputDecoration(hintText: 'return_note_hint'.tr),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () {
              setState(() => _photos++);
              Get.snackbar('return_request'.tr, 'photo_added'.tr,
                  snackPosition: SnackPosition.BOTTOM,
                  duration: const Duration(seconds: 1));
            },
            icon: const Icon(Icons.add_a_photo_outlined, size: 18),
            label: Text('add_photos'.tr + (_photos > 0 ? ' ($_photos)' : '')),
          ),
          const SizedBox(height: 16),
          Text('refund_destination'.tr,
              style: const TextStyle(fontWeight: FontWeight.w800)),
          RadioListTile<bool>(
            contentPadding: EdgeInsets.zero,
            value: true,
            groupValue: _refundToWallet,
            title:
                Text('refund_wallet'.tr, style: const TextStyle(fontSize: 14)),
            onChanged: (v) => setState(() => _refundToWallet = v!),
          ),
          RadioListTile<bool>(
            contentPadding: EdgeInsets.zero,
            value: false,
            groupValue: _refundToWallet,
            title: Text('refund_original'.tr,
                style: const TextStyle(fontSize: 14)),
            onChanged: (v) => setState(() => _refundToWallet = v!),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: () {
              final request = shop.requestReturn(
                order,
                reasonKey: _reason,
                note: _note.text,
                refundToWallet: _refundToWallet,
              );
              Get.offNamed(AppRoutes.returnStatus, arguments: request);
              Get.snackbar('returns'.tr, 'return_requested_msg'.tr,
                  snackPosition: SnackPosition.BOTTOM);
            },
            child: Text('submit_return'.tr),
          ),
        ],
      ),
    );
  }
}

/// CF-26 — Return progress.
class ReturnStatusScreen extends StatelessWidget {
  const ReturnStatusScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final request = Get.arguments as ReturnRequest;
    const steps = [
      ReturnStatus.requested,
      ReturnStatus.approved,
      ReturnStatus.pickedUp,
      ReturnStatus.refunded,
    ];
    final reachedIndex = steps.indexOf(request.status);

    return Scaffold(
      appBar: AppBar(title: Text('return_status'.tr)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              title: Text(request.id,
                  style: const TextStyle(fontWeight: FontWeight.w800)),
              subtitle: Text(
                  '${request.order.id} · ${request.reasonKey.tr}\n${'refund_destination'.tr}: ${request.refundToWallet ? 'pay_wallet'.tr : request.order.paymentMethod.trKey.tr}'),
              isThreeLine: true,
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  for (var i = 0; i < steps.length; i++)
                    Row(
                      children: [
                        Icon(
                          i <= reachedIndex
                              ? Icons.check_circle
                              : Icons.radio_button_unchecked,
                          color: i <= reachedIndex
                              ? AppColors.success
                              : AppColors.border,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            child: Text(
                              'retstat_${steps[i].name}'.tr,
                              style: TextStyle(
                                fontWeight: i <= reachedIndex
                                    ? FontWeight.w700
                                    : FontWeight.w500,
                                color: i <= reachedIndex
                                    ? AppColors.ink
                                    : AppColors.muted,
                              ),
                            ),
                          ),
                        ),
                        if (i == 0)
                          Text(formatDate(request.requestedAt),
                              style: const TextStyle(
                                  fontSize: 11, color: AppColors.muted)),
                      ],
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
