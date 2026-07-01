import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/product_card.dart';

/// CF-04 — Product list / category results (grid with sort affordances).
class ProductListScreen extends StatefulWidget {
  final Locale locale;
  final String? category;
  final String? title;
  const ProductListScreen({super.key, this.locale = const Locale('en'), this.category, this.title});
  @override
  State<ProductListScreen> createState() => _ProductListScreenState();
}

class _ProductListScreenState extends State<ProductListScreen> {
  int _sort = 0;
  static const _sorts = ['Popular', 'Price ↑', 'Price ↓', 'Top rated'];

  @override
  Widget build(BuildContext context) {
    final lang = widget.locale.languageCode;
    final items = [
      ...products.where((p) => widget.category == null || p.category == widget.category),
    ];
    switch (_sort) {
      case 1:
        items.sort((a, b) => a.price.compareTo(b.price));
        break;
      case 2:
        items.sort((a, b) => b.price.compareTo(a.price));
        break;
      case 3:
        items.sort((a, b) => b.rating.compareTo(a.rating));
        break;
    }
    return Scaffold(
      appBar: backAppBar(context, widget.title ?? widget.category ?? 'Products'),
      body: Column(
        children: [
          SizedBox(
            height: 44,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              itemCount: _sorts.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) {
                final sel = _sort == i;
                return GestureDetector(
                  onTap: () => setState(() => _sort = i),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: sel ? AppColors.primary : AppColors.surface,
                      borderRadius: BorderRadius.circular(100),
                      border: Border.all(color: sel ? AppColors.primary : AppColors.line),
                    ),
                    child: Text(_sorts[i],
                        style: TextStyle(color: sel ? Colors.white : AppColors.inkSoft, fontWeight: FontWeight.w700, fontSize: 12.5)),
                  ),
                );
              },
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
            child: Row(children: [
              Text('${items.length} items', style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600)),
            ]),
          ),
          Expanded(
            child: GridView.builder(
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
