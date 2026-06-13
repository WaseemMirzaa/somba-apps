import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../widgets/common.dart';

class ProductListController extends GetxController {
  final shop = Get.find<ShopService>();

  String? categoryId;
  String? title;
  String? query;
  bool flashOnly = false;

  final sortKey = 'sort_popular'.obs;
  final maxPrice = 1000.0.obs;
  final minRating = 0.0.obs;
  final selectedBrands = <String>{}.obs;
  final inStockOnly = false.obs;

  @override
  void onInit() {
    super.onInit();
    final args = (Get.arguments as Map?) ?? {};
    categoryId = args['categoryId'] as String?;
    title = args['title'] as String?;
    query = args['query'] as String?;
    flashOnly = args['flashOnly'] == true;
  }

  List<String> get availableBrands => shop.products
      .where((p) => categoryId == null || p.categoryId == categoryId)
      .map((p) => p.brand)
      .toSet()
      .toList()
    ..sort();

  List<Product> get results {
    var list = shop.products.where((p) {
      if (categoryId != null && p.categoryId != categoryId) return false;
      if (flashOnly && !p.isFlashDeal) return false;
      if (query != null && query!.isNotEmpty) {
        final q = query!.toLowerCase();
        final hit = p.nameEn.toLowerCase().contains(q) ||
            p.nameFr.toLowerCase().contains(q) ||
            p.brand.toLowerCase().contains(q);
        if (!hit) return false;
      }
      if (p.price > maxPrice.value) return false;
      if (p.rating < minRating.value) return false;
      if (selectedBrands.isNotEmpty && !selectedBrands.contains(p.brand)) {
        return false;
      }
      if (inStockOnly.value && p.stock == 0) return false;
      return true;
    }).toList();

    switch (sortKey.value) {
      case 'sort_price_low':
        list.sort((a, b) => a.price.compareTo(b.price));
      case 'sort_price_high':
        list.sort((a, b) => b.price.compareTo(a.price));
      case 'sort_rating':
        list.sort((a, b) => b.rating.compareTo(a.rating));
      case 'sort_newest':
        list.sort((a, b) => (b.isNew ? 1 : 0).compareTo(a.isNew ? 1 : 0));
      default:
        list.sort((a, b) => b.reviewCount.compareTo(a.reviewCount));
    }
    return list;
  }

  void clearFilters() {
    maxPrice.value = 1000;
    minRating.value = 0;
    selectedBrands.clear();
    inStockOnly.value = false;
  }
}

class ProductListScreen extends StatelessWidget {
  const ProductListScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ProductListController());
    final categoryName = controller.categoryId == null
        ? null
        : controller.shop.categories
            .firstWhereOrNull((c) => c.id == controller.categoryId)
            ?.name;
    return Scaffold(
      appBar: AppBar(
        title: Text(controller.title ??
            controller.query ??
            categoryName ??
            'all_products'.tr),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Row(
              children: [
                Obx(() => Text(
                      '${controller.results.length} ${'results'.tr}',
                      style: const TextStyle(
                          color: AppColors.muted, fontSize: 13),
                    )),
                const Spacer(),
                TextButton.icon(
                  onPressed: () => _showSort(context, controller),
                  icon: const Icon(Icons.swap_vert, size: 18),
                  label: Text('sort'.tr),
                ),
                TextButton.icon(
                  onPressed: () => _showFilters(context, controller),
                  icon: const Icon(Icons.tune, size: 18),
                  label: Text('filters'.tr),
                ),
              ],
            ),
          ),
          Expanded(
            child: Obx(() {
              final results = controller.results;
              if (results.isEmpty) {
                return EmptyState(
                  icon: Icons.search_off,
                  message: 'no_results'.tr,
                  actionLabel: 'clear_filters'.tr,
                  onAction: controller.clearFilters,
                );
              }
              return GridView.builder(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 0.62,
                ),
                itemCount: results.length,
                itemBuilder: (_, i) => ProductCard(
                    product: results[i], width: double.infinity),
              );
            }),
          ),
        ],
      ),
    );
  }

  void _showSort(BuildContext context, ProductListController controller) {
    const options = [
      'sort_popular',
      'sort_price_low',
      'sort_price_high',
      'sort_rating',
      'sort_newest',
    ];
    Get.bottomSheet(
      Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              for (final option in options)
                Obx(
                  () => RadioListTile<String>(
                    value: option,
                    groupValue: controller.sortKey.value,
                    title: Text(option.tr),
                    onChanged: (v) {
                      controller.sortKey.value = v!;
                      Get.back();
                    },
                  ),
                ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }

  void _showFilters(BuildContext context, ProductListController controller) {
    Get.bottomSheet(
      Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.all(20),
        child: SafeArea(
          child: Obx(
            () => Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('filters'.tr,
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800)),
                const SizedBox(height: 12),
                Text(
                    '${'price_range'.tr} — \$0 – \$${controller.maxPrice.value.round()}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                Slider(
                  min: 10,
                  max: 1000,
                  value: controller.maxPrice.value,
                  onChanged: (v) => controller.maxPrice.value = v,
                ),
                Text('${'min_rating'.tr} — ${controller.minRating.value}',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                Slider(
                  min: 0,
                  max: 5,
                  divisions: 10,
                  value: controller.minRating.value,
                  onChanged: (v) => controller.minRating.value = v,
                ),
                Text('brand'.tr,
                    style: const TextStyle(fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final brand in controller.availableBrands)
                      FilterChip(
                        label: Text(brand),
                        selected: controller.selectedBrands.contains(brand),
                        onSelected: (sel) {
                          if (sel) {
                            controller.selectedBrands.add(brand);
                          } else {
                            controller.selectedBrands.remove(brand);
                          }
                        },
                      ),
                  ],
                ),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text('in_stock_only'.tr),
                  value: controller.inStockOnly.value,
                  onChanged: (v) => controller.inStockOnly.value = v,
                ),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: controller.clearFilters,
                        child: Text('clear_filters'.tr),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: FilledButton(
                        onPressed: Get.back,
                        child: Text('apply_filters'.tr),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
      isScrollControlled: true,
    );
  }
}
