import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../data/mock/mock_data.dart';
import '../../routes/app_routes.dart';
import '../../widgets/common.dart';

class HomeTab extends StatelessWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>();
    final session = Get.find<SessionService>();
    final flashDeals = shop.products.where((p) => p.isFlashDeal).toList();
    final newArrivals = shop.products.where((p) => p.isNew).toList();

    return Scaffold(
      body: SafeArea(
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Obx(() {
                            final address = shop.defaultAddress;
                            return Row(
                              children: [
                                const Icon(Icons.location_on,
                                    size: 18, color: AppColors.brandRed),
                                const SizedBox(width: 4),
                                Flexible(
                                  child: Text(
                                    address == null
                                        ? '${'deliver_to'.tr} Kinshasa'
                                        : '${'deliver_to'.tr} ${address.commune}, ${address.city}',
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600),
                                  ),
                                ),
                              ],
                            );
                          }),
                        ),
                        Obx(
                          () => TextButton(
                            onPressed: session.toggleCurrency,
                            child: Text(session.currency.value,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800)),
                          ),
                        ),
                        Obx(
                          () => IconButton(
                            onPressed: () =>
                                Get.toNamed(AppRoutes.notifications),
                            icon: Badge(
                              isLabelVisible: shop.unreadCount > 0,
                              label: Text('${shop.unreadCount}'),
                              child: const Icon(Icons.notifications_outlined),
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    GestureDetector(
                      onTap: () => Get.toNamed(AppRoutes.search),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 14),
                        decoration: BoxDecoration(
                          color: AppColors.surface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppColors.border),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.search, color: AppColors.muted),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text('search_hint'.tr,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      color: AppColors.muted)),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            SliverToBoxAdapter(child: _Banners()),
            SliverToBoxAdapter(child: _CategoryShortcuts()),
            SliverToBoxAdapter(
              child: SectionHeader(
                title: 'flash_deals'.tr,
                onSeeAll: () => Get.toNamed(AppRoutes.deals),
              ),
            ),
            SliverToBoxAdapter(child: _ProductRail(products: flashDeals)),
            SliverToBoxAdapter(
              child: SectionHeader(
                title: 'new_arrivals'.tr,
                onSeeAll: () => Get.toNamed(AppRoutes.products),
              ),
            ),
            SliverToBoxAdapter(child: _ProductRail(products: newArrivals)),
            SliverToBoxAdapter(
                child: SectionHeader(title: 'featured_stores'.tr)),
            SliverToBoxAdapter(child: _StoreRail()),
            SliverToBoxAdapter(
              child: Obx(() {
                if (shop.recentlyViewed.isEmpty) {
                  return const SizedBox.shrink();
                }
                final viewed = shop.recentlyViewed
                    .map(MockData.productById)
                    .toList();
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SectionHeader(title: 'recently_viewed'.tr),
                    _ProductRail(products: viewed),
                  ],
                );
              }),
            ),
            SliverToBoxAdapter(
              child: SectionHeader(
                title: 'recommended'.tr,
                onSeeAll: () => Get.toNamed(AppRoutes.products),
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
              sliver: SliverGrid(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 12,
                  crossAxisSpacing: 12,
                  childAspectRatio: 0.62,
                ),
                delegate: SliverChildBuilderDelegate(
                  (_, i) => ProductCard(
                      product: shop.products[i], width: double.infinity),
                  childCount: shop.products.length,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Banners extends StatelessWidget {
  // Gradients mirror the web hero/CTA treatments in globals.css.
  static const _banners = [
    (
      'banner1_title',
      'banner1_sub',
      [AppColors.primary, AppColors.gradientBlueEnd],
      'banner-electronics'
    ),
    (
      'banner2_title',
      'banner2_sub',
      [AppColors.brandRed, Color(0xFFB3101D)],
      'banner-fashion'
    ),
    (
      'banner3_title',
      'banner3_sub',
      [AppColors.primaryDark, AppColors.primary],
      'banner-delivery'
    ),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 150,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        scrollDirection: Axis.horizontal,
        itemCount: _banners.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final (title, sub, colors, seed) = _banners[i];
          return Container(
            width: 300,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: colors,
              ),
              borderRadius: BorderRadius.circular(AppTheme.cardRadius),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerLeft,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisAlignment: MainAxisAlignment.center,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 170),
                            child: Text(
                              title.tr,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          ConstrainedBox(
                            constraints: const BoxConstraints(maxWidth: 170),
                            child: Text(
                              sub.tr,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.9),
                                fontSize: 13,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                NetImage(seed: seed, width: 110, height: 150),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _CategoryShortcuts extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>();
    return SizedBox(
      height: 116,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
        scrollDirection: Axis.horizontal,
        itemCount: shop.categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 16),
        itemBuilder: (_, i) {
          final category = shop.categories[i];
          return GestureDetector(
            onTap: () => Get.toNamed(AppRoutes.products,
                arguments: {'categoryId': category.id}),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: AppColors.primaryLight,
                  child: Icon(
                    IconData(category.iconCodePoint,
                        fontFamily: 'MaterialIcons'),
                    color: AppColors.primary,
                  ),
                ),
                const SizedBox(height: 6),
                SizedBox(
                  width: 64,
                  child: Text(
                    category.name,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 11),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _ProductRail extends StatelessWidget {
  final List products;

  const _ProductRail({required this.products});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 268,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: products.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) => ProductCard(product: products[i]),
      ),
    );
  }
}

class _StoreRail extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final shop = Get.find<ShopService>();
    return SizedBox(
      height: 150,
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: shop.stores.length,
        separatorBuilder: (_, __) => const SizedBox(width: 12),
        itemBuilder: (_, i) {
          final store = shop.stores[i];
          return SizedBox(
            width: 220,
            child: Card(
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: () => Get.toNamed(AppRoutes.store, arguments: store),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    NetImage(
                        seed: store.bannerSeed,
                        width: double.infinity,
                        height: 70),
                    Padding(
                      padding: const EdgeInsets.all(10),
                      child: Row(
                        children: [
                          NetImage(
                            seed: store.logoSeed,
                            width: 34,
                            height: 34,
                            radius: BorderRadius.circular(17),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(store.name,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w700,
                                        fontSize: 13)),
                                Row(
                                  children: [
                                    RatingStars(
                                        rating: store.rating, size: 11),
                                    const SizedBox(width: 4),
                                    Text(
                                      store.rating.toStringAsFixed(1),
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: AppColors.muted),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}
