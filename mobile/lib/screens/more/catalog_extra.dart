import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../data/mock_data.dart';
import '../../data/promos.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';
import '../../widgets/product_card.dart';
import 'browse.dart';

/// Coupons / promo codes available to the customer (mirrors admin promotions).
class CouponsScreen extends StatelessWidget {
  final Locale locale;
  const CouponsScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Coupons'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        ...promos.map((p) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Panel(
                child: Row(children: [
                  Container(
                    height: 48, width: 48,
                    decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(14)),
                    child: const Icon(Icons.local_offer_rounded, color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(p.code, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15, letterSpacing: 0.5)),
                    const SizedBox(height: 2),
                    Text(p.description, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                    if (p.minOrderUsd > 0)
                      Text('Min. order ${money(p.minOrderUsd)}', style: const TextStyle(color: AppColors.faint, fontSize: 11.5)),
                  ])),
                  TextButton.icon(
                    onPressed: () {
                      Clipboard.setData(ClipboardData(text: p.code));
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${p.code} copied')));
                    },
                    icon: const Icon(Icons.copy_rounded, size: 15),
                    label: const Text('Copy'),
                  ),
                ]),
              ),
            )),
        const SizedBox(height: 4),
        const Panel(
          child: Row(children: [
            Icon(Icons.info_outline_rounded, color: AppColors.primary, size: 20),
            SizedBox(width: 10),
            Expanded(child: Text('Apply a coupon code in your cart before checkout.',
                style: TextStyle(color: AppColors.inkSoft, fontSize: 12.5, height: 1.3))),
          ]),
        ),
      ]),
    );
  }
}

/// CF-04 — Product list / category results (grid with sort affordances).
class ProductListScreen extends StatefulWidget {
  final Locale locale;
  final String? category;
  final String? title;
  final bool dealsOnly;
  const ProductListScreen({super.key, this.locale = const Locale('en'), this.category, this.title, this.dealsOnly = false});
  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  final _ctrl = TextEditingController();
  late final ProductQuery _q = ProductQuery(category: widget.category, dealsOnly: widget.dealsOnly);
  static const _quickSorts = ['Popular', 'Price ↑', 'Price ↓', 'Top rated', 'Deals'];

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lang = widget.locale.languageCode;
    _q.text = _ctrl.text;
    final items = runQuery(products, _q);
    return Scaffold(
      appBar: backAppBar(context, widget.title ?? widget.category ?? 'Products'),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
            child: BrowseSearchField(controller: _ctrl, hint: 'Search in ${widget.category ?? 'products'}…', onChanged: (_) => setState(() {})),
          ),
          SizedBox(
            height: 40,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
              itemCount: _quickSorts.length + 1,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, idx) {
                if (idx == 0) {
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
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(100), border: Border.all(color: n > 0 ? AppColors.primary : AppColors.line)),
                      child: Row(children: [
                        Icon(Icons.tune_rounded, size: 15, color: n > 0 ? AppColors.primary : AppColors.muted),
                        const SizedBox(width: 4),
                        Text(n > 0 ? 'Filters · $n' : 'Filters', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: n > 0 ? AppColors.primary : AppColors.muted)),
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
                    child: Text(_quickSorts[i], style: TextStyle(color: active ? Colors.white : AppColors.inkSoft, fontWeight: FontWeight.w700, fontSize: 12.5)),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 16, 4),
            child: Align(alignment: Alignment.centerLeft, child: Text('${items.length} items', style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600))),
          ),
          Expanded(
            child: items.isEmpty
                ? const Center(child: Text('No products match your filters', style: TextStyle(color: AppColors.muted)))
                : GridView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
                    itemCount: items.length,
                    itemBuilder: (_, i) => ProductCard(product: items[i], lang: lang),
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

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    return Scaffold(
      appBar: backAppBar(context, 'Write a review'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        if (p != null)
          Panel(
            child: Row(children: [
              const Icon(Icons.inventory_2_rounded, color: AppColors.primary),
              const SizedBox(width: 12),
              Expanded(child: Text(p.displayName(widget.locale.languageCode),
                  maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14))),
            ]),
          ),
        const SizedBox(height: 18),
        const Center(child: Text('How would you rate it?', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
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
        const Text('Add photos', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
        const SizedBox(height: 10),
        Row(children: [
          _photoBox(),
          const SizedBox(width: 10),
          _photoBox(),
        ]),
        const SizedBox(height: 20),
        const Text('Your review', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
        const SizedBox(height: 10),
        TextField(
          controller: _ctrl,
          maxLines: 5,
          decoration: InputDecoration(
            hintText: 'Share what you liked or what could be better…',
            filled: true,
            fillColor: AppColors.surface,
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.primary, width: 1.4)),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
          ),
        ),
        const SizedBox(height: 20),
        PrimaryButton('Submit review',
            icon: Icons.send_rounded,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Review submitted — pending moderation')));
              Navigator.maybePop(context);
            }),
      ]),
    );
  }

  Widget _photoBox() => Container(
        height: 72,
        width: 72,
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.line),
        ),
        child: const Icon(Icons.add_a_photo_rounded, color: AppColors.primary),
      );
}
