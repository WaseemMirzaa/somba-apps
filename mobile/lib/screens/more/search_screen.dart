import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../data/catalog_live.dart';
import '../../data/catalog_meta.dart';
import '../../theme/app_theme.dart';
import '../../widgets/product_card.dart';
import 'browse.dart';
import 'shop_extra.dart';

/// Functional search over products and sellers, with live filtering and an
/// AliExpress-style filter sheet (CF-05 / CF-06).
class SearchScreen extends StatefulWidget {
  final Locale locale;
  final String? initialText;
  final int initialTab; // 0 products · 1 stores
  const SearchScreen({super.key, this.locale = const Locale('en'), this.initialText, this.initialTab = 0});
  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  late final TextEditingController _ctrl = TextEditingController(text: widget.initialText ?? '');
  late final ProductQuery _q = ProductQuery(text: widget.initialText ?? '');
  late int _tab = widget.initialTab;

  static const _quickSorts = ['Relevance', 'Price ↑', 'Price ↓', 'Top rated', 'Deals'];

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final lang = widget.locale.languageCode;
    _q.text = _ctrl.text;
    final results = runQuery(liveCatalog(), _q);
    final t = _ctrl.text.trim().toLowerCase();
    final stores = allSellers.where((s) => t.isEmpty || s.name.toLowerCase().contains(t)).toList();

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => Navigator.maybePop(context)),
        title: Padding(
          padding: const EdgeInsets.only(right: 12),
          child: BrowseSearchField(
            controller: _ctrl,
            hint: 'Search products or stores…',
            autofocus: widget.initialText == null,
            onChanged: (_) => setState(() {}),
          ),
        ),
      ),
      body: Column(children: [
        // Products / Stores toggle
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
          child: Row(children: [
            _seg('Products', 0), const SizedBox(width: 8), _seg('Stores', 1),
            const Spacer(),
            if (_tab == 0)
              _filterButton(),
          ]),
        ),
        if (_tab == 0) _quickSortRow(),
        Expanded(child: _tab == 0 ? _productResults(results, lang) : _storeResults(stores)),
      ]),
    );
  }

  Widget _seg(String label, int i) {
    final sel = _tab == i;
    return GestureDetector(
      onTap: () => setState(() => _tab = i),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 9),
        decoration: BoxDecoration(
          gradient: sel ? AppColors.brandGradient : null,
          color: sel ? null : AppColors.surface,
          borderRadius: BorderRadius.circular(100),
          border: Border.all(color: sel ? Colors.transparent : AppColors.line),
        ),
        child: Text(label, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: sel ? Colors.white : AppColors.muted)),
      ),
    );
  }

  Widget _filterButton() {
    final n = _q.activeCount;
    return GestureDetector(
      onTap: () async {
        final res = await showFilterSheet(context, _q);
        if (res != null) {
          setState(() {
            _q.sort = res.sort;
            _q.category = res.category;
            _q.minPrice = res.minPrice;
            _q.maxPrice = res.maxPrice;
            _q.minRating = res.minRating;
            _q.dealsOnly = res.dealsOnly;
          });
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(100), border: Border.all(color: n > 0 ? AppColors.primary : AppColors.line)),
        child: Row(children: [
          Icon(Icons.tune_rounded, size: 16, color: n > 0 ? AppColors.primary : AppColors.muted),
          const SizedBox(width: 5),
          Text(n > 0 ? 'Filters · $n' : 'Filters', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: n > 0 ? AppColors.primary : AppColors.muted)),
        ]),
      ),
    );
  }

  Widget _quickSortRow() => SizedBox(
        height: 40,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          itemCount: _quickSorts.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, i) {
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
                padding: const EdgeInsets.symmetric(horizontal: 14),
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: active ? AppColors.primary : AppColors.surface,
                  borderRadius: BorderRadius.circular(100),
                  border: Border.all(color: active ? AppColors.primary : AppColors.line),
                ),
                child: Text(_quickSorts[i], style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: active ? Colors.white : AppColors.muted)),
              ),
            );
          },
        ),
      );

  Widget _productResults(List<Product> results, String lang) {
    if (results.isEmpty) return _empty('No products match “${_ctrl.text}”');
    return CustomScrollView(slivers: [
      SliverToBoxAdapter(child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),
        child: Text('${results.length} results', style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 13)),
      )),
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
        sliver: SliverGrid(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
          delegate: SliverChildBuilderDelegate((_, i) => ProductCard(product: results[i], lang: lang), childCount: results.length),
        ),
      ),
    ]);
  }

  Widget _storeResults(List<Seller> stores) {
    if (stores.isEmpty) return _empty('No stores match “${_ctrl.text}”');
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: stores.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final s = stores[i];
        return GestureDetector(
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StoreScreen(locale: widget.locale, seller: s))),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18), boxShadow: AppShadow.card),
            child: Row(children: [
              CircleAvatar(radius: 24, backgroundColor: AppColors.primary.withValues(alpha: 0.12), child: Text(s.name[0], style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 18))),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                const SizedBox(height: 2),
                Row(children: [
                  const Icon(Icons.star_rounded, size: 14, color: AppColors.amber),
                  const SizedBox(width: 3),
                  Text('${s.rating} · ${s.badge.label}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ]),
              ])),
              const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
            ]),
          ),
        );
      },
    );
  }

  Widget _empty(String msg) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.search_off_rounded, size: 48, color: AppColors.faint),
          const SizedBox(height: 10),
          Text(msg, style: const TextStyle(color: AppColors.muted)),
        ]),
      );
}
