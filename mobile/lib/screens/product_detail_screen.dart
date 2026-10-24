import 'package:flutter/material.dart';
import '../util/delivery_estimate.dart';
import '../util/variants.dart';
import '../data/catalog_live.dart';
import '../data/catalog_models.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../services/models.dart';
import '../services/realtime_store.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../widgets/common.dart';
import '../widgets/product_image.dart';
import '../widgets/translatable_text.dart';
import 'cart_screen.dart';
import 'checkout_screen.dart';
import 'more/shop_extra.dart';

/// Product page. Everything shown here comes from the server: price, stock,
/// description, seller, reviews and Q&A. The listing updates live (price or
/// stock changes pushed while the page is open).
class ProductDetailScreen extends StatefulWidget {
  final Product product;
  final Locale locale;

  const ProductDetailScreen({super.key, required this.product, required this.locale});

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen> {
  int _qty = 1;
  final Map<String, String> _picks = {};
  String? _pickError;

  /// Checks the size/colour choice; on a gap, flags it and says so. Returns the variant label or null.
  String? _chosenVariant(Product p, Strings s) {
    final missing = missingPick(p.variants, _picks);
    if (missing != null) {
      setState(() => _pickError = missing.name);
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(s.chooseOption(p.variantGroupLabel(p.variants.indexOf(missing), s.lang)))));
      return null;
    }
    return variantLabel(p.variants, _picks);
  }
  late Future<List<QuestionDto>> _questions;
  late Future<List<ReviewDto>> _reviews;

  @override
  void initState() {
    super.initState();
    ShopState.instance.addRecentlyViewed(widget.product.uuid);
    _reload();
    RealtimeStore.instance.reviewRevision.addListener(_onReviewPush);
  }

  /// A seller replied to (or moderation changed) a review: show it without reopening the page.
  void _onReviewPush() {
    if (mounted) setState(_reload);
  }

  @override
  void dispose() {
    RealtimeStore.instance.reviewRevision.removeListener(_onReviewPush);
    super.dispose();
  }

  void _reload() {
    final store = RealtimeStore.instance;
    _questions = store.questionsFor(widget.product.uuid);
    _reviews = store.reviewsFor(widget.product.uuid);
  }

  /// The freshest copy of this listing (live price/stock), else what we were given.
  Product get _p => productByUuid(widget.product.uuid) ?? widget.product;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(listenable: RealtimeStore.instance, builder: (_, __) => _content(context));
  }

  Widget _content(BuildContext context) {
    final s = Strings.of(context);
    final lang = s.lang;
    final p = _p;
    final listed = productByUuid(p.uuid) != null;
    final wished = RealtimeStore.instance.wishlistIds.contains(p.uuid);
    final save = p.originalPrice - p.price;
    final maxQty = p.stock.clamp(1, 20);
    if (_qty > maxQty) _qty = maxQty;

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 360,
            pinned: true,
            backgroundColor: AppColors.background,
            leading: Padding(
              padding: const EdgeInsets.all(8),
              child: CircleIconButton(icon: Icons.arrow_back_rounded, background: Colors.white, onTap: () => Navigator.pop(context)),
            ),
            actions: [
              CircleIconButton(
                icon: wished ? Icons.favorite_rounded : Icons.favorite_border_rounded,
                color: wished ? AppColors.accent : AppColors.ink,
                background: Colors.white,
                onTap: () => RealtimeStore.instance.toggleWishlist(p.uuid),
              ),
              const SizedBox(width: 12),
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: Hero(tag: 'product-${p.id}', child: ProductImage(product: p, iconSize: 130)),
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
                    Row(children: [
                      Pill(p.displayCategory(lang), color: AppColors.primary.withValues(alpha: 0.10), textColor: AppColors.primary, fontSize: 11.5),
                      const Spacer(),
                      _stockBadge(s, p, listed),
                    ]),
                    const SizedBox(height: 12),
                    Text(p.displayName(lang), style: Theme.of(context).textTheme.headlineSmall),
                    if (p.nameIsMachine(lang)) const MachineNote(key: ValueKey('machine-note-name')),
                    const SizedBox(height: 10),
                    if (p.reviews > 0)
                      Row(children: [
                        RatingPill(p.rating),
                        const SizedBox(width: 8),
                        Text('${s.number(p.rating, decimals: 1)} · ${compact(p.reviews)} ${s.reviewsLabel}',
                            style: const TextStyle(color: AppColors.muted, fontSize: 13, fontWeight: FontWeight.w500)),
                      ]),
                    const SizedBox(height: 16),
                    Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(money(p.price),
                            style: const TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: AppColors.ink, letterSpacing: -1)),
                        if (secondaryMoney(p.price) != null)
                          Text(secondaryMoney(p.price)!, style: const TextStyle(fontSize: 12.5, color: AppColors.muted, fontWeight: FontWeight.w600)),
                      ]),
                      if (save > 0) ...[
                        const SizedBox(width: 10),
                        Padding(
                          padding: const EdgeInsets.only(bottom: 5),
                          child: Text(money(p.originalPrice),
                              style: const TextStyle(fontSize: 15, color: AppColors.faint, decoration: TextDecoration.lineThrough)),
                        ),
                        Expanded(
                          child: Align(
                            alignment: Alignment.centerRight,
                            child: FittedBox(
                              fit: BoxFit.scaleDown,
                              child: Pill(s.pdSave(money(save)),
                                  color: AppColors.success.withValues(alpha: 0.14), textColor: const Color(0xFF047857), fontSize: 12),
                            ),
                          ),
                        ),
                      ],
                    ]),
                    if (p.priceSource == 'campaign' || p.priceSource == 'flash') ...[
                      const SizedBox(height: 10),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Pill(p.priceSource == 'campaign' ? s.priceCampaign(p.campaignPct) : s.priceFlash,
                            key: const ValueKey('price-source'),
                            color: AppColors.accent.withValues(alpha: 0.14),
                            textColor: AppColors.accentDark,
                            icon: Icons.local_offer_rounded,
                            fontSize: 12),
                      ),
                    ],
                    for (var gi = 0; gi < p.variants.length; gi++) ...[
                      const SizedBox(height: 18),
                      Text(_variantTitle(p, gi, lang),
                          key: ValueKey('variant-title-${p.variants[gi].name}'),
                          style: TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 14.5, color: _pickError == p.variants[gi].name ? AppColors.danger : AppColors.ink)),
                      const SizedBox(height: 8),
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        // Chips read in the shopper's language; what is picked (and bought) is the canonical option.
                        for (var oi = 0; oi < p.variants[gi].options.length; oi++)
                          ChoiceChip(
                            key: ValueKey('variant-${p.variants[gi].name}-${p.variants[gi].options[oi]}'),
                            label: Text(p.variantOptionLabel(gi, oi, lang)),
                            selected: _picks[p.variants[gi].name] == p.variants[gi].options[oi],
                            onSelected: (_) => setState(() {
                              _picks[p.variants[gi].name] = p.variants[gi].options[oi];
                              if (_pickError == p.variants[gi].name) _pickError = null;
                            }),
                          ),
                      ]),
                    ],
                    if (p.variants.isNotEmpty && p.variantsAreMachine(lang)) const MachineNote(key: ValueKey('machine-note-variants')),
                    const SizedBox(height: 22),
                    if (p.inStock)
                      Row(children: [
                        Text(s.quantity, style: Theme.of(context).textTheme.titleMedium),
                        const Spacer(),
                        QuantityStepper(value: _qty, onChanged: (v) => setState(() => _qty = v.clamp(1, maxQty))),
                      ]),
                    const SizedBox(height: 22),
                    // The seller sets the delivery time; the shopper sees it and the date it gives.
                    KeyedSubtree(
                      key: const ValueKey('pd-delivery'),
                      child: _infoCard(
                        Icons.local_shipping_rounded,
                        s.pdDeliveryDays(p.deliveryDays, dayLabel(estimateFor([p.deliveryDays]), s.lang)),
                        s.pdDeliveryInfo,
                      ),
                    ),
                    if (p.displayDescription(lang).isNotEmpty) ...[
                      const SizedBox(height: 24),
                      Text(s.description, style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 8),
                      Text(p.displayDescription(lang),
                          key: const ValueKey('pd-description'), style: const TextStyle(fontSize: 14.5, height: 1.55, color: AppColors.inkSoft)),
                      if (p.descriptionIsMachine(lang)) const MachineNote(key: ValueKey('machine-note-description')),
                    ],
                    if ((p.sellerName ?? '').isNotEmpty) ...[
                      const SizedBox(height: 24),
                      _sellerCard(s, p),
                    ],
                    const SizedBox(height: 24),
                    _reviewsSection(s, p),
                    const SizedBox(height: 24),
                    _qaSection(s, p),
                    const SizedBox(height: 24),
                    _related(s, p, lang),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
      bottomNavigationBar: _bottomBar(s, p, listed),
    );
  }

  /// "Colour" until an option is picked, then "Colour: Black" (both in the shopper's language).
  String _variantTitle(Product p, int gi, String lang) {
    final g = p.variants[gi];
    final group = p.variantGroupLabel(gi, lang);
    final picked = _picks[g.name];
    final oi = picked == null ? -1 : g.options.indexOf(picked);
    return oi == -1 ? group : variantPair(group, p.variantOptionLabel(gi, oi, lang));
  }

  Widget _stockBadge(Strings s, Product p, bool listed) {
    final (label, color) = !listed
        ? (s.pdUnavailable, AppColors.danger)
        : p.stock <= 0
            ? (s.pdOutOfStock, AppColors.danger)
            : p.stock <= 5
                ? (s.pdOnlyLeft(p.stock), const Color(0xFFB45309))
                : (s.inStock, AppColors.success);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.inventory_2_rounded, size: 16, color: color),
      const SizedBox(width: 4),
      Text(label, style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w700)),
    ]);
  }

  Widget _sellerCard(Strings s, Product p) {
    final name = p.sellerName!;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
      child: Row(children: [
        CircleAvatar(
            radius: 22,
            backgroundColor: AppColors.primary.withValues(alpha: 0.12),
            child: Text(name[0].toUpperCase(), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800))),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
            Text(s.pdSoldBy, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ]),
        ),
        if (p.sellerId != null)
          OutlinedButton.icon(
            onPressed: () => Navigator.push(
                context, MaterialPageRoute(builder: (_) => StoreScreen(locale: widget.locale, sellerId: p.sellerId, sellerName: name))),
            icon: const Icon(Icons.storefront_rounded, size: 18),
            label: Text(s.pdVisitStore),
          ),
      ]),
    );
  }

  Widget _reviewsSection(Strings s, Product p) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Text(s.reviewsTitle, style: Theme.of(context).textTheme.titleMedium),
        const Spacer(),
        TextButton.icon(
          onPressed: () async {
            await Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewsScreen(locale: widget.locale, product: p)));
            if (mounted) setState(_reload);
          },
          icon: const Icon(Icons.rate_review_rounded, size: 18),
          style: TextButton.styleFrom(foregroundColor: AppColors.primary),
          label: Text(s.pdSeeAllWrite),
        ),
      ]),
      FutureBuilder<List<ReviewDto>>(
        future: _reviews,
        builder: (_, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator());
          }
          final items = (snap.data ?? const <ReviewDto>[]).take(2).toList();
          if (items.isEmpty) return _hint(s.pdNoReviews);
          return Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
            child: Column(children: [
              for (var i = 0; i < items.length; i++) ...[
                reviewTile(items[i], s),
                if (i != items.length - 1) const Divider(height: 22),
              ],
            ]),
          );
        },
      ),
    ]);
  }

  Widget _qaSection(Strings s, Product p) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        Expanded(child: Text(s.pdQa, style: Theme.of(context).textTheme.titleMedium)),
        TextButton.icon(
          onPressed: () => _askQuestion(s, p),
          icon: const Icon(Icons.help_outline_rounded, size: 18),
          style: TextButton.styleFrom(foregroundColor: AppColors.primary),
          label: Text(s.pdAsk),
        ),
      ]),
      FutureBuilder<List<QuestionDto>>(
        future: _questions,
        builder: (_, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Padding(padding: EdgeInsets.all(12), child: LinearProgressIndicator());
          }
          final qa = snap.data ?? const <QuestionDto>[];
          if (qa.isEmpty) return _hint(s.pdNoQuestions);
          return Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
            child: Column(children: [
              for (int i = 0; i < qa.length; i++) ...[
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.chat_bubble_outline_rounded, size: 16, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Expanded(
                        child: TranslatableText(
                            kind: 'question', id: qa[i].id, text: qa[i].question, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
                  ]),
                  Padding(
                    padding: const EdgeInsets.only(left: 24, top: 4),
                    child: qa[i].answer == null
                        ? Text(s.pdAwaiting, style: const TextStyle(color: AppColors.faint, fontSize: 13, height: 1.35, fontStyle: FontStyle.italic))
                        : TranslatableText(
                            kind: 'answer', id: qa[i].id, text: qa[i].answer!, style: const TextStyle(color: AppColors.inkSoft, fontSize: 13, height: 1.35)),
                  ),
                ]),
                if (i != qa.length - 1) const Divider(height: 22),
              ],
            ]),
          );
        },
      ),
    ]);
  }

  Widget _hint(String text) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.line)),
        child: Text(text, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
      );

  void _askQuestion(Strings s, Product p) {
    final ctrl = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text(s.pdAskTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'PlusJakartaSans')),
          const SizedBox(height: 12),
          TextField(
            controller: ctrl,
            autofocus: true,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: s.pdAskHint,
              filled: true,
              fillColor: AppColors.background,
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
            ),
          ),
          const SizedBox(height: 14),
          FilledButton(
            onPressed: () async {
              final q = ctrl.text.trim();
              if (q.isEmpty) return;
              final messenger = ScaffoldMessenger.of(context);
              Navigator.pop(ctx);
              try {
                await RealtimeStore.instance.askQuestion(p.uuid, q);
                messenger.showSnackBar(SnackBar(content: Text(s.pdQuestionSent)));
                if (mounted) setState(_reload);
              } catch (e) {
                messenger.showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
              }
            },
            child: Text(s.pdSubmitQuestion),
          ),
        ]),
      ),
    );
  }

  Widget _related(Strings s, Product p, String lang) {
    final items = liveCatalog().where((x) => x.sameCategoryAs(p) && x.uuid != p.uuid).take(6).toList();
    if (items.isEmpty) return const SizedBox.shrink();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(s.pdYouMayLike, style: Theme.of(context).textTheme.titleMedium),
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
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.line)),
      child: Row(children: [
        Container(
          height: 40,
          width: 40,
          decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
          child: Icon(icon, color: AppColors.primary, size: 21),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            Text(subtitle, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ]),
        ),
      ]),
    );
  }

  Widget _bottomBar(Strings s, Product p, bool listed) {
    final canBuy = listed && p.inStock;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, 12 + MediaQuery.of(context).padding.bottom),
      decoration: BoxDecoration(
        color: AppColors.surface,
        boxShadow: [BoxShadow(color: const Color(0xFF1E293B).withValues(alpha: 0.08), blurRadius: 20, offset: const Offset(0, -4))],
      ),
      child: Row(children: [
        Container(
          height: 54,
          width: 54,
          decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(16)),
          child: IconButton(
            icon: const Icon(Icons.add_shopping_cart_rounded, color: AppColors.primary),
            onPressed: !canBuy
                ? null
                : () {
                    final variant = _chosenVariant(p, s);
                    if (variant == null) return;
                    final added = ShopState.instance.addToCart(p, variant: variant, qty: _qty);
                    ScaffoldMessenger.of(context)
                      ..hideCurrentSnackBar()
                      ..showSnackBar(SnackBar(
                        persist: false, // auto-dismiss (a SnackBar with an action would otherwise stay until dismissed)
                        content: Text(added < _qty ? s.cartStockCap(p.stock) : s.addedToCart),
                        action: SnackBarAction(
                            label: s.cart, onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(locale: widget.locale)))),
                      ));
                  },
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: FilledButton(
            onPressed: !canBuy
                ? null
                : () {
                    // Buy now = this product only; the saved cart is not touched.
                    final variant = _chosenVariant(p, s);
                    if (variant == null) return;
                    Navigator.push(
                        context,
                        MaterialPageRoute(
                            builder: (_) => CheckoutScreen(locale: widget.locale, lines: [CartItem(product: p, variant: variant, qty: _qty)])));
                  },
            child: Text(canBuy ? '${s.buyNow}  ·  ${money(p.price * _qty)}' : s.pdUnavailable),
          ),
        ),
      ]),
    );
  }
}

/// A single review row (shared by the product page and the reviews screen).
Widget reviewTile(ReviewDto r, Strings s) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [
        CircleAvatar(
            radius: 16,
            backgroundColor: AppColors.primary.withValues(alpha: 0.12),
            child: Text(r.author.isEmpty ? '?' : r.author[0].toUpperCase(),
                style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 13))),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(r.author, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            Row(children: List.generate(5, (i) => Icon(i < r.rating ? Icons.star_rounded : Icons.star_border_rounded, size: 14, color: AppColors.amber))),
          ]),
        ),
      ]),
      const SizedBox(height: 8),
      TranslatableText(kind: 'review', id: r.id, text: r.text, style: const TextStyle(fontSize: 13.5, height: 1.4, color: AppColors.inkSoft)),
      if (r.sellerReply != null)
        Container(
          key: const ValueKey('seller-reply'),
          margin: const EdgeInsets.only(top: 10, left: 12),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.primary.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(12),
            border: Border(left: BorderSide(color: AppColors.primary.withValues(alpha: 0.5), width: 3)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(s.reviewSellerReply, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12, color: AppColors.primary)),
            const SizedBox(height: 3),
            TranslatableText(
                kind: 'review_reply', id: r.id, text: r.sellerReply!, style: const TextStyle(fontSize: 13, height: 1.35, color: AppColors.inkSoft)),
          ]),
        ),
    ]);
