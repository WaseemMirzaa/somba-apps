import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/shop_state.dart';
import '../data/catalog_meta.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import '../widgets/product_image.dart';
import 'checkout_screen.dart';
import 'more/shop_extra.dart';

class ProductDetailScreen extends StatefulWidget {
  final Product product;
  final Locale locale;

  const ProductDetailScreen({super.key, required this.product, required this.locale});

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  int _variant = 0;
  int _qty = 1;
  late final List<String> _variants;

  // (question, answer?) — answer null while awaiting the seller.
  final List<(String, String?)> _qa = [
    ('Is this the latest model?', 'Yes — it is the current 2026 edition.'),
    ('Does it ship to Kinshasa?', 'Yes, delivered within 2 days in Gombe.'),
  ];

  @override
  void initState() {
    super.initState();
    ShopState.instance.addRecentlyViewed(widget.product.id);
    _variants = _variantsFor(widget.product.category);
  }

  List<String> _variantsFor(String category) {
    switch (category) {
      case 'Fashion':
        return ['S', 'M', 'L', 'XL'];
      case 'Electronics':
        return ['128GB', '256GB', '512GB'];
      default:
        return ['Standard', 'Premium'];
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final lang = widget.locale.languageCode;
    final p = widget.product;
    final shop = ShopState.instance;
    final wished = shop.wishlist.contains(p.id);
    final save = p.originalPrice - p.price;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 360,
            pinned: true,
            backgroundColor: AppColors.background,
            leading: Padding(
              padding: const EdgeInsets.all(8),
              child: CircleIconButton(
                icon: Icons.arrow_back_rounded,
                background: Colors.white,
                onTap: () => Navigator.pop(context),
              ),
            ),
            actions: [
              CircleIconButton(
                icon: wished ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                color: wished ? AppColors.accent : AppColors.ink,
                background: Colors.white,
                onTap: () => setState(() =>
                    wished ? shop.wishlist.remove(p.id) : shop.wishlist.add(p.id)),
              ),
              const SizedBox(width: 8),
              CircleIconButton(
                icon: Icons.ios_share_rounded,
                background: Colors.white,
                onTap: () => ScaffoldMessenger.of(context)
                  ..hideCurrentSnackBar()
                  ..showSnackBar(const SnackBar(content: Text('Link copied'))),
              ),
              const SizedBox(width: 12),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Hero(
                tag: 'product-${p.id}',
                child: ProductImage(product: p, iconSize: 130),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Transform.translate(
              offset: const Offset(0, -22),
              child: Container(
                decoration: const BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
                ),
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Pill(p.category,
                            color: AppColors.primary.withValues(alpha: 0.10),
                            textColor: AppColors.primary,
                            fontSize: 11.5),
                        const Spacer(),
                        const Icon(Icons.verified_rounded, size: 16, color: AppColors.success),
                        const SizedBox(width: 4),
                        Text(s.inStock,
                            style: const TextStyle(
                                color: AppColors.success, fontSize: 12.5, fontWeight: FontWeight.w700)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(p.displayName(lang),
                        style: Theme.of(context).textTheme.headlineSmall),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        RatingPill(p.rating),
                        const SizedBox(width: 8),
                        Text('${p.rating} · ${compact(p.reviews)} ${s.reviewsLabel}',
                            style: const TextStyle(color: AppColors.muted, fontSize: 13, fontWeight: FontWeight.w500)),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(money(p.price),
                              style: const TextStyle(
                                  fontSize: 30, fontWeight: FontWeight.w800, color: AppColors.ink, letterSpacing: -1)),
                          if (secondaryMoney(p.price) != null)
                            Text(secondaryMoney(p.price)!, style: const TextStyle(fontSize: 12.5, color: AppColors.muted, fontWeight: FontWeight.w600)),
                        ]),
                        const SizedBox(width: 10),
                        Padding(
                          padding: const EdgeInsets.only(bottom: 5),
                          child: Text(money(p.originalPrice),
                              style: const TextStyle(
                                  fontSize: 15, color: AppColors.faint, decoration: TextDecoration.lineThrough)),
                        ),
                        const Spacer(),
                        if (save > 0)
                          Pill('${lang == 'fr' ? 'Éco.' : 'Save'} ${money(save)}',
                              color: AppColors.success.withValues(alpha: 0.14),
                              textColor: const Color(0xFF047857),
                              fontSize: 12),
                      ],
                    ),
                    const SizedBox(height: 22),
                    Text(s.selectVariant, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: List.generate(_variants.length, (i) {
                        final sel = _variant == i;
                        return GestureDetector(
                          onTap: () => setState(() => _variant = i),
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 150),
                            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
                            decoration: BoxDecoration(
                              color: sel ? AppColors.primary : AppColors.surface,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                  color: sel ? AppColors.primary : AppColors.line, width: 1.4),
                            ),
                            child: Text(_variants[i],
                                style: TextStyle(
                                    color: sel ? Colors.white : AppColors.inkSoft,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13.5)),
                          ),
                        );
                      }),
                    ),
                    const SizedBox(height: 22),
                    Row(
                      children: [
                        Text(s.quantity, style: Theme.of(context).textTheme.titleMedium),
                        const Spacer(),
                        QuantityStepper(
                          value: _qty,
                          onChanged: (v) => setState(() => _qty = v),
                        ),
                      ],
                    ),
                    const SizedBox(height: 22),
                    _infoCard(Icons.local_shipping_rounded, s.freeDelivery,
                        lang == 'fr' ? 'Arrive en 2 jours' : 'Arrives in 2 days'),
                    const SizedBox(height: 12),
                    _infoCard(Icons.replay_rounded,
                        lang == 'fr' ? 'Retours gratuits' : 'Free returns',
                        lang == 'fr' ? 'Sous 30 jours' : 'Within 30 days'),
                    const SizedBox(height: 24),
                    Text(s.description, style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    Text(
                      lang == 'fr'
                          ? 'Le ${p.displayName(lang)} allie qualité premium et design soigné. Un choix idéal, livré rapidement et couvert par notre garantie satisfaction.'
                          : 'The ${p.displayName(lang)} blends premium quality with a refined design. A perfect pick — shipped fast and backed by our satisfaction guarantee.',
                      style: const TextStyle(fontSize: 14.5, height: 1.55, color: AppColors.inkSoft),
                    ),
                    const SizedBox(height: 24),
                    _sellerCard(p),
                    const SizedBox(height: 24),
                    Text('Specifications', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 10),
                    _specs(p),
                    const SizedBox(height: 24),
                    _reviewsRow(p),
                    const SizedBox(height: 24),
                    _qaSection(),
                    const SizedBox(height: 24),
                    _related(p, lang),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: _bottomBar(s),
    );
  }

  Widget _sellerCard(Product p) {
    final seller = sellerFor(p);
    final following = ShopState.instance.followedStores.contains(seller.id);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleAvatar(radius: 22, backgroundColor: AppColors.primary.withValues(alpha: 0.12),
              child: Text(seller.name[0], style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800))),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(seller.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
            const SizedBox(height: 3),
            Row(children: [
              const Icon(Icons.star_rounded, size: 14, color: AppColors.amber),
              const SizedBox(width: 3),
              Text('${seller.rating} · ${seller.health}% health', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            ]),
          ])),
          _badge(seller.badge),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Expanded(child: OutlinedButton.icon(
            onPressed: () => setState(() => ShopState.instance.toggleFollow(seller.id)),
            icon: Icon(following ? Icons.check_rounded : Icons.add_rounded, size: 18),
            label: Text(following ? 'Following' : 'Follow store'),
          )),
          const SizedBox(width: 10),
          Expanded(child: FilledButton.icon(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StoreScreen(locale: widget.locale))),
            icon: const Icon(Icons.storefront_rounded, size: 18),
            label: const Text('Visit store'),
          )),
        ]),
      ]),
    );
  }

  Widget _badge(SellerBadge b) {
    final gold = b == SellerBadge.gold || b == SellerBadge.sombaAssured;
    final c = b == SellerBadge.sombaAssured
        ? AppColors.primary
        : gold
            ? AppColors.amber
            : b == SellerBadge.silver
                ? AppColors.muted
                : const Color(0xFFB45309);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(100)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(b == SellerBadge.sombaAssured ? Icons.verified_rounded : Icons.workspace_premium_rounded, size: 13, color: c),
        const SizedBox(width: 4),
        Text(b.label, style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: 10.5)),
      ]),
    );
  }

  Widget _specs(Product p) {
    final specs = specsFor(p);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
      child: Column(children: [
        for (int i = 0; i < specs.length; i++) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(children: [
              Text(specs[i].$1, style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
              const Spacer(),
              Text(specs[i].$2, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            ]),
          ),
          if (i != specs.length - 1) const Divider(height: 1),
        ],
      ]),
    );
  }

  Widget _reviewsRow(Product p) {
    return GestureDetector(
      onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewsScreen(locale: widget.locale))),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
        child: Row(children: [
          const Icon(Icons.reviews_rounded, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('${p.rating} · ${p.reviews} reviews', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            const Text('Read what buyers say', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ])),
          const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
        ]),
      ),
    );
  }

  Widget _qaSection() {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text('Questions & answers', style: Theme.of(context).textTheme.titleMedium),
        const Spacer(),
        TextButton.icon(
          onPressed: _askQuestion,
          icon: const Icon(Icons.help_outline_rounded, size: 18),
          style: TextButton.styleFrom(foregroundColor: AppColors.primary),
          label: const Text('Ask'),
        ),
      ]),
      const SizedBox(height: 4),
      Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
        child: Column(children: [
          for (int i = 0; i < _qa.length; i++) ...[
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Icon(Icons.chat_bubble_outline_rounded, size: 16, color: AppColors.primary),
                const SizedBox(width: 8),
                Expanded(child: Text(_qa[i].$1, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
              ]),
              Padding(
                padding: const EdgeInsets.only(left: 24, top: 4),
                child: Text(_qa[i].$2 ?? 'Awaiting seller response…',
                    style: TextStyle(color: _qa[i].$2 == null ? AppColors.faint : AppColors.inkSoft, fontSize: 13, height: 1.35, fontStyle: _qa[i].$2 == null ? FontStyle.italic : FontStyle.normal)),
              ),
            ]),
            if (i != _qa.length - 1) const Divider(height: 22),
          ],
        ]),
      ),
    ]);
  }

  void _askQuestion() {
    final ctrl = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('Ask a question', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'PlusJakartaSans')),
          const SizedBox(height: 12),
          TextField(
            controller: ctrl,
            autofocus: true,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Ask the seller about this product…',
              filled: true,
              fillColor: AppColors.background,
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.primary, width: 1.4)),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
            ),
          ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: () {
              final q = ctrl.text.trim();
              if (q.isEmpty) return;
              setState(() => _qa.add((q, null)));
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Question sent to the seller')));
            },
            child: const Text('Submit question'),
          ),
        ]),
      ),
    );
  }

  Widget _related(Product p, String lang) {
    final items = relatedTo(p);
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('You may also like', style: Theme.of(context).textTheme.titleMedium),
      const SizedBox(height: 12),
      SizedBox(
        height: 170,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: items.length,
          separatorBuilder: (_, __) => const SizedBox(width: 12),
          itemBuilder: (_, i) {
            final r = items[i];
            return GestureDetector(
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductDetailScreen(product: r, locale: widget.locale))),
              child: SizedBox(
                width: 128,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  ClipRRect(borderRadius: BorderRadius.circular(14), child: SizedBox(height: 110, width: 128, child: ProductImage(product: r, iconSize: 30))),
                  const SizedBox(height: 6),
                  Text(r.displayName(lang), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
                  Text(money(r.price), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13, color: AppColors.primary)),
                ]),
              ),
            );
          },
        ),
      ),
    ]);
  }

  Widget _infoCard(IconData icon, String title, String subtitle) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Container(
            height: 40,
            width: 40,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, color: AppColors.primary, size: 21),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              Text(subtitle, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _bottomBar(Strings s) {
    final p = widget.product;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: AppColors.surface,
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF1E293B).withValues(alpha: 0.08),
            blurRadius: 20,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            height: 54,
            width: 54,
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(16),
            ),
            child: IconButton(
              icon: const Icon(Icons.add_shopping_cart_rounded, color: AppColors.primary),
              onPressed: () {
                ShopState.instance.addToCart(p, variant: _variants[_variant], qty: _qty);
                ScaffoldMessenger.of(context)
                  ..hideCurrentSnackBar()
                  ..showSnackBar(SnackBar(content: Text(s.addedToCart)));
              },
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: FilledButton(
              onPressed: () {
                ShopState.instance.addToCart(p, variant: _variants[_variant], qty: _qty);
                Navigator.push(context,
                    MaterialPageRoute(builder: (_) => CheckoutScreen(locale: widget.locale)));
              },
              child: Text('${s.buyNow}  ·  ${money(p.price * _qty)}'),
            ),
          ),
        ],
      ),
    );
  }
}
