import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/shop_service.dart';
import '../account/account_tab.dart';
import '../cart/cart_tab.dart';
import '../categories/categories_tab.dart';
import '../home/home_tab.dart';
import '../orders/orders_screens.dart';

class ShellController extends GetxController {
  final index = 0.obs;
}

class ShellScreen extends StatelessWidget {
  const ShellScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ShellController());
    final shop = Get.find<ShopService>();
    const tabs = [
      HomeTab(),
      CategoriesTab(),
      CartTab(),
      OrdersTab(),
      AccountTab(),
    ];
    return Obx(
      () => Scaffold(
        body: IndexedStack(index: controller.index.value, children: tabs),
        bottomNavigationBar: BottomNavigationBar(
          currentIndex: controller.index.value,
          onTap: (i) => controller.index.value = i,
          items: [
            BottomNavigationBarItem(
              icon: const Icon(Icons.home_outlined),
              activeIcon: const Icon(Icons.home),
              label: 'tab_home'.tr,
            ),
            BottomNavigationBarItem(
              icon: const Icon(Icons.grid_view_outlined),
              activeIcon: const Icon(Icons.grid_view),
              label: 'tab_categories'.tr,
            ),
            BottomNavigationBarItem(
              icon: Badge(
                isLabelVisible: shop.cartCount > 0,
                label: Text('${shop.cartCount}'),
                child: const Icon(Icons.shopping_cart_outlined),
              ),
              activeIcon: Badge(
                isLabelVisible: shop.cartCount > 0,
                label: Text('${shop.cartCount}'),
                child: const Icon(Icons.shopping_cart),
              ),
              label: 'tab_cart'.tr,
            ),
            BottomNavigationBarItem(
              icon: const Icon(Icons.receipt_long_outlined),
              activeIcon: const Icon(Icons.receipt_long),
              label: 'tab_orders'.tr,
            ),
            BottomNavigationBarItem(
              icon: const Icon(Icons.person_outline),
              activeIcon: const Icon(Icons.person),
              label: 'tab_account'.tr,
            ),
          ],
        ),
      ),
    );
  }
}
