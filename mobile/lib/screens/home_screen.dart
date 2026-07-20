import 'dart:async';
import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/catalog_live.dart';
import '../data/shop_state.dart';
import '../services/realtime_store.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import '../widgets/product_card.dart';
import '../widgets/product_image.dart';
import 'product_detail_screen.dart';
import 'cart_screen.dart';
import 'categories_screen.dart';
import 'more/search_screen.dart';
import 'more/browse.dart';
import 'more/catalog_extra.dart';

class HomeScreen extends StatefulWidget {
  final Locale locale;
  final void Function(Locale) onLocaleChanged;

  const HomeScreen({super.key, required this.locale, required this.onLocaleChanged});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final _pageController = PageController(viewportFraction: 0.92);
  int _page = 0;
  int _feedTab = 0;
  Timer? _autoplay;

  late final List<_Banner> _banners = [
    _Banner(AppColors.brandGradient, Icons.auto_awesome_rounded),
    _Banner(AppColors.dealGradient, Icons.local_fire_department_rounded),
    _Banner(
      const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF0EA5E9), Color(0xFF2563EB)],
      ),
      Icons.local_shipping_rounded,
    ),
  ];

  @override
  void initState() {
    super.initState();
    // Rebuild when the live catalog hydrates/changes over the socket.
    RealtimeStore.instance.addListener(_onStore);
    _autoplay = Timer.periodic(const Duration(seconds: 4), (_) {
      if (!_pageController.hasClients) return;
      final next = (_page + 1) % _banners.length;
      _pageController.animateToPage(next,
          duration: const Duration(milliseconds: 500), curve: Curves.easeOutCubic);
    });
  }

  void _onStore() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    RealtimeStore.instance.removeListener(_onStore);
    _autoplay?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  void _openProduct(Product p) {
    Navigator.push(context,
        MaterialPageRoute(builder: (_) => ProductDetailScreen(product: p, locale: widget.locale)));
  }

  void _add(Product p) {
    setState(() => ShopState.instance.addToCart(p));
    final s = Strings(widget.locale.languageCode);
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text('${p.displayName(widget.locale.languageCode)} — ${s.addedToCart}')));
  }

  // Recommended feed, filtered by the selected chip in real time.
  List<Product> _feed() {
    final list = [...liveCatalog()];
    switch (_feedTab) {
      case 1: // Trending — most reviewed
        list.sort((a, b) => b.reviews.compareTo(a.reviews));
        break;
      case 2: // New — newest ids first
        list.sort((a, b) => b.id.compareTo(a.id));
        break;
      case 3: // Popular — highest rated
        list.sort((a, b) => b.rating.compareTo(a.rating));
        break;
    }
    return list;
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final lang = widget.locale.languageCode;
    final deals = liveCatalog().where((p) => p.discount >= 15).toList();
    final feed = _feed();

    return CustomScrollView(
      slivers: [
        _header(s, lang),
        SliverToBoxAdapter(child: _heroCarousel(s)),
        SliverToBoxAdapter(child: _quickActions(s)),
        SliverToBoxAdapter(
          child: SectionHeader(s.topCategories, actionLabel: s.seeAll,
              onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CategoriesScreen(locale: widget.locale)))),
        ),
        SliverToBoxAdapter(child: _categories(lang)),
        SliverToBoxAdapter(child: _flashSaleStrip(s)),
        SliverToBoxAdapter(child: _dealsRow(deals, lang)),
        SliverToBoxAdapter(
          child: SectionHeader(s.recommended, actionLabel: s.seeAll,
              onAction: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductListScreen(locale: widget.locale, title: s.recommended)))),
        ),
        SliverToBoxAdapter(child: _feedChips(s)),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 110),
          sliver: SliverGrid(
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              childAspectRatio: 0.62,
              crossAxisSpacing: 14,
              mainAxisSpacing: 14,
            ),
            delegate: SliverChildBuilderDelegate(
              (_, i) => ProductCard(
                product: feed[i],
                lang: lang,
                onTap: () => _openProduct(feed[i]),
                onAdd: () => _add(feed[i]),
              ),
              childCount: feed.length,
            ),
          ),
        ),
      ],
    );
  }

  // ---- Header (gradient app bar with location + search) ----
  Widget _header(Strings s, String lang) {
    return SliverAppBar(
      pinned: true,
      expandedHeight: 150,
      collapsedHeight: 74,
      backgroundColor: AppColors.primaryDark,
      automaticallyImplyLeading: false,
      flexibleSpace: Container(
        decoration: const BoxDecoration(
          gradient: AppColors.brandGradient,
          borderRadius: BorderRadius.vertical(bottom: Radius.circular(26)),
        ),
        padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top + 8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(18, 4, 12, 0),
              child: Row(
                children: [
                  const Icon(Icons.location_on_rounded, color: Colors.white70, size: 18),
                  const SizedBox(width: 5),
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () async {
                      await Navigator.push(context, MaterialPageRoute(builder: (_) => AddressSelectScreen(locale: widget.locale)));
                      if (mounted) setState(() {});
                    },
                    child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(s.deliverTo,
                          style: const TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w500)),
                      Row(
                        children: [
                          Text(ShopState.instance.selectedAddressLabel ?? 'Kinshasa, Gombe',
                              style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w700)),
                          const Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white, size: 18),
                        ],
                      ),
                    ],
                    ),
                  ),
                  const Spacer(),
                  CircleIconButton(
                    icon: Icons.translate_rounded,
                    background: Colors.white.withValues(alpha: 0.18),
                    color: Colors.white,
                    onTap: () => widget.onLocaleChanged(lang == 'en' ? const Locale('fr') : const Locale('en')),
                  ),
                  const SizedBox(width: 8),
                  CircleIconButton(
                    icon: Icons.shopping_bag_outlined,
                    background: Colors.white.withValues(alpha: 0.18),
                    color: Colors.white,
                    badgeCount: ShopState.instance.cartCount,
                    onTap: () async {
                      await Navigator.push(context,
                          MaterialPageRoute(builder: (_) => CartScreen(locale: widget.locale)));
                      if (mounted) setState(() {});
                    },
                  ),
                  const SizedBox(width: 6),
                ],
              ),
            ),
          ],
        ),
      ),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(66),
        child: Container(
          color: Colors.transparent,
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          child: Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => SearchScreen(locale: widget.locale))),
                  child: Container(
                    height: 50,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(100),
                      boxShadow: AppShadow.soft,
                    ),
                    child: Row(
                      children: [
                        const SizedBox(width: 16),
                        const Icon(Icons.search_rounded, color: AppColors.muted, size: 22),
                        const SizedBox(width: 10),
                        Text(s.search,
                            style: const TextStyle(color: AppColors.faint, fontSize: 14.5, fontWeight: FontWeight.w500)),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              GestureDetector(
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SearchScreen(locale: widget.locale))),
                child: Container(
                height: 50,
                width: 50,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: AppShadow.soft,
                ),
                child: const Icon(Icons.tune_rounded, color: AppColors.primary),
              ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ---- Hero carousel ----
  Widget _heroCarousel(Strings s) {
    return Column(
      children: [
        const SizedBox(height: 18),
        SizedBox(
          height: 168,
          child: PageView.builder(
            controller: _pageController,
            itemCount: _banners.length,
            onPageChanged: (i) => setState(() => _page = i),
            itemBuilder: (_, i) {
              final b = _banners[i];
              return Padding(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                child: Container(
                  decoration: BoxDecoration(
                    gradient: b.gradient,
                    borderRadius: BorderRadius.circular(24),
                    boxShadow: AppShadow.soft,
                  ),
                  child: Stack(
                    children: [
                      Positioned(
                        right: -20,
                        top: -20,
                        child: Icon(b.icon, size: 150, color: Colors.white.withValues(alpha: 0.14)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(22),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.22),
                                borderRadius: BorderRadius.circular(100),
                              ),
                              child: Text(
                                i == 1 ? '${s.flashSale} · -30%' : (i == 2 ? s.freeDelivery : s.prototype),
                                style: const TextStyle(color: Colors.white, fontSize: 11.5, fontWeight: FontWeight.w700),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              s.heroTitle,
                              style: const TextStyle(
                                  color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, height: 1.1, letterSpacing: -0.5),
                            ),
                            const SizedBox(height: 6),
                            Text(s.heroSubtitle,
                                style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12.5)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(
            _banners.length,
            (i) => AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              margin: const EdgeInsets.symmetric(horizontal: 3),
              width: _page == i ? 22 : 7,
              height: 7,
              decoration: BoxDecoration(
                color: _page == i ? AppColors.primary : AppColors.line,
                borderRadius: BorderRadius.circular(100),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ---- Quick action tiles ----
  Widget _quickActions(Strings s) {
    void go(Widget screen) => Navigator.push(context, MaterialPageRoute(builder: (_) => screen));
    final items = [
      (Icons.bolt_rounded, s.deals, AppColors.accent, () => go(ProductListScreen(locale: widget.locale, title: s.deals, dealsOnly: true))),
      (Icons.local_shipping_rounded, s.freeDelivery, AppColors.mint, () => go(ProductListScreen(locale: widget.locale, title: s.freeDelivery))),
      (Icons.verified_rounded, s.inStock, AppColors.primary, () => go(ProductListScreen(locale: widget.locale, title: s.inStock))),
      (Icons.percent_rounded, 'Coupons', AppColors.amber, () => go(CouponsScreen(locale: widget.locale))),
    ];
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Row(
        children: items.map((it) {
          return Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: it.$4,
              child: Column(
                children: [
                  Container(
                    height: 52,
                    width: 52,
                    decoration: BoxDecoration(
                      color: it.$3.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Icon(it.$1, color: it.$3, size: 24),
                  ),
                  const SizedBox(height: 6),
                  Text(it.$2,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  // ---- Feed filter chips ----
  Widget _feedChips(Strings s) {
    final fr = s.isFr;
    final tabs = fr
        ? ['Pour vous', 'Tendances', 'Nouveau', 'Populaire']
        : ['For You', 'Trending', 'New', 'Popular'];
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final sel = _feedTab == i;
          return GestureDetector(
            onTap: () => setState(() => _feedTab = i),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.symmetric(horizontal: 18),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                gradient: sel ? AppColors.brandGradient : null,
                color: sel ? null : AppColors.surface,
                borderRadius: BorderRadius.circular(100),
                border: Border.all(color: sel ? Colors.transparent : AppColors.line),
                boxShadow: sel ? AppShadow.lifted : null,
              ),
              child: Text(
                tabs[i],
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: sel ? Colors.white : AppColors.muted,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ---- Categories row ----
  Widget _categories(String lang) {
    return SizedBox(
      height: 104,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (_, i) {
          final cat = categories[i];
          final grad = AppColors.tileGradients[i % AppColors.tileGradients.length];
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductListScreen(locale: widget.locale, category: cat.name))),
            child: Column(
              children: [
                Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                        begin: Alignment.topLeft, end: Alignment.bottomRight, colors: grad),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: AppShadow.card,
                  ),
                  child: Icon(categoryIcon(cat.name), color: AppColors.primary, size: 28),
                ),
                const SizedBox(height: 7),
                Text(cat.displayName(lang),
                    style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600)),
              ],
            ),
          );
        },
      ),
    );
  }

  // ---- Flash sale strip ----
  Widget _flashSaleStrip(Strings s) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 24, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        gradient: AppColors.dealGradient,
        borderRadius: BorderRadius.circular(20),
        boxShadow: AppShadow.card,
      ),
      child: Row(
        children: [
          const Icon(Icons.bolt_rounded, color: Colors.white, size: 24),
          const SizedBox(width: 8),
          Text(s.flashSale,
              style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16.5)),
          const Spacer(),
          Text('${s.endsIn}  ',
              style: const TextStyle(color: Colors.white70, fontSize: 11.5, fontWeight: FontWeight.w500)),
          const Countdown(),
        ],
      ),
    );
  }

  Widget _dealsRow(List<Product> deals, String lang) {
    return SizedBox(
      height: 288,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        itemCount: deals.length,
        separatorBuilder: (_, __) => const SizedBox(width: 14),
        itemBuilder: (_, i) => SizedBox(
          width: 168,
          child: ProductCard(
            product: deals[i],
            lang: lang,
            onTap: () => _openProduct(deals[i]),
            onAdd: () => _add(deals[i]),
          ),
        ),
      ),
    );
  }
}

class _Banner {
  final Gradient gradient;
  final IconData icon;
  _Banner(this.gradient, this.icon);
}
