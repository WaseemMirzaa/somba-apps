import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../widgets/product_card.dart';
import 'product_detail_screen.dart';
import 'cart_screen.dart';

class HomeScreen extends StatelessWidget {
  final Locale locale;
  final void Function(Locale) onLocaleChanged;

  const HomeScreen({super.key, required this.locale, required this.onLocaleChanged});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);
    final colorScheme = Theme.of(context).colorScheme;

    return CustomScrollView(
      slivers: [
        SliverAppBar(
          floating: true,
          pinned: true,
          backgroundColor: colorScheme.primary,
          foregroundColor: Colors.white,
          title: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: Text('LC', style: TextStyle(color: colorScheme.primary, fontWeight: FontWeight.bold, fontSize: 12)),
                ),
              ),
              const SizedBox(width: 8),
              Text(s.brand, style: const TextStyle(fontWeight: FontWeight.bold)),
            ],
          ),
          actions: [
            IconButton(icon: const Icon(Icons.language), onPressed: () {
              onLocaleChanged(locale.languageCode == 'en' ? const Locale('fr') : const Locale('en'));
            }),
            IconButton(
              icon: Badge(
                label: Text('${ShopState.instance.cartCount}'),
                isLabelVisible: ShopState.instance.cartCount > 0,
                child: const Icon(Icons.shopping_cart_outlined),
              ),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(locale: locale))),
            ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(56),
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: TextField(
                decoration: InputDecoration(
                  hintText: s.search,
                  hintStyle: TextStyle(color: Colors.grey[500], fontSize: 14),
                  prefixIcon: const Icon(Icons.search, color: Colors.grey),
                  filled: true,
                  fillColor: Colors.white,
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(24), borderSide: BorderSide.none),
                  contentPadding: const EdgeInsets.symmetric(vertical: 0),
                ),
              ),
            ),
          ),
        ),

        // Prototype banner
        SliverToBoxAdapter(
          child: Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [colorScheme.primary, colorScheme.primary.withValues(alpha: 0.8)]),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(12)),
                  child: Text(s.prototype, style: const TextStyle(color: Colors.white, fontSize: 11)),
                ),
                const SizedBox(height: 8),
                Text(
                  locale.languageCode == 'fr' ? 'Votre marketplace, réinventée' : 'Your marketplace, reimagined',
                  style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () {},
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: colorScheme.primary),
                  child: Text(s.shopNow),
                ),
              ],
            ),
          ),
        ),

        // Categories
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(s.categories, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ),
        ),
        SliverToBoxAdapter(
          child: SizedBox(
            height: 100,
            child: ListView.builder(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.all(16),
              itemCount: categories.length,
              itemBuilder: (_, i) {
                final cat = categories[i];
                return Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: Column(
                    children: [
                      ClipOval(
                        child: CachedNetworkImage(imageUrl: cat.image, width: 56, height: 56, fit: BoxFit.cover),
                      ),
                      const SizedBox(height: 4),
                      Text(cat.displayName(locale.languageCode), style: const TextStyle(fontSize: 11)),
                    ],
                  ),
                );
              },
            ),
          ),
        ),

        // Recently viewed / Buy again
        if (ShopState.instance.recentlyViewed.isNotEmpty)
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: Text(locale.languageCode == 'fr' ? 'Vu récemment' : 'Recently Viewed', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            ),
          ),
        if (ShopState.instance.recentlyViewed.isNotEmpty)
          SliverToBoxAdapter(
            child: SizedBox(
              height: 120,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.all(16),
                itemCount: ShopState.instance.recentlyViewed.length,
                itemBuilder: (_, i) {
                  final p = products.firstWhere((x) => x.id == ShopState.instance.recentlyViewed[i], orElse: () => products[0]);
                  return Padding(
                    padding: const EdgeInsets.only(right: 12),
                    child: GestureDetector(
                      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductDetailScreen(product: p, locale: locale))),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: CachedNetworkImage(imageUrl: p.image, width: 80, height: 80, fit: BoxFit.cover),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),

        // Flash Sale
        SliverToBoxAdapter(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: [colorScheme.primary, const Color(0xFF4338CA)]),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.bolt, color: Colors.white),
                const SizedBox(width: 8),
                Text(s.flashSale, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                const Spacer(),
                Text('${s.endsIn} 02:45:30', style: const TextStyle(color: Colors.white70, fontSize: 12)),
              ],
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.72,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            delegate: SliverChildBuilderDelegate(
              (_, i) => ProductCard(
                product: products[i % products.length],
                lang: locale.languageCode,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => ProductDetailScreen(product: products[i % products.length], locale: locale)),
                ),
              ),
              childCount: 4,
            ),
          ),
        ),

        // Trending
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text(s.trending, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.72,
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
            ),
            delegate: SliverChildBuilderDelegate(
              (_, i) => ProductCard(
                product: products[i],
                lang: locale.languageCode,
                onTap: () => Navigator.push(
                  context,
                  MaterialPageRoute(builder: (_) => ProductDetailScreen(product: products[i], locale: locale)),
                ),
              ),
              childCount: products.length,
            ),
          ),
        ),
      ],
    );
  }
}
