import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../core/widgets/common_widgets.dart';
import 'profile_controller.dart';

class ProfileTab extends GetView<ProfileController> {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'profile_title'.tr,
            style: const TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
          ),
          const SizedBox(height: 14),
          _RiderCard(controller: controller),
          const SizedBox(height: 16),
          SectionTitle(text: 'profile_language'.tr),
          _LanguageCard(controller: controller),
          const SizedBox(height: 16),
          SectionTitle(text: 'profile_support'.tr),
          Card(
            child: ListTile(
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
              leading: const LeadingIcon(
                icon: Icons.support_agent_outlined,
                color: AppColors.primary,
              ),
              title: Text(
                'profile_support_tile'.tr,
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14.5,
                ),
              ),
              subtitle: Text(
                'profile_support_subtitle'.tr,
                style: const TextStyle(
                  fontSize: 12.5,
                  color: AppColors.textMuted,
                ),
              ),
              trailing: const Icon(Icons.chevron_right,
                  color: AppColors.textMuted),
              onTap: () => _showSupportSheet(context),
            ),
          ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.danger,
              side: const BorderSide(color: AppColors.danger),
              minimumSize: const Size.fromHeight(52),
            ),
            onPressed: () => _confirmLogout(context),
            icon: const Icon(Icons.logout),
            label: Text('profile_logout'.tr),
          ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }

  void _showSupportSheet(BuildContext context) {
    Get.bottomSheet(
      Container(
        padding: const EdgeInsets.all(24),
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'support_title'.tr,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w800,
                color: AppColors.text,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'support_body'.tr,
              style:
                  const TextStyle(fontSize: 13.5, color: AppColors.textMuted),
            ),
            const SizedBox(height: 20),
            InfoRow(
              icon: Icons.phone_outlined,
              label: 'support_phone'.tr,
              value: '+243 990 000 100',
            ),
            InfoRow(
              icon: Icons.mail_outline,
              label: 'support_email'.tr,
              value: 'riders@sombateka.cd',
            ),
            InfoRow(
              icon: Icons.schedule_outlined,
              label: 'support_hours'.tr,
              value: 'support_hours_value'.tr,
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: Get.back,
                child: Text('common_close'.tr),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _confirmLogout(BuildContext context) {
    Get.dialog(
      AlertDialog(
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('logout_confirm_title'.tr),
        content: Text('logout_confirm_body'.tr),
        actions: [
          TextButton(
            onPressed: Get.back,
            child: Text('common_cancel'.tr),
          ),
          TextButton(
            style: TextButton.styleFrom(foregroundColor: AppColors.danger),
            onPressed: () {
              Get.back();
              controller.logout();
            },
            child: Text('profile_logout'.tr),
          ),
        ],
      ),
    );
  }
}

class _RiderCard extends StatelessWidget {
  final ProfileController controller;

  const _RiderCard({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Obx(() {
      final rider = controller.session.rider.value;
      if (rider == null) return const SizedBox.shrink();
      final initials = rider.name
          .split(' ')
          .where((p) => p.isNotEmpty)
          .map((p) => p[0])
          .take(2)
          .join();
      final kycOk = controller.session.kycApproved.value ||
          rider.kycStatus == 'approved';
      return Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundColor: AppColors.primary,
                    child: Text(
                      initials,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          rider.name,
                          style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: AppColors.text,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          rider.phone,
                          style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  AppChip(
                    label: kycOk ? 'kyc_approved'.tr : 'kyc_pending'.tr,
                    color: kycOk ? AppColors.success : AppColors.warning,
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Divider(),
              const SizedBox(height: 12),
              Row(
                children: [
                  _Fact(
                    icon: Icons.location_city_outlined,
                    label: 'profile_city'.tr,
                    value: rider.city,
                  ),
                  _Fact(
                    icon: Icons.two_wheeler_outlined,
                    label: 'profile_vehicle'.tr,
                    value: 'vehicle_motorcycle'.tr,
                  ),
                  _Fact(
                    icon: Icons.star,
                    label: 'profile_rating'.tr,
                    value: rider.rating.toStringAsFixed(1),
                    iconColor: AppColors.warning,
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    });
  }
}

class _Fact extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color iconColor;

  const _Fact({
    required this.icon,
    required this.label,
    required this.value,
    this.iconColor = AppColors.primary,
  });

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        children: [
          Icon(icon, color: iconColor, size: 22),
          const SizedBox(height: 6),
          Text(
            value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: AppColors.text,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(fontSize: 11.5, color: AppColors.textMuted),
          ),
        ],
      ),
    );
  }
}

class _LanguageCard extends StatelessWidget {
  final ProfileController controller;

  const _LanguageCard({required this.controller});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Obx(() {
          final code = controller.session.locale.value.languageCode;
          return SegmentedButton<String>(
            style: SegmentedButton.styleFrom(
              selectedBackgroundColor:
                  AppColors.primary.withValues(alpha: 0.12),
              selectedForegroundColor: AppColors.primary,
            ),
            segments: [
              ButtonSegment(
                value: 'fr',
                label: Text('language_fr'.tr),
                icon: const Icon(Icons.language),
              ),
              ButtonSegment(
                value: 'en',
                label: Text('language_en'.tr),
                icon: const Icon(Icons.language),
              ),
            ],
            selected: {code},
            onSelectionChanged: (selection) =>
                controller.setLanguage(selection.first),
          );
        }),
      ),
    );
  }
}
