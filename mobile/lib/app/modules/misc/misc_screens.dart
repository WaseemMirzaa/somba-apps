import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/mock/mock_data.dart';
import '../../data/models/models.dart';
import '../../widgets/common.dart';

/// CF-28 — Wishlist.
class WishlistScreen extends StatelessWidget {
  const WishlistScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>();
    final session = Get.find<SessionService>();
    return Scaffold(
      appBar: AppBar(title: Text('wishlist'.tr)),
      body: Obx(() {
        if (shop.wishlist.isEmpty) {
          return EmptyState(
              icon: Icons.favorite_border, message: 'wishlist_empty'.tr);
        }
        final products =
            shop.wishlist.map(MockData.productById).toList();
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: products.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) {
            final product = products[i];
            return Card(
              child: Padding(
                padding: const EdgeInsets.all(10),
                child: Row(
                  children: [
                    NetImage(
                      seed: product.imageSeeds.first,
                      width: 64,
                      height: 64,
                      radius: BorderRadius.circular(10),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(product.name,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13)),
                          const SizedBox(height: 4),
                          Text(session.money(product.price),
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.primary)),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              OutlinedButton(
                                style: OutlinedButton.styleFrom(
                                  minimumSize: const Size(0, 34),
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 12),
                                ),
                                onPressed: product.stock == 0
                                    ? null
                                    : () {
                                        shop.addToCart(product);
                                        shop.toggleWishlist(product);
                                        Get.snackbar('cart'.tr,
                                            'added_to_cart'.tr,
                                            snackPosition:
                                                SnackPosition.BOTTOM,
                                            duration: const Duration(
                                                seconds: 1));
                                      },
                                child: Text('move_to_cart'.tr,
                                    style:
                                        const TextStyle(fontSize: 12)),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.close,
                          size: 18, color: AppColors.muted),
                      onPressed: () => shop.toggleWishlist(product),
                    ),
                  ],
                ),
              ),
            );
          },
        );
      }),
    );
  }
}

/// CF-32 — Somba Wallet: store credit, refunds, mock top-up.
class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>();
    final session = Get.find<SessionService>();

    IconData iconFor(WalletEntryType type) {
      switch (type) {
        case WalletEntryType.refund:
          return Icons.assignment_return_outlined;
        case WalletEntryType.cashback:
          return Icons.card_giftcard;
        case WalletEntryType.topUp:
          return Icons.add_circle_outline;
        case WalletEntryType.purchase:
          return Icons.shopping_bag_outlined;
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text('wallet'.tr)),
      body: Obx(
        () => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.primaryDark, AppColors.primary],
                ),
                borderRadius: BorderRadius.circular(18),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('wallet_balance'.tr,
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.8),
                          fontSize: 13)),
                  const SizedBox(height: 6),
                  Text(session.money(shop.walletBalance),
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 30,
                          fontWeight: FontWeight.w900)),
                  const SizedBox(height: 14),
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white54),
                      minimumSize: const Size(0, 42),
                    ),
                    onPressed: () => _topUpDialog(shop),
                    icon: const Icon(Icons.add, size: 18),
                    label: Text('wallet_topup'.tr),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Text('wallet_history'.tr,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            if (shop.walletEntries.isEmpty)
              EmptyState(
                  icon: Icons.receipt_long_outlined,
                  message: 'wallet_empty'.tr)
            else
              for (final entry in shop.walletEntries)
                Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: entry.amount >= 0
                          ? const Color(0xFFD1FAE5)
                          : AppColors.brandRedLight,
                      child: Icon(
                        iconFor(entry.type),
                        size: 20,
                        color: entry.amount >= 0
                            ? AppColors.success
                            : AppColors.danger,
                      ),
                    ),
                    title: Text('wtype_${entry.type.name}'.tr,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    subtitle: Text(
                        '${entry.description}\n${formatDate(entry.at)}',
                        style: const TextStyle(fontSize: 12)),
                    isThreeLine: true,
                    trailing: Text(
                      '${entry.amount >= 0 ? '+' : '−'}${session.money(entry.amount.abs())}',
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        color: entry.amount >= 0
                            ? AppColors.success
                            : AppColors.danger,
                      ),
                    ),
                  ),
                ),
          ],
        ),
      ),
    );
  }

  void _topUpDialog(ShopService shop) {
    final amount = TextEditingController(text: '20');
    Get.dialog(
      AlertDialog(
        title: Text('wallet_topup'.tr),
        content: TextField(
          controller: amount,
          keyboardType: TextInputType.number,
          decoration: InputDecoration(labelText: 'wallet_topup_hint'.tr),
        ),
        actions: [
          TextButton(onPressed: Get.back, child: Text('cancel'.tr)),
          FilledButton(
            onPressed: () {
              final value = double.tryParse(amount.text) ?? 0;
              if (value > 0) {
                shop.creditWallet(value, 'Top-up via Mobile Money',
                    'Recharge via Mobile Money', WalletEntryType.topUp);
              }
              Get.back();
              Get.snackbar('wallet'.tr, 'wallet_topup_done'.tr,
                  snackPosition: SnackPosition.BOTTOM);
            },
            child: Text('ok'.tr),
          ),
        ],
      ),
    );
  }
}

/// CF-36 — Flash deals hub with countdown.
class DealsScreen extends StatefulWidget {
  const DealsScreen({super.key});

  @override
  State<DealsScreen> createState() => _DealsScreenState();
}

class _DealsScreenState extends State<DealsScreen> {
  late final DateTime _endsAt =
      DateTime.now().add(const Duration(hours: 6, minutes: 24));
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(
        const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>();
    final deals = shop.products.where((p) => p.isFlashDeal).toList();
    final left = _endsAt.difference(DateTime.now());
    String pad(int v) => v.toString().padLeft(2, '0');
    final countdown =
        '${pad(left.inHours)}:${pad(left.inMinutes % 60)}:${pad(left.inSeconds % 60)}';

    return Scaffold(
      appBar: AppBar(title: Text('deals_hub'.tr)),
      body: Column(
        children: [
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppColors.brandRed, Color(0xFFB3101D)],
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                const Icon(Icons.bolt, color: Colors.white, size: 30),
                const SizedBox(width: 10),
                Expanded(
                  child: Text('flash_deals'.tr,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 18,
                          fontWeight: FontWeight.w900)),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('ends_in'.tr,
                        style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.8),
                            fontSize: 11)),
                    Text(countdown,
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w900,
                            fontSize: 18,
                            fontFeatures: [FontFeature.tabularFigures()])),
                  ],
                ),
              ],
            ),
          ),
          Expanded(
            child: GridView.builder(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.62,
              ),
              itemCount: deals.length,
              itemBuilder: (_, i) =>
                  ProductCard(product: deals[i], width: double.infinity),
            ),
          ),
        ],
      ),
    );
  }
}

/// CF-29 — Notification centre.
class NotificationsScreen extends StatelessWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>();

    IconData iconFor(NotificationType type) {
      switch (type) {
        case NotificationType.order:
          return Icons.local_shipping_outlined;
        case NotificationType.promo:
          return Icons.local_offer_outlined;
        case NotificationType.system:
          return Icons.campaign_outlined;
      }
    }

    return Scaffold(
      appBar: AppBar(
        title: Text('notifications'.tr),
        actions: [
          TextButton(
            onPressed: shop.markAllRead,
            child: Text('mark_all_read'.tr),
          ),
        ],
      ),
      body: Obx(() {
        if (shop.notifications.isEmpty) {
          return EmptyState(
              icon: Icons.notifications_none,
              message: 'notifications_empty'.tr);
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: shop.notifications.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final notification = shop.notifications[i];
            return Card(
              color: notification.read
                  ? AppColors.surface
                  : AppColors.primaryLight,
              child: ListTile(
                leading: CircleAvatar(
                  backgroundColor: AppColors.surface,
                  child: Icon(iconFor(notification.type),
                      color: AppColors.primary, size: 20),
                ),
                title: Text(notification.title,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 14)),
                subtitle: Text(notification.body,
                    style: const TextStyle(fontSize: 12)),
                trailing: Text(formatDate(notification.at),
                    style: const TextStyle(
                        fontSize: 10, color: AppColors.muted)),
                onTap: () {
                  notification.read = true;
                  shop.notifications.refresh();
                },
              ),
            );
          },
        );
      }),
    );
  }
}

/// CF-31 — Help, FAQ, legal pages, support contact and account deletion.
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionService>();
    return Scaffold(
      appBar: AppBar(title: Text('help_support'.tr)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('faq'.tr,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          for (final i in [1, 2, 3])
            Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: ExpansionTile(
                shape: const Border(),
                title: Text('faq_q$i'.tr,
                    style: const TextStyle(
                        fontWeight: FontWeight.w600, fontSize: 14)),
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    child: Text('faq_a$i'.tr,
                        style: const TextStyle(
                            fontSize: 13,
                            color: AppColors.muted,
                            height: 1.4)),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 12),
          Text('contact_us'.tr,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                children: [
                  TextField(
                    maxLines: 3,
                    decoration:
                        InputDecoration(hintText: 'your_message'.tr),
                  ),
                  const SizedBox(height: 10),
                  FilledButton(
                    onPressed: () => Get.snackbar(
                        'contact_us'.tr, 'support_message_sent'.tr,
                        snackPosition: SnackPosition.BOTTOM),
                    child: Text('submit'.tr),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('legal'.tr,
              style:
                  const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                for (final page in ['terms', 'privacy'])
                  ListTile(
                    leading: const Icon(Icons.description_outlined),
                    title: Text(page.tr),
                    trailing: const Icon(Icons.chevron_right, size: 18),
                    onTap: () => Get.dialog(
                      AlertDialog(
                        title: Text(page.tr),
                        content: Text('legal_placeholder'.tr),
                        actions: [
                          TextButton(
                              onPressed: Get.back, child: Text('ok'.tr)),
                        ],
                      ),
                    ),
                  ),
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
                  title: Text('delete_account'.tr),
                  content: Text('delete_account_body'.tr),
                  actions: [
                    TextButton(
                        onPressed: Get.back, child: Text('cancel'.tr)),
                    FilledButton(
                      style: FilledButton.styleFrom(
                          backgroundColor: AppColors.danger),
                      onPressed: () {
                        session.logout();
                        Get.back();
                        Get.back();
                      },
                      child: Text('delete'.tr),
                    ),
                  ],
                ),
              ),
              icon: const Icon(Icons.delete_outline, size: 18),
              label: Text('delete_account'.tr),
            ),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}
