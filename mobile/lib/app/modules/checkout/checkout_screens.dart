import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/mock/mock_data.dart';
import '../../data/models/models.dart';
import '../../routes/app_routes.dart';
import '../../widgets/common.dart';

class CheckoutController extends GetxController {
  final shop = Get.find<ShopService>();
  final session = Get.find<SessionService>();

  final selectedAddress = Rxn<Address>();
  final method = PaymentMethod.card.obs;
  final processing = false.obs;

  /// Demo switch: mobile-money numbers ending in 0 simulate a failure.
  bool _shouldFail(String detail) => detail.trim().endsWith('0');

  @override
  void onInit() {
    super.onInit();
    shop.initAddresses();
    selectedAddress.value = shop.defaultAddress;
  }

  double get deliveryFee {
    final commune = selectedAddress.value?.commune ?? 'Gombe';
    return (MockData.deliveryFees[commune] ?? 5) * shop.cartStores.length;
  }

  double get total =>
      shop.cartSubtotal + deliveryFee - shop.couponDiscount;

  Future<void> pay(String detail) async {
    if (method.value == PaymentMethod.wallet &&
        shop.walletBalance < total) {
      Get.snackbar('payment'.tr, 'wallet_insufficient'.tr,
          snackPosition: SnackPosition.BOTTOM);
      return;
    }
    processing.value = true;
    await Future.delayed(const Duration(seconds: 2));
    processing.value = false;

    if (method.value != PaymentMethod.wallet && _shouldFail(detail)) {
      Get.dialog(
        AlertDialog(
          icon: const Icon(Icons.error_outline,
              color: AppColors.danger, size: 40),
          title: Text('payment_failed_title'.tr),
          content: Text('payment_failed_body'.tr),
          actions: [
            TextButton(
              onPressed: () => Get.back(),
              child: Text('change_method'.tr),
            ),
            FilledButton(
              onPressed: () {
                Get.back();
                pay('1'); // retry always succeeds in the demo
              },
              child: Text('retry_payment'.tr),
            ),
          ],
        ),
      );
      return;
    }

    final orders = shop.placeOrder(selectedAddress.value!, method.value);
    Get.offNamedUntil(AppRoutes.orderConfirmed, (route) => route.isFirst,
        arguments: orders);
  }
}

class CheckoutScreen extends StatelessWidget {
  const CheckoutScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(CheckoutController());
    final session = controller.session;
    final shop = controller.shop;

    return Scaffold(
      appBar: AppBar(title: Text('checkout'.tr)),
      body: Obx(() {
        final address = controller.selectedAddress.value;
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('delivery_address'.tr,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            Card(
              child: address == null
                  ? ListTile(
                      leading: const Icon(Icons.add_location_alt_outlined),
                      title: Text('add_address'.tr),
                      onTap: () async {
                        final picked = await Get.toNamed(
                            AppRoutes.addresses,
                            arguments: {'select': true});
                        if (picked is Address) {
                          controller.selectedAddress.value = picked;
                        }
                      },
                    )
                  : ListTile(
                      leading: const Icon(Icons.location_on,
                          color: AppColors.brandRed),
                      title: Text(address.label,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700)),
                      subtitle: Text(
                          '${address.detail}\n${address.commune}, ${address.city}'),
                      isThreeLine: true,
                      trailing: TextButton(
                        onPressed: () async {
                          final picked = await Get.toNamed(
                              AppRoutes.addresses,
                              arguments: {'select': true});
                          if (picked is Address) {
                            controller.selectedAddress.value = picked;
                          }
                        },
                        child: Text('change'.tr),
                      ),
                    ),
            ),
            const SizedBox(height: 20),
            Text('order_review'.tr,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            if (shop.cartStores.length > 1)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  'checkout_split_note'
                      .trParams({'count': '${shop.cartStores.length}'}),
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.muted),
                ),
              ),
            for (final store in shop.cartStores)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(store.name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13)),
                      const Divider(height: 16),
                      for (final item in shop.cart
                          .where((i) => i.product.storeId == store.id))
                        Padding(
                          padding: const EdgeInsets.only(bottom: 6),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '${item.quantity} × ${item.product.name}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(fontSize: 13),
                                ),
                              ),
                              Text(session.money(item.total),
                                  style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w600)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _row('subtotal'.tr, session.money(shop.cartSubtotal)),
                    const SizedBox(height: 6),
                    _row('delivery_fee'.tr,
                        session.money(controller.deliveryFee)),
                    if (shop.couponDiscount > 0) ...[
                      const SizedBox(height: 6),
                      _row('discount'.tr,
                          '-${session.money(shop.couponDiscount)}',
                          color: AppColors.success),
                    ],
                    const Divider(height: 20),
                    _row('total'.tr, session.money(controller.total),
                        bold: true),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: address == null
                  ? null
                  : () => Get.toNamed(AppRoutes.payment),
              child: Text('place_order'.tr),
            ),
            const SizedBox(height: 24),
          ],
        );
      }),
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

class PaymentScreen extends StatefulWidget {
  const PaymentScreen({super.key});

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final _detail = TextEditingController();

  @override
  void dispose() {
    _detail.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<CheckoutController>();
    final session = controller.session;

    const methods = [
      (PaymentMethod.card, Icons.credit_card),
      (PaymentMethod.airtelMoney, Icons.phone_android),
      (PaymentMethod.orangeMoney, Icons.phone_android),
      (PaymentMethod.mpesa, Icons.phone_android),
      (PaymentMethod.wallet, Icons.account_balance_wallet),
    ];

    return Scaffold(
      appBar: AppBar(title: Text('payment'.tr)),
      body: Obx(
        () => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('payment_method'.tr,
                style: const TextStyle(
                    fontSize: 16, fontWeight: FontWeight.w800)),
            const SizedBox(height: 8),
            for (final (method, icon) in methods)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: RadioListTile<PaymentMethod>(
                  value: method,
                  groupValue: controller.method.value,
                  onChanged: (v) => controller.method.value = v!,
                  secondary: Icon(icon, color: AppColors.primary),
                  title: Text(method.trKey.tr,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, fontSize: 14)),
                  subtitle: method == PaymentMethod.wallet
                      ? Text(
                          '${'wallet_balance_label'.tr}: ${session.money(controller.shop.walletBalance)}',
                          style: const TextStyle(fontSize: 12))
                      : null,
                ),
              ),
            const SizedBox(height: 12),
            if (controller.method.value == PaymentMethod.card) ...[
              TextField(
                controller: _detail,
                keyboardType: TextInputType.number,
                decoration: InputDecoration(
                  labelText: 'card_number'.tr,
                  hintText: '4242 4242 4242 4242',
                  prefixIcon: const Icon(Icons.credit_card),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      keyboardType: TextInputType.datetime,
                      decoration:
                          InputDecoration(labelText: 'card_expiry'.tr),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      keyboardType: TextInputType.number,
                      obscureText: true,
                      decoration: InputDecoration(labelText: 'card_cvc'.tr),
                    ),
                  ),
                ],
              ),
            ] else if (controller.method.value != PaymentMethod.wallet) ...[
              TextField(
                controller: _detail,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: 'mobile_money_number'.tr,
                  hintText: '+243 991 234 567',
                  prefixIcon: const Icon(Icons.phone_android),
                ),
              ),
              const SizedBox(height: 8),
              Text('mobile_money_hint'.tr,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.muted)),
            ],
            const SizedBox(height: 12),
            Text('payment_demo_note'.tr,
                style:
                    const TextStyle(fontSize: 12, color: AppColors.muted)),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: controller.processing.value
                  ? null
                  : () => controller.pay(_detail.text),
              child: controller.processing.value
                  ? Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const SizedBox(
                          width: 20,
                          height: 20,
                          child:
                              CircularProgressIndicator(strokeWidth: 2.5),
                        ),
                        const SizedBox(width: 12),
                        Text('payment_processing'.tr),
                      ],
                    )
                  : Text('pay_amount'
                      .trParams({'amount': session.money(controller.total)})),
            ),
          ],
        ),
      ),
    );
  }
}

class OrderConfirmedScreen extends StatelessWidget {
  const OrderConfirmedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final orders = (Get.arguments as List).cast<Order>();
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              const CircleAvatar(
                radius: 44,
                backgroundColor: Color(0xFFD1FAE5),
                child:
                    Icon(Icons.check, size: 48, color: AppColors.success),
              ),
              const SizedBox(height: 24),
              Text('order_confirmed'.tr,
                  style: const TextStyle(
                      fontSize: 24, fontWeight: FontWeight.w900)),
              const SizedBox(height: 10),
              Text('order_confirmed_body'.tr,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: AppColors.muted, height: 1.5)),
              const SizedBox(height: 24),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('order_numbers'.tr,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13)),
                      const SizedBox(height: 8),
                      for (final order in orders)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Row(
                            children: [
                              const Icon(Icons.receipt_long,
                                  size: 16, color: AppColors.primary),
                              const SizedBox(width: 8),
                              Text(order.id,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600)),
                              const Spacer(),
                              Text(order.store.name,
                                  style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.muted)),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const Spacer(),
              FilledButton(
                onPressed: () => Get.toNamed(AppRoutes.orderTracking,
                    arguments: orders.first),
                child: Text('track_order'.tr),
              ),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: () => Get.offAllNamed(AppRoutes.shell),
                child: Text('continue_shopping'.tr),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
