import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../widgets/common.dart';

class StoreScreen extends StatelessWidget {
  const StoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = Get.arguments as Store;
    final shop = Get.find<ShopService>();
    final products =
        shop.products.where((p) => p.storeId == store.id).toList();

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 160,
            pinned: true,
            flexibleSpace: FlexibleSpaceBar(
              background: NetImage(
                seed: store.bannerSeed,
                width: double.infinity,
                height: 200,
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  NetImage(
                    seed: store.logoSeed,
                    width: 56,
                    height: 56,
                    radius: BorderRadius.circular(28),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(store.name,
                            style: const TextStyle(
                                fontSize: 18, fontWeight: FontWeight.w800)),
                        Text(store.tagline,
                            style: const TextStyle(
                                fontSize: 13, color: AppColors.muted)),
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            RatingStars(rating: store.rating),
                            const SizedBox(width: 6),
                            Text(
                              '${store.rating.toStringAsFixed(1)} · ${store.reviewCount} ${'reviews_count'.tr}',
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.muted),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            const Icon(Icons.location_on,
                                size: 14, color: AppColors.brandRed),
                            Text(
                              '${store.commune}, ${store.city}',
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.muted),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                '${'products'.tr} (${products.length})',
                style:
                    const TextStyle(fontSize: 16, fontWeight: FontWeight.w800),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.62,
              ),
              delegate: SliverChildBuilderDelegate(
                (_, i) =>
                    ProductCard(product: products[i], width: double.infinity),
                childCount: products.length,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
