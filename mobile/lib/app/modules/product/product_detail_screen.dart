import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/mock/mock_data.dart';
import '../../data/models/models.dart';
import '../../routes/app_routes.dart';
import '../../widgets/common.dart';

class ProductDetailController extends GetxController {
  late final Product product;
  final shop = Get.find<ShopService>();
  final imageIndex = 0.obs;
  final selectedVariants = <String, String>{}.obs;

  @override
  void onInit() {
    super.onInit();
    product = Get.arguments as Product;
    shop.markViewed(product);
  }

  bool get variantsComplete =>
      product.variants.every((v) => selectedVariants[tx(v.nameEn, v.nameFr)] != null);

  String? get missingVariant {
    for (final v in product.variants) {
      if (selectedVariants[tx(v.nameEn, v.nameFr)] == null) {
        return tx(v.nameEn, v.nameFr);
      }
    }
    return null;
  }

  bool addToCart() {
    final missing = missingVariant;
    if (missing != null) {
      Get.snackbar('cart'.tr, 'select_variant'.trParams({'variant': missing}),
          snackPosition: SnackPosition.BOTTOM);
      return false;
    }
    shop.addToCart(product, variants: Map.of(selectedVariants));
    return true;
  }
}

class ProductDetailScreen extends StatelessWidget {
  const ProductDetailScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final controller = Get.put(ProductDetailController(),
        tag: (Get.arguments as Product).id);
    final product = controller.product;
    final session = Get.find<SessionService>();
    final store = MockData.storeById(product.storeId);
    final defaultCommune =
        controller.shop.defaultAddress?.commune ?? 'Gombe';

    return Scaffold(
      appBar: AppBar(
        actions: [
          IconButton(
            icon: const Icon(Icons.share_outlined),
            onPressed: () => Get.snackbar('share'.tr, 'share_mock'.tr,
                snackPosition: SnackPosition.BOTTOM),
          ),
          Obx(
            () => IconButton(
              icon: Icon(
                controller.shop.wishlist.contains(product.id)
                    ? Icons.favorite
                    : Icons.favorite_border,
                color: AppColors.brandRed,
              ),
              onPressed: () => controller.shop.toggleWishlist(product),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          SizedBox(
            height: 320,
            child: Obx(
              () => Column(
                children: [
                  Expanded(
                    child: PageView.builder(
                      itemCount: product.imageSeeds.length,
                      onPageChanged: (i) => controller.imageIndex.value = i,
                      itemBuilder: (_, i) => NetImage(
                          seed: product.imageSeeds[i],
                          width: double.infinity),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: List.generate(
                      product.imageSeeds.length,
                      (i) => Container(
                        margin: const EdgeInsets.symmetric(horizontal: 3),
                        width: controller.imageIndex.value == i ? 18 : 7,
                        height: 7,
                        decoration: BoxDecoration(
                          color: controller.imageIndex.value == i
                              ? AppColors.primary
                              : AppColors.border,
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(product.brand.toUpperCase(),
                    style: const TextStyle(
                        fontSize: 12,
                        color: AppColors.muted,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5)),
                const SizedBox(height: 4),
                Text(product.name,
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    RatingStars(rating: product.rating, size: 16),
                    const SizedBox(width: 6),
                    Text(
                      '${product.rating.toStringAsFixed(1)} (${product.reviewCount} ${'reviews_count'.tr})',
                      style: const TextStyle(
                          fontSize: 13, color: AppColors.muted),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Obx(
                  () => Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 10,
                    runSpacing: 4,
                    children: [
                      Text(
                        session.money(product.price),
                        style: const TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w900,
                          color: AppColors.primary,
                        ),
                      ),
                      if (product.originalPrice != null) ...[
                        Text(
                          session.money(product.originalPrice!),
                          style: const TextStyle(
                            fontSize: 15,
                            color: AppColors.muted,
                            decoration: TextDecoration.lineThrough,
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.brandRedLight,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '-${product.discountPercent}%',
                            style: const TextStyle(
                              color: AppColors.brandRed,
                              fontWeight: FontWeight.w800,
                              fontSize: 13,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(
                      product.stock > 0
                          ? Icons.check_circle
                          : Icons.cancel,
                      size: 18,
                      color: product.stock > 0
                          ? AppColors.success
                          : AppColors.danger,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      product.stock == 0
                          ? 'out_of_stock'.tr
                          : product.stock < 10
                              ? 'only_x_left'
                                  .trParams({'count': '${product.stock}'})
                              : 'in_stock'.tr,
                      style: TextStyle(
                        fontWeight: FontWeight.w600,
                        color: product.stock > 0
                            ? AppColors.success
                            : AppColors.danger,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    const Icon(Icons.local_shipping_outlined,
                        size: 18, color: AppColors.muted),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'delivery_estimate'.trParams({
                          'days': '${product.deliveryDays}',
                          'commune': defaultCommune,
                        }),
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.muted),
                      ),
                    ),
                  ],
                ),
                for (final variant in product.variants) ...[
                  const SizedBox(height: 16),
                  Text(tx(variant.nameEn, variant.nameFr),
                      style:
                          const TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  Obx(
                    () => Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final option in variant.options)
                          ChoiceChip(
                            label: Text(option),
                            selected: controller.selectedVariants[
                                    tx(variant.nameEn, variant.nameFr)] ==
                                option,
                            onSelected: (_) =>
                                controller.selectedVariants[
                                    tx(variant.nameEn, variant.nameFr)] = option,
                          ),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                Card(
                  child: ListTile(
                    leading: NetImage(
                      seed: store.logoSeed,
                      width: 42,
                      height: 42,
                      radius: BorderRadius.circular(21),
                    ),
                    title: Text('${'sold_by'.tr} ${store.name}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w700, fontSize: 14)),
                    subtitle: Row(
                      children: [
                        RatingStars(rating: store.rating, size: 12),
                        const SizedBox(width: 4),
                        Text(store.rating.toStringAsFixed(1),
                            style: const TextStyle(fontSize: 12)),
                      ],
                    ),
                    trailing: TextButton(
                      onPressed: () =>
                          Get.toNamed(AppRoutes.store, arguments: store),
                      child: Text('visit_store'.tr),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                Text('description'.tr,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Text(product.description,
                    style: const TextStyle(
                        height: 1.5, color: AppColors.ink, fontSize: 14)),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Text('reviews'.tr,
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w800)),
                    const Spacer(),
                    TextButton(
                      onPressed: () => Get.toNamed(AppRoutes.reviewCompose,
                          arguments: product),
                      child: Text('write_review'.tr),
                    ),
                  ],
                ),
                for (final review in product.reviews)
                  Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(review.author,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13)),
                              const Spacer(),
                              Text(review.date,
                                  style: const TextStyle(
                                      fontSize: 11,
                                      color: AppColors.muted)),
                            ],
                          ),
                          const SizedBox(height: 4),
                          RatingStars(rating: review.rating, size: 13),
                          const SizedBox(height: 6),
                          Text(review.text,
                              style: const TextStyle(
                                  fontSize: 13, height: 1.4)),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 80),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: product.stock == 0
                      ? null
                      : () {
                          if (controller.addToCart()) {
                            Get.snackbar(
                                'cart'.tr, 'added_to_cart'.tr,
                                snackPosition: SnackPosition.BOTTOM,
                                duration: const Duration(seconds: 1));
                          }
                        },
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.add_shopping_cart, size: 18),
                        const SizedBox(width: 8),
                        Text('add_to_cart'.tr),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(
                      backgroundColor: AppColors.brandRed),
                  onPressed: product.stock == 0
                      ? null
                      : () {
                          if (controller.addToCart()) {
                            Get.toNamed(AppRoutes.checkout);
                          }
                        },
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text('buy_now'.tr),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
