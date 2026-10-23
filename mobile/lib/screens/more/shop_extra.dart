import 'package:flutter/material.dart';
import '../../data/catalog_live.dart';
import '../../data/catalog_models.dart';
import '../../l10n/strings.dart';
import '../../services/models.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
import '../../widgets/product_actions.dart';
import '../product_detail_screen.dart' show reviewTile;
import 'catalog_extra.dart';

/// Store front: the store's live listings, plus its badge/rating when the
/// server publishes them.
class StoreScreen extends StatefulWidget {
  final Locale locale;
  final String? sellerId;
  final String? sellerName;
  const StoreScreen({super.key, this.locale = const Locale('en'), this.sellerId, this.sellerName});

  @override
  State<StoreScreen> createState() => _StoreScreenState();
}

class _StoreScreenState extends State<StoreScreen> {
  Map<String, dynamic>? _seller;

  @override
  void initState() {
    super.initState();
    final id = widget.sellerId;
    if (id != null) {
      RealtimeStore.instance.call('sellers:storefront', {'id': id}).then((res) {
        if (mounted) setState(() => _seller = ((res as Map)['seller'] as Map?)?.map((k, v) => MapEntry(k.toString(), v)));
      }).catchError((_) {});
    }
  }

  String _name(Strings s) => (_seller?['name'] as String?) ?? widget.sellerName ?? s.storeFallback;
  String _initials(Strings s) {
    final name = _name(s);
    final parts = name.split(' ').where((w) => w.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return (parts.length >= 2 ? '${parts[0][0]}${parts[1][0]}' : name.substring(0, name.length >= 2 ? 2 : 1)).toUpperCase();
  }

  static String _badge(Strings s, String? b) => switch (b) {
        'gold' => s.badgeGold,
        'silver' => s.badgeSilver,
        'somba_assured' => s.badgeSombaAssured,
        'bronze' => s.badgeBronze,
        _ => '',
      };

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final s = Strings.of(context);
        final items = liveCatalog().where((p) => p.sellerId == widget.sellerId).toList();
        final rating = (_seller?['rating'] as num?)?.toDouble() ?? 0;
        final badge = _badge(s, _seller?['badge'] as String?);
        return Scaffold(
          body: CustomScrollView(slivers: [
            SliverToBoxAdapter(child: _header(context, s, items.length, rating, badge)),
            if (items.isEmpty)
              SliverFillRemaining(hasScrollBody: false, child: Center(child: Text(s.storeNoProducts, style: const TextStyle(color: AppColors.muted))))
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
                  delegate: SliverChildBuilderDelegate((_, i) => productCard(context, items[i], widget.locale), childCount: items.length),
                ),
              ),
          ]),
        );
      },
    );
  }

  Widget _header(BuildContext context, Strings s, int count, double rating, String badge) {
    final top = MediaQuery.of(context).padding.top;
    final banner = _seller?['bannerUrl'] as String?;
    final logo = _seller?['logoUrl'] as String?;
    final description = (_seller?['description'] as String?)?.trim() ?? '';
    final header = Container(
      padding: EdgeInsets.fromLTRB(20, top + 12, 20, 20),
      decoration: BoxDecoration(
        gradient: banner == null ? AppColors.brandGradient : null,
        borderRadius: const BorderRadius.vertical(bottom: Radius.circular(28)),
        image: banner == null
            ? null
            : DecorationImage(
                image: NetworkImage(banner),
                fit: BoxFit.cover,
                // Keeps the white text readable on any banner.
                colorFilter: ColorFilter.mode(Colors.black.withValues(alpha: 0.38), BlendMode.darken),
                onError: (_, __) {},
              ),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          CircleIconButton(icon: Icons.arrow_back_rounded, background: Colors.white.withValues(alpha: 0.2), color: Colors.white, onTap: () => Navigator.maybePop(context)),
        ]),
        const SizedBox(height: 12),
        Row(children: [
          Container(
              height: 62,
              width: 62,
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
              clipBehavior: Clip.antiAlias,
              child: logo == null
                  ? Center(child: Text(_initials(s), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 22, fontFamily: 'PlusJakartaSans')))
                  : Image.network(logo,
                      key: const ValueKey('store-logo'),
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Center(
                          child: Text(_initials(s), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 22))))),
          const SizedBox(width: 14),
          Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_name(s), maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
            if (badge.isNotEmpty) ...[
              const SizedBox(height: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.22), borderRadius: BorderRadius.circular(100)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.verified_rounded, color: Colors.white, size: 13),
                  const SizedBox(width: 4),
                  Text(badge, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 10.5)),
                ]),
              ),
            ],
          ])),
        ]),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(16)),
          child: Row(children: [
            if (rating > 0) ...[_stat('${s.number(rating, decimals: 1)}★', s.statRating), _div()],
            _stat('$count', s.products),
          ]),
        ),
      ]),
    );
    if (description.isEmpty) return header;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      header,
      Padding(
        padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
        child: Text(description, key: const ValueKey('store-description'), style: const TextStyle(color: AppColors.inkSoft, fontSize: 13.5, height: 1.45)),
      ),
    ]);
  }

  Widget _stat(String v, String l) => Expanded(
          child: Column(children: [
        Text(v, style: const TextStyle(color: Colors.white, fontSize: 16.5, fontWeight: FontWeight.w800)),
        Text(l, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11.5)),
      ]));
  Widget _div() => Container(width: 1, height: 28, color: Colors.white.withValues(alpha: 0.25));
}

/// A product's reviews from real buyers, plus a button to write one.
class ReviewsScreen extends StatefulWidget {
  final Locale locale;
  final Product product;
  const ReviewsScreen({super.key, this.locale = const Locale('en'), required this.product});

  @override
  State<ReviewsScreen> createState() => _ReviewsScreenState();
}

class _ReviewsScreenState extends State<ReviewsScreen> {
  late Future<List<ReviewDto>> _future = RealtimeStore.instance.reviewsFor(widget.product.uuid);

  @override
  void initState() {
    super.initState();
    RealtimeStore.instance.reviewRevision.addListener(_onPush);
  }

  void _onPush() {
    if (mounted) setState(() => _future = RealtimeStore.instance.reviewsFor(widget.product.uuid));
  }

  @override
  void dispose() {
    RealtimeStore.instance.reviewRevision.removeListener(_onPush);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.reviewsTitle),
      body: FutureBuilder<List<ReviewDto>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          final reviews = snap.data ?? const <ReviewDto>[];
          final avg = reviews.isEmpty ? 0.0 : reviews.fold<int>(0, (sum, r) => sum + r.rating) / reviews.length;
          return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            if (reviews.isNotEmpty)
              Panel(
                  child: Row(children: [
                Column(children: [
                  Text(s.number(avg, decimals: 1), style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', height: 1)),
                  const SizedBox(height: 4),
                  RatingPill(avg),
                  const SizedBox(height: 4),
                  Text(reviews.length == 1 ? s.reviewOne(1) : s.reviewMany(reviews.length), style: const TextStyle(color: AppColors.muted, fontSize: 12)),
                ]),
                const SizedBox(width: 20),
                Expanded(
                    child: Column(
                        children: List.generate(5, (i) {
                  final star = 5 - i;
                  final pct = reviews.where((r) => r.rating == star).length / reviews.length;
                  return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Row(children: [
                        Text('$star', style: const TextStyle(fontSize: 11, color: AppColors.muted)),
                        const Icon(Icons.star_rounded, size: 12, color: AppColors.amber),
                        const SizedBox(width: 6),
                        Expanded(child: ClipRRect(borderRadius: BorderRadius.circular(100), child: LinearProgressIndicator(value: pct, minHeight: 6, backgroundColor: AppColors.line, color: AppColors.amber))),
                      ]));
                }))),
              ]))
            else
              Panel(child: Text(s.reviewsNone, style: const TextStyle(color: AppColors.muted))),
            const SizedBox(height: 14),
            ...reviews.map((r) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Panel(child: reviewTile(r, s)))),
          ]);
        },
      ),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: PrimaryButton(s.reviewTitle,
            icon: Icons.rate_review_rounded,
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewComposeScreen(locale: widget.locale, product: widget.product)));
              if (mounted) setState(() => _future = RealtimeStore.instance.reviewsFor(widget.product.uuid));
            }),
      ),
    );
  }
}
