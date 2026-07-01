import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../theme/app_theme.dart';
import '../../widgets/product_card.dart';

/// Search + results with quick filters (CF-05 / CF-06). Also serves as the
/// filterable product-list (PLP) surface.
class SearchScreen extends StatefulWidget {
  final Locale locale;
  const SearchScreen({super.key, this.locale = const Locale('en')});
  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  int _filter = 0;
  final _filters = ['All', 'Price ↑', 'Top rated', 'Big deals', 'Under \$100'];

  @override
  Widget build(BuildContext context) {
    final lang = widget.locale.languageCode;
    List<Product> items = [...products];
    if (_filter == 1) items.sort((a, b) => a.price.compareTo(b.price));
    if (_filter == 2) items.sort((a, b) => b.rating.compareTo(a.rating));
    if (_filter == 3) items = items.where((p) => p.discount >= 20).toList();
    if (_filter == 4) items = items.where((p) => p.price < 100).toList();

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => Navigator.maybePop(context)),
        title: Container(
          height: 44,
          margin: const EdgeInsets.only(right: 16),
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(100), border: Border.all(color: AppColors.line)),
          child: Row(children: const [
            Icon(Icons.search_rounded, color: AppColors.muted, size: 20),
            SizedBox(width: 8),
            Text('Galaxy S24', style: TextStyle(fontSize: 14.5, fontWeight: FontWeight.w500)),
            Spacer(),
            Icon(Icons.close_rounded, color: AppColors.faint, size: 18),
          ]),
        ),
      ),
      body: CustomScrollView(
        slivers: [
          SliverToBoxAdapter(
            child: SizedBox(
              height: 42,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 4, 16, 4),
                itemCount: _filters.length,
                separatorBuilder: (_, __) => const SizedBox(width: 8),
                itemBuilder: (_, i) {
                  final sel = _filter == i;
                  return GestureDetector(
                    onTap: () => setState(() => _filter = i),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        gradient: sel ? AppColors.brandGradient : null,
                        color: sel ? null : AppColors.surface,
                        borderRadius: BorderRadius.circular(100),
                        border: Border.all(color: sel ? Colors.transparent : AppColors.line),
                      ),
                      child: Row(children: [
                        if (i == 0) Icon(Icons.tune_rounded, size: 15, color: sel ? Colors.white : AppColors.muted),
                        if (i == 0) const SizedBox(width: 5),
                        Text(_filters[i], style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: sel ? Colors.white : AppColors.muted)),
                      ]),
                    ),
                  );
                },
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Text('${items.length} results',
                  style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 13)),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
              delegate: SliverChildBuilderDelegate(
                (_, i) => ProductCard(product: items[i], lang: lang),
                childCount: items.length,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
