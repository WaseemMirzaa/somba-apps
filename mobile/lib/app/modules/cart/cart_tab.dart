import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/mock/mock_data.dart';
import '../../routes/app_routes.dart';
import '../../widgets/common.dart';
import '../auth/auth_controller.dart';
import '../shell/shell_screen.dart';

class CartTab extends StatefulWidget {
  const CartTab({super.key});

  @override
  State<CartTab> createState() => _CartTabState();
}

class _CartTabState extends State<CartTab> {
  final _coupon = TextEditingController();
  final shop = Get.find<ShopService>();
  final session = Get.find<SessionService>();

  @override
  void dispose() {
    _coupon.dispose();
    super.dispose();
  }

  void _checkout() {
    if (!session.isLoggedIn) {
      final auth = Get.find<AuthController>();
      auth.redirectAfterLogin = AppRoutes.checkout;
      Get.snackbar('login_required_title'.tr, 'login_required_body'.tr,
          snackPosition: SnackPosition.BOTTOM);
      Get.toNamed(AppRoutes.login);
      return;
    }
    Get.toNamed(AppRoutes.checkout);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text('cart'.tr)),
      body: Obx(() {
        if (shop.cart.isEmpty) {
          return EmptyState(
            icon: Icons.shopping_cart_outlined,
            message: 'cart_empty'.tr,
            actionLabel: 'start_shopping'.tr,
            onAction: () => Get.find<ShellController>().index.value = 0,
          );
        }
        final stores = shop.cartStores;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (stores.length > 1)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppColors.primaryLight,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.info_outline,
                        size: 18, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'checkout_split_note'
                            .trParams({'count': '${stores.length}'}),
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.primary),
                      ),
                    ),
                  ],
                ),
              ),
            for (final store in stores) ...[
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    const Icon(Icons.storefront,
                        size: 16, color: AppColors.muted),
                    const SizedBox(width: 6),
                    Text(
                      'sold_by_store'.trParams({'store': store.name}),
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.muted),
                    ),
                  ],
                ),
              ),
              for (final item in shop.cart
                  .where((i) => i.product.storeId == store.id))
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Row(
                      children: [
                        NetImage(
                          seed: item.product.imageSeeds.first,
                          width: 72,
                          height: 72,
                          radius: BorderRadius.circular(10),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(item.product.name,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 13)),
                              if (item.variantLabel.isNotEmpty)
                                Text(item.variantLabel,
                                    style: const TextStyle(
                                        fontSize: 11,
                                        color: AppColors.muted)),
                              const SizedBox(height: 6),
                              Row(
                                children: [
                                  Text(
                                    session.money(item.product.price),
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.primary,
                                    ),
                                  ),
                                  const Spacer(),
                                  QtyStepper(
                                    quantity: item.quantity,
                                    onDelta: (d) => shop.changeQty(item, d),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.delete_outline,
                              color: AppColors.muted, size: 20),
                          onPressed: () => shop.removeFromCart(item),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _coupon,
                    textCapitalization: TextCapitalization.characters,
                    decoration: InputDecoration(
                      hintText: 'coupon_hint'.tr,
                      prefixIcon: const Icon(Icons.confirmation_number_outlined),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                FilledButton(
                  style:
                      FilledButton.styleFrom(minimumSize: const Size(90, 52)),
                  onPressed: () {
                    final ok = shop.applyCoupon(_coupon.text);
                    Get.snackbar(
                      'cart'.tr,
                      ok
                          ? 'coupon_applied'.trParams(
                              {'code': _coupon.text.toUpperCase()})
                          : 'coupon_invalid'.tr,
                      snackPosition: SnackPosition.BOTTOM,
                    );
                  },
                  child: Text('apply_filters'.tr),
                ),
              ],
            ),
            const SizedBox(height: 16),
            _SummaryCard(),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: _checkout,
              child: Text('checkout'.tr),
            ),
            const SizedBox(height: 24),
          ],
        );
      }),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>();
    final session = Get.find<SessionService>();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Obx(() {
          final commune = shop.defaultAddress?.commune ?? 'Gombe';
          final feePerOrder = MockData.deliveryFees[commune] ?? 5;
          final fee = feePerOrder * shop.cartStores.length;
          return Column(
            children: [
              _row('subtotal'.tr, session.money(shop.cartSubtotal)),
              const SizedBox(height: 6),
              _row('delivery_fee'.tr, session.money(fee)),
              if (shop.couponDiscount > 0) ...[
                const SizedBox(height: 6),
                _row('discount'.tr, '-${session.money(shop.couponDiscount)}',
                    color: AppColors.success),
              ],
              const Divider(height: 20),
              _row(
                'total'.tr,
                session.money(
                    shop.cartSubtotal + fee - shop.couponDiscount),
                bold: true,
              ),
            ],
          );
        }),
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false, Color? color}) {
    final style = TextStyle(
      fontWeight: bold ? FontWeight.w800 : FontWeight.w500,
      fontSize: bold ? 16 : 14,
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
