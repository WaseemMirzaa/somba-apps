import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../routes/app_routes.dart';

/// CF-19 — Profile, settings, language & currency, links to every
/// account-level flow.
class AccountTab extends StatelessWidget {
  const AccountTab({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionService>();
    final shop = Get.find<ShopService>();

    return Scaffold(
      appBar: AppBar(title: Text('account'.tr)),
      body: Obx(
        () => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: ListTile(
                leading: CircleAvatar(
                  radius: 26,
                  backgroundColor: AppColors.primaryLight,
                  child: Text(
                    session.isLoggedIn
                        ? session.user.value!.name
                            .substring(0, 1)
                            .toUpperCase()
                        : '?',
                    style: const TextStyle(
                        color: AppColors.primary,
                        fontWeight: FontWeight.w800,
                        fontSize: 20),
                  ),
                ),
                title: Text(
                  session.isLoggedIn
                      ? session.user.value!.name
                      : 'guest'.tr,
                  style: const TextStyle(fontWeight: FontWeight.w800),
                ),
                subtitle: Text(session.isLoggedIn
                    ? '${session.user.value!.phone}\n${session.user.value!.city}'
                    : 'sign_in_or_register'.tr),
                isThreeLine: session.isLoggedIn,
                trailing: session.isLoggedIn
                    ? IconButton(
                        icon: const Icon(Icons.edit_outlined, size: 20),
                        onPressed: () => _editProfile(session),
                      )
                    : FilledButton(
                        style: FilledButton.styleFrom(
                            minimumSize: const Size(0, 40),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16)),
                        onPressed: () => Get.toNamed(AppRoutes.login),
                        child: Text('login'.tr),
                      ),
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Column(
                children: [
                  _tile(Icons.account_balance_wallet_outlined, 'wallet'.tr,
                      () => Get.toNamed(AppRoutes.wallet)),
                  _tile(Icons.favorite_border, 'wishlist'.tr,
                      () => Get.toNamed(AppRoutes.wishlist)),
                  _tile(Icons.location_on_outlined, 'addresses'.tr,
                      () => Get.toNamed(AppRoutes.addresses)),
                  _tile(Icons.notifications_outlined, 'notifications'.tr,
                      () => Get.toNamed(AppRoutes.notifications)),
                  _tile(Icons.bolt_outlined, 'deals_hub'.tr,
                      () => Get.toNamed(AppRoutes.deals)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Column(
                children: [
                  ListTile(
                    leading: const Icon(Icons.language,
                        color: AppColors.primary),
                    title: Text('language'.tr),
                    trailing: SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'fr', label: Text('FR')),
                        ButtonSegment(value: 'en', label: Text('EN')),
                      ],
                      selected: {session.languageCode.value},
                      onSelectionChanged: (sel) =>
                          session.setLanguage(sel.first),
                      showSelectedIcon: false,
                    ),
                  ),
                  const Divider(height: 1, indent: 16, endIndent: 16),
                  ListTile(
                    leading: const Icon(Icons.payments_outlined,
                        color: AppColors.primary),
                    title: Text('currency'.tr),
                    trailing: SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'CDF', label: Text('CDF')),
                        ButtonSegment(value: 'USD', label: Text('USD')),
                      ],
                      selected: {session.currency.value},
                      onSelectionChanged: (sel) =>
                          session.currency.value = sel.first,
                      showSelectedIcon: false,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            Card(
              child: Column(
                children: [
                  ExpansionTile(
                    shape: const Border(),
                    leading: const Icon(Icons.notifications_active_outlined,
                        color: AppColors.primary),
                    title: Text('notif_prefs'.tr),
                    children: [
                      _prefSwitch('notif_orders'.tr, shop, 0),
                      _prefSwitch('notif_promos'.tr, shop, 1),
                      _prefSwitch('notif_system'.tr, shop, 2),
                    ],
                  ),
                  const Divider(height: 1, indent: 16, endIndent: 16),
                  _tile(Icons.help_outline, 'help_support'.tr,
                      () => Get.toNamed(AppRoutes.help)),
                ],
              ),
            ),
            const SizedBox(height: 16),
            if (session.isLoggedIn)
              OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.danger,
                  side: const BorderSide(color: AppColors.danger),
                ),
                onPressed: () => Get.dialog(
                  AlertDialog(
                    title: Text('logout'.tr),
                    content: Text('logout_confirm'.tr),
                    actions: [
                      TextButton(
                          onPressed: Get.back, child: Text('cancel'.tr)),
                      FilledButton(
                        onPressed: () {
                          session.logout();
                          Get.back();
                        },
                        child: Text('logout'.tr),
                      ),
                    ],
                  ),
                ),
                icon: const Icon(Icons.logout, size: 18),
                label: Text('logout'.tr),
              ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  static final _prefs = [true.obs, true.obs, false.obs];

  Widget _prefSwitch(String label, ShopService shop, int index) {
    return Obx(
      () => SwitchListTile(
        dense: true,
        title: Text(label, style: const TextStyle(fontSize: 13)),
        value: _prefs[index].value,
        onChanged: (v) => _prefs[index].value = v,
      ),
    );
  }

  Widget _tile(IconData icon, String label, VoidCallback onTap) {
    return ListTile(
      leading: Icon(icon, color: AppColors.primary),
      title: Text(label),
      trailing: const Icon(Icons.chevron_right, size: 18),
      onTap: onTap,
    );
  }

  void _editProfile(SessionService session) {
    final name = TextEditingController(text: session.user.value!.name);
    final email = TextEditingController(text: session.user.value!.email);
    Get.dialog(
      AlertDialog(
        title: Text('edit_profile'.tr),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: name,
              decoration: InputDecoration(labelText: 'full_name'.tr),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: email,
              decoration: InputDecoration(labelText: 'email_optional'.tr),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: Get.back, child: Text('cancel'.tr)),
          FilledButton(
            onPressed: () {
              session.updateProfile(
                  name: name.text.trim(), email: email.text.trim());
              Get.back();
              Get.snackbar('profile'.tr, 'profile_saved'.tr,
                  snackPosition: SnackPosition.BOTTOM);
            },
            child: Text('save'.tr),
          ),
        ],
      ),
    );
  }
}
