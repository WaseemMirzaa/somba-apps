import 'package:flutter/material.dart';
import '../../data/catalog_live.dart';
import '../../data/catalog_models.dart';
import '../../services/models.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';
import '../../widgets/product_card.dart';
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

  String get _name => (_seller?['name'] as String?) ?? widget.sellerName ?? 'Store';
  String get _initials {
    final parts = _name.split(' ').where((w) => w.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return (parts.length >= 2 ? '${parts[0][0]}${parts[1][0]}' : _name.substring(0, _name.length >= 2 ? 2 : 1)).toUpperCase();
  }

  static String _badge(String? b) => switch (b) {
        'gold' => 'Gold seller',
        'silver' => 'Silver seller',
        'somba_assured' => 'Somba Assured',
        'bronze' => 'Bronze seller',
        _ => '',
      };

  @override
  Widget build(BuildContext context) {
    final lang = widget.locale.languageCode;
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final items = liveCatalog().where((p) => p.sellerId == widget.sellerId).toList();
        final rating = (_seller?['rating'] as num?)?.toDouble() ?? 0;
        final badge = _badge(_seller?['badge'] as String?);
        return Scaffold(
          body: CustomScrollView(slivers: [
            SliverToBoxAdapter(child: _header(context, items.length, rating, badge)),
            if (items.isEmpty)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: Text('No products listed right now.', style: TextStyle(color: AppColors.muted))))
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                sliver: SliverGrid(
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
                  delegate: SliverChildBuilderDelegate((_, i) => ProductCard(product: items[i], lang: lang), childCount: items.length),
                ),
              ),
          ]),
        );
      },
    );
  }

  Widget _header(BuildContext context, int count, double rating, String badge) {
    final top = MediaQuery.of(context).padding.top;
    return Container(
      padding: EdgeInsets.fromLTRB(20, top + 12, 20, 20),
      decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(28))),
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
              child: Center(child: Text(_initials, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 22, fontFamily: 'PlusJakartaSans')))),
          const SizedBox(width: 14),
          Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 19, fontWeight: FontWeight.w800)),
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
            if (rating > 0) ...[_stat('${rating.toStringAsFixed(1)}★', 'Rating'), _div()],
            _stat('$count', 'Products'),
          ]),
        ),
      ]),
    );
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
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Reviews'),
      body: FutureBuilder<List<ReviewDto>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          final reviews = snap.data ?? const <ReviewDto>[];
          final avg = reviews.isEmpty ? 0.0 : reviews.fold<int>(0, (s, r) => s + r.rating) / reviews.length;
          return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            if (reviews.isNotEmpty)
              Panel(
                  child: Row(children: [
                Column(children: [
                  Text(avg.toStringAsFixed(1), style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans', height: 1)),
                  const SizedBox(height: 4),
                  RatingPill(avg),
                  const SizedBox(height: 4),
                  Text('${reviews.length} review${reviews.length == 1 ? '' : 's'}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
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
              const Panel(child: Text('No reviews yet — be the first.', style: TextStyle(color: AppColors.muted))),
            const SizedBox(height: 14),
            ...reviews.map((r) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Panel(child: reviewTile(r)))),
          ]);
        },
      ),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: PrimaryButton('Write a review',
            icon: Icons.rate_review_rounded,
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => ReviewComposeScreen(locale: widget.locale, product: widget.product)));
              if (mounted) setState(() => _future = RealtimeStore.instance.reviewsFor(widget.product.uuid));
            }),
      ),
    );
  }
}
