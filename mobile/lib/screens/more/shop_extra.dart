import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../data/catalog_meta.dart';
import '../../data/shop_state.dart';
import '../../theme/app_theme.dart';
import '../../l10n/strings.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';
import 'catalog_extra.dart';
import 'browse.dart';

/// Store front (CF-07) — follow, chat, searchable/filterable products, reviews.
class StoreScreen extends StatefulWidget {
  final Locale locale;
  final Seller? seller;
  const StoreScreen({super.key, this.locale = const Locale('en'), this.seller});
  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  final _ctrl = TextEditingController();
  late final ProductQuery _q = ProductQuery(category: widget.seller == null ? null : sellerCategory(widget.seller!));

  String get _id => widget.seller?.id ?? 'slr-01';
  String get _name => widget.seller?.name ?? 'TechSphere Store';
  String get _initials {
    final parts = _name.split(' ').where((w) => w.isNotEmpty).toList();
    return (parts.length >= 2 ? '${parts[0][0]}${parts[1][0]}' : _name.substring(0, 2)).toUpperCase();
  }

  String get _tagline {
    if (widget.seller == null) return 'Official electronics partner';
    switch (sellerCategory(widget.seller!)) {
      case 'Fashion':
        return 'Fashion & apparel store';
      case 'Jewelery':
        return 'Fine jewelery boutique';
      default:
        return 'Electronics & gadgets store';
    }
  }

  String get _badgeLabel => (widget.seller?.badge ?? SellerBadge.sombaAssured).label;
  int get _health => widget.seller?.health ?? 97;
  String get _rating => (widget.seller?.rating ?? 4.8).toString();
  int get _baseFollowers => widget.seller?.followers ?? 12400;

  List<Product> get _storeProducts => widget.seller == null
      ? products
      : products.where((p) => p.category == sellerCategory(widget.seller!)).toList();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lang = widget.locale.languageCode;
    _q.text = _ctrl.text;
    final items = runQuery(_storeProducts, _q);
    return Scaffold(
      body: CustomScrollView(slivers: [
        SliverToBoxAdapter(child: _header()),
        SliverToBoxAdapter(child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Row(children: [
            Expanded(child: BrowseSearchField(controller: _ctrl, hint: '${trl(lang, 'Search')} · $_name', onChanged: (_) => setState(() {}))),
            const SizedBox(width: 10),
            _filterButton(),
          ]),
        )),
        SliverToBoxAdapter(child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 8, 16, 0),
          child: Align(alignment: Alignment.centerLeft, child: Text('${items.length} ${trl(lang, 'products')}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600))),
        )),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
          sliver: items.isEmpty
              ? SliverToBoxAdapter(child: Padding(padding: const EdgeInsets.only(top: 40), child: Center(child: Text(trl(lang, 'No products match your filters'), style: const TextStyle(color: AppColors.muted)))))
              : SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
                  delegate: SliverChildBuilderDelegate((_, i) => ProductCard(product: items[i], lang: lang), childCount: items.length),
                ),
        ),
      ]),
    );
  }

  Widget _filterButton() {
    final n = _q.activeCount;
    return GestureDetector(
      onTap: () async {
        final res = await showFilterSheet(context, _q);
        if (res != null) {
          setState(() {
            _q.sort = res.sort; _q.category = res.category;
            _q.minPrice = res.minPrice; _q.maxPrice = res.maxPrice;
            _q.minRating = res.minRating; _q.dealsOnly = res.dealsOnly;
          });
        }
      },
      child: Container(
        height: 48, width: 48,
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: n > 0 ? AppColors.primary : AppColors.line)),
        child: Icon(Icons.tune_rounded, color: n > 0 ? AppColors.primary : AppColors.muted),
      ),
    );
  }

  Widget _header() {
    final top = MediaQuery.of(context).padding.top;
    final lang = widget.locale.languageCode;
    final following = ShopState.instance.followedStores.contains(_id);
    final followers = _baseFollowers + (following ? 1 : 0);
    return Container(
      padding: EdgeInsets.fromLTRB(20, top + 12, 20, 20),
      decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(28))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleIconButton(icon: Icons.arrow_back_rounded, background: Colors.white.withValues(alpha: 0.2), color: Colors.white, onTap: () => Navigator.maybePop(context)),
          const Spacer(),
          CircleIconButton(icon: Icons.share_rounded, background: Colors.white.withValues(alpha: 0.2), color: Colors.white,
              onTap: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(trl(lang, 'Store link copied'))))),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Container(height: 62, width: 62, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
            child: Center(child: Text(_initials, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 22, fontFamily: 'PlusJakartaSans')))),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Flexible(child: Text(_name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800))),
              const SizedBox(width: 6),
              const Icon(Icons.verified_rounded, color: Colors.white, size: 18),
            ]),
            const SizedBox(height: 2),
            Text(trl(lang, _tagline), style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12.5)),
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.22), borderRadius: BorderRadius.circular(100)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.verified_rounded, color: Colors.white, size: 13),
                const SizedBox(width: 4),
                Text('$_badgeLabel · $_health% ${trl(lang, 'health')}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 10.5)),
              ]),
            ),
          ])),
        ]),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16)),
          child: Row(children: [
            _stat('$_rating★', trl(lang, 'Rating'), onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewsScreen(locale: widget.locale)))),
            _div(),
            _stat('${_storeProducts.length}', trl(lang, 'Products')),
            _div(),
            _stat('${(followers / 1000).toStringAsFixed(1)}k', trl(lang, 'Followers')),
          ]),
        ),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: GestureDetector(
            onTap: () {
              setState(() => ShopState.instance.toggleFollow(_id));
              final now = ShopState.instance.followedStores.contains(_id);
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(now ? '${trl(lang, 'Following')} · $_name' : _name)));
            },
            child: _btn(following ? Icons.check_rounded : Icons.add_rounded, following ? trl(lang, 'Following') : trl(lang, 'Follow'), true))),
          const SizedBox(width: 12),
          Expanded(child: GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SellerChatScreen(storeName: _name))),
            child: _btn(Icons.chat_bubble_outline_rounded, trl(lang, 'Chat'), false))),
        ]),
      ]),
    );
  }

  Widget _stat(String v, String l, {VoidCallback? onTap}) => Expanded(
        child: GestureDetector(
          onTap: onTap,
          behavior: HitTestBehavior.opaque,
          child: Column(children: [
            Text(v, style: const TextStyle(color: Colors.white, fontSize: 16.5, fontWeight: FontWeight.w800)),
            Text(l, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11.5)),
          ]),
        ),
      );
  Widget _div() => Container(width: 1, height: 28, color: Colors.white.withValues(alpha: 0.25));
  Widget _btn(IconData i, String l, bool filled) => Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(color: filled ? Colors.white : Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(14)),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(i, size: 18, color: filled ? AppColors.primary : Colors.white),
          const SizedBox(width: 6),
          Text(l, style: TextStyle(color: filled ? AppColors.primary : Colors.white, fontWeight: FontWeight.w700, fontSize: 13.5)),
        ]),
      );
}

/// Chat with a seller/store (mock).
class SellerChatScreen extends StatefulWidget {
  final String storeName;
  const SellerChatScreen({super.key, required this.storeName});
  @override
  State<SellerChatScreen> createState() => _SellerChatScreenState();
}

class _SellerChatScreenState extends State<SellerChatScreen> {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<(String, bool)> _msgs = [
    ('Hello! Welcome to our store. How can we help you today?', false),
    ('Do you deliver to Gombe?', true),
    ('Yes — same-day delivery in Gombe on orders before 4pm.', false),
  ];

  @override
  void dispose() {
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send() {
    final t = _ctrl.text.trim();
    if (t.isEmpty) return;
    setState(() {
      _msgs.add((t, true));
      _ctrl.clear();
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, widget.storeName),
      body: Column(children: [
        Expanded(child: ListView.builder(
          controller: _scroll,
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
          itemCount: _msgs.length,
          itemBuilder: (_, i) {
            final m = _msgs[i];
            final mine = m.$2;
            return Align(
              alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
              child: Container(
                margin: const EdgeInsets.only(bottom: 10),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
                decoration: BoxDecoration(
                  color: mine ? AppColors.primary : AppColors.surface,
                  borderRadius: BorderRadius.only(
                    topLeft: const Radius.circular(16), topRight: const Radius.circular(16),
                    bottomLeft: Radius.circular(mine ? 16 : 4), bottomRight: Radius.circular(mine ? 4 : 16),
                  ),
                  boxShadow: mine ? null : AppShadow.card,
                ),
                child: Text(tr(context, m.$1), style: TextStyle(color: mine ? Colors.white : AppColors.ink, fontSize: 13.5, height: 1.35)),
              ),
            );
          },
        )),
        SafeArea(top: false, child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
          child: Row(children: [
            Expanded(child: TextField(
              controller: _ctrl,
              onSubmitted: (_) => _send(),
              decoration: InputDecoration(
                hintText: tr(context, 'Message the store…'),
                filled: true, fillColor: AppColors.surface,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.line)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.primary, width: 1.4)),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.line)),
              ),
            )),
            const SizedBox(width: 8),
            Material(color: AppColors.primary, shape: const CircleBorder(), child: InkWell(
              customBorder: const CircleBorder(), onTap: _send,
              child: const Padding(padding: EdgeInsets.all(13), child: Icon(Icons.send_rounded, color: Colors.white, size: 22)),
            )),
          ]),
        )),
      ]),
    );
  }
}

/// Product reviews + write a review (CF-27).
class ReviewsScreen extends StatefulWidget {
  final Locale locale;
  const ReviewsScreen({super.key, this.locale = const Locale('en')});
  @override
  State<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends State<ReviewsScreen> {
  Locale get locale => widget.locale;
  @override
  Widget build(BuildContext context) {
    final lang = locale.languageCode;
    final reviews = ShopState.instance.reviews;
    final avg = reviews.isEmpty ? 4.8 : reviews.fold<int>(0, (s, r) => s + r.stars) / reviews.length;
    return Scaffold(
      appBar: backAppBar(context, trl(lang, 'Reviews')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Panel(child: Row(children: [
          Column(children: [
            Text(avg.toStringAsFixed(1), style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', height: 1)),
            const SizedBox(height: 4),
            RatingPill(avg),
            const SizedBox(height: 4),
            Text('${reviews.length} ${trl(lang, 'reviews')}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
          ]),
          const SizedBox(width: 20),
          Expanded(child: Column(children: List.generate(5, (i) {
            final star = 5 - i;
            final pct = [0.82, 0.12, 0.03, 0.02, 0.01][i];
            return Padding(padding: const EdgeInsets.symmetric(vertical: 2), child: Row(children: [
              Text('$star', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
              const Icon(Icons.star_rounded, size: 12, color: AppColors.amber),
              const SizedBox(width: 6),
              Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(100), child: LinearProgressIndicator(value: pct, minHeight: 6, backgroundColor: AppColors.line, color: AppColors.amber))),
            ]));
          }))),
        ])),
        const SizedBox(height: 14),
        ...reviews.map((r) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            CircleAvatar(radius: 18, backgroundColor: AppColors.primary.withValues(alpha: 0.12), child: Text(r.name[0], style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800))),
            const SizedBox(width: 10),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(r.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
              Row(children: List.generate(5, (i) => Icon(i < r.stars ? Icons.star_rounded : Icons.star_border_rounded, size: 14, color: AppColors.amber))),
            ])),
            Text(r.date, style: const TextStyle(color: AppColors.faint, fontSize: 11.5)),
          ]),
          const SizedBox(height: 8),
          Text(r.text, style: const TextStyle(fontSize: 13.5, height: 1.4, color: AppColors.inkSoft)),
          if (r.photos > 0) ...[
            const SizedBox(height: 8),
            Row(children: List.generate(r.photos, (i) => Container(
              margin: const EdgeInsets.only(right: 8),
              height: 54, width: 54,
              decoration: BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.circular(10), border: Border.all(color: AppColors.line)),
              child: const Icon(Icons.image_rounded, color: AppColors.faint, size: 22),
            ))),
          ],
        ])))),
      ]),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: PrimaryButton(trl(lang, 'Write a review'),
            icon: Icons.rate_review_rounded,
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewComposeScreen(locale: locale)));
              if (mounted) setState(() {});
            }),
      ),
    );
  }
}

/// Dedicated payment screen with a failure/retry state (CF-11).
class PaymentScreen extends StatelessWidget {
  final Locale locale;
  final bool failed;
  const PaymentScreen({super.key, this.locale = const Locale('en'), this.failed = false});
  @override
  Widget build(BuildContext context) {
    const methods = [
      ('Credit / Debit Card', Icons.credit_card_rounded, true),
      ('Airtel Money', Icons.smartphone_rounded, false),
      ('M-Pesa', Icons.account_balance_wallet_rounded, false),
    ];
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'Payment')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        if (failed)
          Container(
            padding: const EdgeInsets.all(14),
            margin: const EdgeInsets.only(bottom: 14),
            decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.accent.withValues(alpha: 0.3))),
            child: Row(children: [
              const Icon(Icons.error_outline_rounded, color: AppColors.accentDark),
              const SizedBox(width: 10),
              Expanded(child: Text(tr(context, 'Payment failed. No money was taken — please try another method.'), style: const TextStyle(color: AppColors.accentDark, fontWeight: FontWeight.w600, fontSize: 12.5))),
            ]),
          ),
        Panel(child: Column(children: [
          _row(tr(context, 'Order total'), '\$1,104'),
          const SizedBox(height: 8),
          _row(tr(context, 'Delivery'), '\$5'),
          const Divider(height: 22),
          _row(tr(context, 'To pay'), '\$1,109', bold: true),
        ])),
        const SizedBox(height: 16),
        Text(tr(context, 'Payment method'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ...methods.map((m) => Padding(padding: const EdgeInsets.only(bottom: 10), child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: m.$3 ? AppColors.primary : AppColors.line, width: m.$3 ? 1.8 : 1.2)),
          child: Row(children: [
            Icon(m.$2, color: m.$3 ? AppColors.primary : AppColors.muted, size: 22),
            const SizedBox(width: 12),
            Expanded(child: Text(m.$1, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: m.$3 ? AppColors.ink : AppColors.inkSoft))),
            Icon(m.$3 ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: m.$3 ? AppColors.primary : AppColors.faint, size: 22),
          ]),
        ))),
      ]),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: PrimaryButton(failed ? 'Retry payment · \$1,109' : 'Pay \$1,109',
            icon: Icons.lock_rounded,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(failed ? 'Retrying payment…' : 'Payment successful')));
              Navigator.maybePop(context);
            }),
      ),
    );
  }

  Widget _row(String l, String v, {bool bold = false}) => Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text(l, style: TextStyle(fontSize: bold ? 15 : 13.5, fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? AppColors.ink : AppColors.muted)),
        Text(v, style: TextStyle(fontSize: bold ? 17 : 13.5, fontWeight: FontWeight.w800, color: bold ? AppColors.primary : AppColors.ink)),
      ]);
}
