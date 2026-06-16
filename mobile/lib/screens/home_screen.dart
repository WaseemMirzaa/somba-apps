import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/app_badge.dart';
import '../widgets/app_card.dart';
import '../widgets/brand_mark.dart';
import '../widgets/price_text.dart';
import '../widgets/product_card.dart';
import '../widgets/section_header.dart';
import 'cart_screen.dart';
import 'deals_screen.dart';
import 'product_detail_screen.dart';

class HomeScreen extends StatefulWidget {
  final Locale locale;
  final void Function(Locale) onLocaleChanged;

  const HomeScreen({super.key, required this.locale, required this.onLocaleChanged});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  void _openProduct(product) {
    Navigator.push(
      context,
      MaterialPageRoute(builder: (_) => ProductDetailScreen(product: product, locale: widget.locale)),
    ).then((_) => setState(() {}));
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final lang = widget.locale.languageCode;
    final flashDeals = products.where((p) => p.discount >= 13).toList();
    final recent = ShopState.instance.recentlyViewed
        .map((id) => products.firstWhere((p) => p.id == id, orElse: () => products.first))
        .toList();

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // ── Brand app bar + search ──────────────────────────────────────
          SliverAppBar(
            floating: true,
            pinned: true,
            titleSpacing: 16,
            toolbarHeight: 60,
            title: const BrandMark(size: 34),
            actions: [
              IconButton(
                tooltip: 'Language',
                icon: const Icon(Icons.translate_rounded, color: AppColors.slate600),
                onPressed: () => widget.onLocaleChanged(lang == 'en' ? const Locale('fr') : const Locale('en')),
              ),
              IconButton(
                tooltip: s.cart,
                icon: Badge(
                  isLabelVisible: ShopState.instance.cartCount > 0,
                  backgroundColor: AppColors.primary,
                  label: Text('${ShopState.instance.cartCount}'),
                  child: const Icon(Icons.shopping_bag_outlined, color: AppColors.slate700),
                ),
                onPressed: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => CartScreen(locale: widget.locale)),
                ).then((_) => setState(() {})),
              ),
              const SizedBox(width: 4),
            ],
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(62),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: _SearchBar(hint: s.search),
              ),
            ),
          ),

          // ── Hero band ───────────────────────────────────────────────────
          SliverToBoxAdapter(child: _HeroBand(s: s)),

          // ── Categories rail ─────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: SectionHeader(title: s.shopByCategory, actionLabel: s.seeAll),
            ),
          ),
          SliverToBoxAdapter(
            child: SizedBox(
              height: 112,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                itemCount: categories.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (_, i) => _CategoryTile(category: categories[i], lang: lang),
              ),
            ),
          ),

          // ── Recently viewed ─────────────────────────────────────────────
          if (recent.isNotEmpty) ...[
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 18, 16, 0),
                child: SectionHeader(title: s.recentlyViewed, flourish: false),
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 188,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                  itemCount: recent.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 12),
                  itemBuilder: (_, i) => _MiniProductCard(
                    product: recent[i],
                    lang: lang,
                    onTap: () => _openProduct(recent[i]),
                  ),
                ),
              ),
            ),
          ],

          // ── Flash sale band ─────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
              child: _FlashBand(
                s: s,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => DealsScreen(locale: widget.locale)),
                ).then((_) => setState(() {})),
              ),
            ),
          ),
          _ProductGrid(
            products: flashDeals.take(4).toList(),
            lang: lang,
            flash: true,
            onTap: _openProduct,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
          ),

          // ── Trending ────────────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 22, 16, 0),
              child: SectionHeader(title: s.trending),
            ),
          ),
          _ProductGrid(
            products: products,
            lang: lang,
            onTap: _openProduct,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 24),
          ),
        ],
      ),
    );
  }
}

/// Pill search field styled like the web hero search.
class _SearchBar extends StatelessWidget {
  final String hint;
  const _SearchBar({required this.hint});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Search (mock)')),
      ),
      child: Container(
        height: 46,
        padding: const EdgeInsets.symmetric(horizontal: 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadius.card),
          border: Border.all(color: AppColors.borderStrong),
          boxShadow: AppShadows.sm,
        ),
        child: Row(
          children: [
            const Icon(Icons.search_rounded, color: AppColors.slate400, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Text(hint, style: const TextStyle(color: AppColors.slate400, fontSize: 14)),
            ),
            Container(
              padding: const EdgeInsets.all(6),
              decoration: const BoxDecoration(color: AppColors.primaryLight, shape: BoxShape.circle),
              child: const Icon(Icons.tune_rounded, color: AppColors.primary, size: 16),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroBand extends StatelessWidget {
  final Strings s;
  const _HeroBand({required this.s});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 4, 16, 4),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.xl),
        child: Container(
          decoration: const BoxDecoration(gradient: AppGradients.band),
          child: Stack(
            children: [
              Positioned(
                right: -40,
                top: -40,
                child: Container(
                  width: 160,
                  height: 160,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.08),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SectionLabel(s.prototype, light: true),
                    const SizedBox(height: 14),
                    Text(
                      s.tagline,
                      style: Theme.of(context)
                          .textTheme
                          .headlineSmall!
                          .copyWith(color: Colors.white, height: 1.15),
                    ),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () {},
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: AppColors.primary,
                      ),
                      child: Text(s.shopNow),
                    ),
                    const SizedBox(height: 16),
                    Row(
                      children: [
                        _HeroChip(icon: Icons.local_shipping_outlined, label: s.freeDelivery),
                        const SizedBox(width: 10),
                        _HeroChip(icon: Icons.verified_user_outlined, label: s.securePayment),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeroChip extends StatelessWidget {
  final IconData icon;
  final String label;
  const _HeroChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: Colors.white),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

class _FlashBand extends StatelessWidget {
  final Strings s;
  final VoidCallback onTap;
  const _FlashBand({required this.s, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: AppColors.amberLight,
              borderRadius: BorderRadius.circular(AppRadius.control),
            ),
            child: const Icon(Icons.bolt_rounded, color: AppColors.amber),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s.flashSale, style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 2),
                Text(
                  '${s.endsIn} 02:45:30',
                  style: const TextStyle(color: AppColors.slate500, fontSize: 12.5),
                ),
              ],
            ),
          ),
          const AppBadge('-50%', tone: BadgeTone.amber),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right, color: AppColors.slate400),
        ],
      ),
    );
  }
}

class _CategoryTile extends StatelessWidget {
  final Category category;
  final String lang;
  const _CategoryTile({required this.category, required this.lang});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 116,
      child: AppCard(
        radius: AppRadius.lg,
        onTap: () {},
        child: Stack(
          fit: StackFit.expand,
          children: [
            CachedNetworkImage(imageUrl: category.image, fit: BoxFit.cover),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.bottomCenter,
                  end: Alignment.center,
                  colors: [Color(0xCC0B1020), Colors.transparent],
                ),
              ),
            ),
            Positioned(
              left: 10,
              right: 10,
              bottom: 10,
              child: Text(
                category.displayName(lang),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniProductCard extends StatelessWidget {
  final dynamic product;
  final String lang;
  final VoidCallback onTap;
  const _MiniProductCard({required this.product, required this.lang, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 134,
      child: AppCard(
        radius: AppRadius.lg,
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 1.2,
              child: DecoratedBox(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [AppColors.surfaceMuted, AppColors.royalTint],
                  ),
                ),
                child: CachedNetworkImage(imageUrl: product.image, fit: BoxFit.cover),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    product.displayName(lang),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: AppColors.slate800),
                  ),
                  const SizedBox(height: 5),
                  Text(
                    formatUsd(product.price),
                    style: Theme.of(context).textTheme.titleMedium!.copyWith(fontSize: 15, color: AppColors.slate900),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A 2-column sliver grid of [ProductCard]s.
class _ProductGrid extends StatelessWidget {
  final List products;
  final String lang;
  final bool flash;
  final void Function(dynamic) onTap;
  final EdgeInsets padding;

  const _ProductGrid({
    required this.products,
    required this.lang,
    required this.onTap,
    required this.padding,
    this.flash = false,
  });

  @override
  Widget build(BuildContext context) {
    return SliverPadding(
      padding: padding,
      sliver: SliverGrid(
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisExtent: 252,
          crossAxisSpacing: 14,
          mainAxisSpacing: 14,
        ),
        delegate: SliverChildBuilderDelegate(
          (_, i) => ProductCard(
            product: products[i],
            lang: lang,
            flash: flash,
            onTap: () => onTap(products[i]),
          ),
          childCount: products.length,
        ),
      ),
    );
  }
}
