import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import 'pickup_proof_controller.dart';

class PickupProofScreen extends GetView<PickupProofController> {
  const PickupProofScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final task = controller.task;
    if (task == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('common_not_found'.tr)),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text('proof_title'.tr)),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    'proof_scan_instruction'.tr,
                    style: const TextStyle(
                      fontSize: 13.5,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Obx(() {
                    controller.tasks.pickupTasks.length;
                    controller.tasks.activeBatch.value;
                    controller.scanning.length;
                    return Column(
                      children: [
                        for (final parcel in task.parcels) ...[
                          Card(
                            child: Padding(
                              padding: const EdgeInsets.all(14),
                              child: Row(
                                children: [
                                  LeadingIcon(
                                    icon: parcel.scanned
                                        ? Icons.check_circle_outline
                                        : Icons.qr_code_scanner,
                                    color: parcel.scanned
                                        ? AppColors.success
                                        : AppColors.primary,
                                  ),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          parcel.description,
                                          style: const TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w700,
                                            color: AppColors.text,
                                          ),
                                        ),
                                        const SizedBox(height: 3),
                                        Text(
                                          parcel.barcode,
                                          style: const TextStyle(
                                            fontSize: 12,
                                            color: AppColors.textMuted,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  if (parcel.scanned)
                                    AppChip(
                                      label: 'proof_scanned'.tr,
                                      color: AppColors.success,
                                    )
                                  else if (controller.scanning
                                      .contains(parcel.id))
                                    const SizedBox(
                                      width: 22,
                                      height: 22,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2.5,
                                      ),
                                    )
                                  else
                                    OutlinedButton(
                                      onPressed: () =>
                                          controller.scanParcel(parcel),
                                      child: Text('proof_scan'.tr),
                                    ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                        ],
                      ],
                    );
                  }),
                  const SizedBox(height: 10),
                  SectionTitle(text: 'proof_otp_label'.tr),
                  TextField(
                    controller: controller.otpCtrl,
                    keyboardType: TextInputType.number,
                    maxLength: 4,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 12,
                    ),
                    decoration: InputDecoration(
                      counterText: '',
                      hintText: '••••',
                      helperText: 'proof_otp_help'.tr,
                    ),
                  ),
                  Obx(
                    () => controller.errorKey.value.isEmpty
                        ? const SizedBox(height: 8)
                        : Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: Text(
                              controller.errorKey.value.tr,
                              style: const TextStyle(
                                color: AppColors.danger,
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: FilledButton.icon(
                onPressed: controller.confirm,
                icon: const Icon(Icons.task_alt),
                label: Text('proof_confirm_pickup'.tr),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
