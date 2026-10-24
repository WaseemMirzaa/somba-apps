import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../data/catalog_models.dart';
import '../../data/catalog_live.dart';
import '../../l10n/strings.dart';
import '../../services/realtime_store.dart';
import '../../data/promos.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';
import '../../widgets/product_actions.dart';
import 'browse.dart';

/// Coupons / promo codes the admin has published (`promos:list`). The code is
/// validated by the server in the cart and again when the order is placed.
class CouponsScreen extends StatefulWidget {
  final Locale locale;
  const CouponsScreen({super.key, this.locale = const Locale('en')});
  @override
  State<CouponsScreen> createState() => _CouponsScreenState();
}

class _CouponsScreenState extends State<CouponsScreen> {
  late final Future<List<Promo>> _future =
      RealtimeStore.instance.listPromos().then((rows) => rows.where((r) => r['active'] != false).map(Promo.fromJson).toList());

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Scaffold(
      appBar: backAppBar(context, s.couponsTitle),
      body: FutureBuilder<List<Promo>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          final promos = snap.data ?? const <Promo>[];
          return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            if (promos.isEmpty) Panel(child: Text(s.couponsNone, style: const TextStyle(color: AppColors.muted))),
            ...promos.map((p) => Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Panel(
                    child: Row(children: [
                      Container(
                        height: 48,
                        width: 48,
                        decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(14)),
                        child: const Icon(Icons.local_offer_rounded, color: AppColors.primary),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(p.code, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, letterSpacing: 0.5)),
                        const SizedBox(height: 2),
                        Text(p.describe(s), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                        if (p.minOrderUsd > 0) Text(s.couponMinOrder(money(p.minOrderUsd)), style: const TextStyle(color: AppColors.faint, fontSize: 11.5)),
                      ])),
                      TextButton.icon(
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: p.code));
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.couponCopied(p.code))));
                        },
                        icon: const Icon(Icons.copy_rounded, size: 15),
                        label: Text(s.copy),
                      ),
                    ]),
                  ),
                )),
            const SizedBox(height: 4),
            Panel(
              child: Row(children: [
                const Icon(Icons.info_outline_rounded, color: AppColors.primary, size: 20),
                const SizedBox(width: 10),
                Expanded(child: Text(s.couponHint, style: const TextStyle(color: AppColors.inkSoft, fontSize: 12.5, height: 1.3))),
              ]),
            ),
          ]);
        },
      ),
    );
  }
}

/// CF-04 — Product list / category results (grid with sort affordances).
class ProductListScreen extends StatefulWidget {
  final Locale locale;
  final String? category;

  /// The category's id: the products are matched by it when they carry one, and the title is localized from it.
  final String? categoryId;
  final String? title;
  final bool dealsOnly;
  const ProductListScreen({super.key, this.locale = const Locale('en'), this.category, this.categoryId, this.title, this.dealsOnly = false});
  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  final _ctrl = TextEditingController();
  late final ProductQuery _q = ProductQuery(category: widget.category, categoryId: widget.categoryId, dealsOnly: widget.dealsOnly);
  List<String> _quickSorts(Strings s) => [s.sortPopular, s.sortPriceAsc, s.sortPriceDesc, s.sortTopRated, s.sortDeals];

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(listenable: RealtimeStore.instance, builder: (_, __) => _scaffold(context));
  }

  Widget _scaffold(BuildContext context) {
    final s = Strings.of(context);
    final sorts = _quickSorts(s);
    _q.text = _ctrl.text;
    final items = runQuery(liveCatalog(), _q);
    // The category's name in the app language (L16), never the English key.
    final hasCategory = widget.category != null || widget.categoryId != null;
    final categoryName = hasCategory ? categoryTitle(id: widget.categoryId, name: widget.category, lang: s.lang) : '';
    return Scaffold(
      appBar: backAppBar(context, widget.title ?? (categoryName.isNotEmpty ? categoryName : s.products)),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
            child: BrowseSearchField(controller: _ctrl, hint: categoryName.isNotEmpty ? s.searchInCat(categoryName) : s.search, onChanged: (_) => setState(() {})),
          ),
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
              itemCount: sorts.length + 1,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, idx) {
                if (idx == 0) {
                  final n = _q.activeCount;
                  return GestureDetector(
                    onTap: () async {
                      final res = await showFilterSheet(context, _q);
                      if (res != null) {
                        setState(() {
                          _q.sort = res.sort;
                          _q.takeCategory(res);
                          _q.minPrice = res.minPrice; _q.maxPrice = res.maxPrice;
                          _q.minRating = res.minRating; _q.dealsOnly = res.dealsOnly;
                        });
                      }
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(100), border: Border.all(color: n > 0 ? AppColors.primary : AppColors.line)),
                      child: Row(children: [
                        Icon(Icons.tune_rounded, size: 15, color: n > 0 ? AppColors.primary : AppColors.muted),
                        const SizedBox(width: 4),
                        Text(n > 0 ? s.filtersN(n) : s.filters, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: n > 0 ? AppColors.primary : AppColors.muted)),
                      ]),
                    ),
                  );
                }
                final i = idx - 1;
                final active = (i < 4 && _q.sort == i) || (i == 4 && _q.dealsOnly);
                return GestureDetector(
                  onTap: () => setState(() {
                    if (i == 4) {
                      _q.dealsOnly = !_q.dealsOnly;
                    } else {
                      _q.sort = i;
                    }
                  }),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: active ? AppColors.primary : AppColors.surface,
                      borderRadius: BorderRadius.circular(100),
                      border: Border.all(color: active ? AppColors.primary : AppColors.line),
                    ),
                    child: Text(sorts[i], style: TextStyle(color: active ? Colors.white : AppColors.inkSoft, fontWeight: FontWeight.w700, fontSize: 12.5)),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 16, 4),
            child: Align(alignment: Alignment.centerLeft, child: Text(s.itemsCount(items.length), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600))),
          ),
          Expanded(
            child: items.isEmpty
                ? Center(child: Text(s.noProductsMatch, style: const TextStyle(color: AppColors.muted)))
                : GridView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
                    itemCount: items.length,
                    itemBuilder: (_, i) => productCard(context, items[i], widget.locale),
                  ),
          ),
        ],
      ),
    );
  }
}

/// CF-27 — Review compose (rating + photo + comment).
class ReviewComposeScreen extends StatefulWidget {
  final Locale locale;
  final Product? product;
  const ReviewComposeScreen({super.key, this.locale = const Locale('en'), this.product});
  @override
  State<ReviewComposeScreen> createState() => _ReviewComposeScreenState();
}

class _ReviewComposeScreenState extends State<ReviewComposeScreen> {
  int _rating = 5;
  final _ctrl = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final p = widget.product;
    if (p == null) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await RealtimeStore.instance.addReview(p.uuid, _rating, _ctrl.text);
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(Strings.of(context).reviewThanks)));
      Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final p = widget.product;
    return Scaffold(
      appBar: backAppBar(context, s.reviewTitle),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        if (p != null)
          Panel(
            child: Row(children: [
              const Icon(Icons.inventory_2_rounded, color: AppColors.primary),
              const SizedBox(width: 12),
              Expanded(child: Text(p.displayName(widget.locale.languageCode), maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
            ]),
          ),
        const SizedBox(height: 18),
        Center(child: Text(s.reviewRate, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
        const SizedBox(height: 12),
        Row(mainAxisAlignment: MainAxisAlignment.center, children: List.generate(5, (i) {
          final on = i < _rating;
          return GestureDetector(
            onTap: () => setState(() => _rating = i + 1),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 6),
              child: Icon(on ? Icons.star_rounded : Icons.star_border_rounded, size: 40, color: on ? AppColors.amber : AppColors.faint),
            ),
          );
        })),
        const SizedBox(height: 20),
        Text(s.reviewYours, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
        const SizedBox(height: 10),
        TextField(
          key: const ValueKey('review-text'),
          controller: _ctrl,
          maxLines: 5,
          decoration: InputDecoration(
            hintText: s.reviewHint,
            filled: true,
            fillColor: AppColors.surface,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
          ),
        ),
        const SizedBox(height: 8),
        Text(s.reviewAfterDelivery, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
        const SizedBox(height: 20),
        PrimaryButton(_busy ? '…' : s.reviewSubmit, icon: Icons.send_rounded, onPressed: _busy ? null : _submit),
      ]),
    );
  }
}
