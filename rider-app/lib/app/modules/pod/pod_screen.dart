import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import 'pod_controller.dart';

class PodScreen extends GetView<PodController> {
  const PodScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final stop = controller.stop;
    if (stop == null) {
      return Scaffold(
        appBar: AppBar(),
        body: Center(child: Text('common_not_found'.tr)),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text('pod_title'.tr)),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Card(
                    child: ListTile(
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16),
                      ),
                      leading: const LeadingIcon(
                        icon: Icons.person_outline,
                        color: AppColors.accent,
                      ),
                      title: Text(
                        stop.partyName,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 14.5,
                        ),
                      ),
                      subtitle: Text(
                        '${stop.addressText}, ${stop.commune}',
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textMuted,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'pod_instruction'.tr,
                    style: const TextStyle(
                      fontSize: 13.5,
                      color: AppColors.textMuted,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Obx(() {
                    controller.tasks.activeBatch.value;
                    controller.scanning.length;
                    return Column(
                      children: [
                        for (final parcel in stop.parcels) ...[
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
                                        : AppColors.accent,
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
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: AppColors.accent,
                                        side: const BorderSide(
                                          color: AppColors.accent,
                                        ),
                                      ),
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
                  SectionTitle(text: 'pod_otp_label'.tr),
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
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.accent,
                ),
                onPressed: controller.confirm,
                icon: const Icon(Icons.task_alt),
                label: Text('pod_confirm'.tr),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
