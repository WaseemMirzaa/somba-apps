import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import 'kyc_controller.dart';

class KycScreen extends GetView<KycController> {
  const KycScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('kyc_title'.tr)),
      body: SafeArea(
        child: Obx(
          () => controller.submitted.value
              ? _PendingView(onContinue: controller.continueToApp)
              : _FormView(controller: controller),
        ),
      ),
    );
  }
}

class _FormView extends StatelessWidget {
  final KycController controller;

  const _FormView({required this.controller});

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'kyc_subtitle'.tr,
            style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: controller.idCtrl,
            decoration: InputDecoration(
              labelText: 'kyc_id_number'.tr,
              prefixIcon: const Icon(Icons.badge_outlined),
            ),
          ),
          const SizedBox(height: 16),
          Obx(
            () => _AttachTile(
              icon: Icons.description_outlined,
              label: 'kyc_id_doc'.tr,
              attached: controller.idDocAttached.value,
              onTap: controller.attachIdDoc,
            ),
          ),
          const SizedBox(height: 12),
          Obx(
            () => _AttachTile(
              icon: Icons.photo_camera_outlined,
              label: 'kyc_photo'.tr,
              attached: controller.photoAttached.value,
              onTap: controller.attachPhoto,
            ),
          ),
          const SizedBox(height: 16),
          Obx(
            () => DropdownButtonFormField<String>(
              value: controller.vehicleKey.value,
              decoration: InputDecoration(
                labelText: 'kyc_vehicle_type'.tr,
                prefixIcon: const Icon(Icons.two_wheeler_outlined),
              ),
              items: KycController.vehicleKeys
                  .map(
                    (k) => DropdownMenuItem(value: k, child: Text(k.tr)),
                  )
                  .toList(),
              onChanged: controller.setVehicle,
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: controller.plateCtrl,
            decoration: InputDecoration(
              labelText: 'kyc_plate'.tr,
              prefixIcon: const Icon(Icons.pin_outlined),
            ),
          ),
          Obx(
            () => controller.errorKey.value.isEmpty
                ? const SizedBox(height: 28)
                : Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
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
          FilledButton(
            onPressed: controller.submit,
            child: Text('kyc_submit'.tr),
          ),
        ],
      ),
    );
  }
}

class _AttachTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool attached;
  final VoidCallback onTap;

  const _AttachTile({
    required this.icon,
    required this.label,
    required this.attached,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final color = attached ? AppColors.success : AppColors.primary;
    return Card(
      child: InkWell(
        onTap: attached ? null : onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              Icon(icon, color: color),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: AppColors.text,
                  ),
                ),
              ),
              Text(
                attached ? 'kyc_attached'.tr : 'kyc_tap_attach'.tr,
                style: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w700,
                  color: color,
                ),
              ),
              if (attached) ...[
                const SizedBox(width: 6),
                const Icon(Icons.check_circle,
                    color: AppColors.success, size: 18),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PendingView extends StatelessWidget {
  final VoidCallback onContinue;

  const _PendingView({required this.onContinue});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            width: 88,
            height: 88,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.warning.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.hourglass_top_outlined,
              color: AppColors.warning,
              size: 44,
            ),
          ),
          const SizedBox(height: 24),
          Text(
            'kyc_pending_title'.tr,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
          ),
          const SizedBox(height: 10),
          Text(
            'kyc_pending_body'.tr,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 14, color: AppColors.textMuted),
          ),
          const SizedBox(height: 40),
          FilledButton(
            onPressed: onContinue,
            child: Text('kyc_continue'.tr),
          ),
        ],
      ),
    );
  }
}
