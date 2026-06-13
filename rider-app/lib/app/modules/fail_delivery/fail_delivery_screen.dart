import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import 'fail_delivery_controller.dart';

class FailDeliveryScreen extends GetView<FailDeliveryController> {
  const FailDeliveryScreen({super.key});

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
      appBar: AppBar(title: Text('fail_title'.tr)),
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
                        color: AppColors.danger,
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
                  const SizedBox(height: 18),
                  SectionTitle(text: 'fail_reason'.tr),
                  Obx(
                    () => DropdownButtonFormField<String>(
                      value: controller.reasonKey.value,
                      decoration: InputDecoration(
                        prefixIcon: const Icon(Icons.error_outline),
                        labelText: 'fail_reason'.tr,
                      ),
                      items: FailDeliveryController.reasonKeys
                          .map(
                            (k) =>
                                DropdownMenuItem(value: k, child: Text(k.tr)),
                          )
                          .toList(),
                      onChanged: controller.setReason,
                    ),
                  ),
                  const SizedBox(height: 16),
                  SectionTitle(text: 'fail_note'.tr),
                  TextField(
                    controller: controller.noteCtrl,
                    maxLines: 3,
                    decoration: InputDecoration(
                      hintText: 'fail_note_hint'.tr,
                    ),
                  ),
                  const SizedBox(height: 16),
                  SectionTitle(text: 'fail_photo'.tr),
                  Obx(() {
                    final attached = controller.photoAttached.value;
                    final color =
                        attached ? AppColors.success : AppColors.primary;
                    return Card(
                      child: InkWell(
                        onTap: attached ? null : controller.attachPhoto,
                        borderRadius: BorderRadius.circular(16),
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Row(
                            children: [
                              Icon(Icons.photo_camera_outlined, color: color),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  attached
                                      ? 'fail_photo_attached'.tr
                                      : 'fail_photo_tap'.tr,
                                  style: TextStyle(
                                    fontSize: 13.5,
                                    fontWeight: FontWeight.w600,
                                    color: color,
                                  ),
                                ),
                              ),
                              if (attached)
                                const Icon(
                                  Icons.check_circle,
                                  color: AppColors.success,
                                  size: 18,
                                ),
                            ],
                          ),
                        ),
                      ),
                    );
                  }),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.danger,
                ),
                onPressed: controller.confirm,
                icon: const Icon(Icons.report_outlined),
                label: Text('fail_confirm'.tr),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
