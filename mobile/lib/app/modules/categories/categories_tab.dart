import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../routes/app_routes.dart';
import '../../widgets/common.dart';

class CategoriesTab extends StatelessWidget {
  const CategoriesTab({super.key});

  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>();
    return Scaffold(
      appBar: AppBar(
        title: Text('tab_categories'.tr),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () => Get.toNamed(AppRoutes.search),
          ),
        ],
      ),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: shop.categories.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, i) {
          final category = shop.categories[i];
          return Card(
            child: ExpansionTile(
              shape: const Border(),
              leading: CircleAvatar(
                backgroundColor: AppColors.primaryLight,
                child: Icon(
                  IconData(category.iconCodePoint, fontFamily: 'MaterialIcons'),
                  color: AppColors.primary,
                ),
              ),
              title: Text(category.name,
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              children: [
                ListTile(
                  dense: true,
                  title: Text('all_products'.tr),
                  trailing: const Icon(Icons.chevron_right, size: 18),
                  onTap: () => Get.toNamed(AppRoutes.products,
                      arguments: {'categoryId': category.id}),
                ),
                for (final sub in category.subcategories)
                  ListTile(
                    dense: true,
                    title: Text(sub),
                    trailing: const Icon(Icons.chevron_right, size: 18),
                    onTap: () => Get.toNamed(AppRoutes.products, arguments: {
                      'categoryId': category.id,
                      'title': sub,
                    }),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}
