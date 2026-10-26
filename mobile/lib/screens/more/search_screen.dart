import 'dart:async';
import 'package:flutter/material.dart';
import '../../data/catalog_models.dart';
import '../../data/catalog_live.dart';
import '../../l10n/strings.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../util/text_fold.dart';
import '../../widgets/product_actions.dart';
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

  // Server search (`products:search`): ranked ids for the current text, typo- and accent-tolerant. While it is
  // unavailable (offline, old API) the phone filters the downloaded catalogue instead.
  Timer? _debounce;
  List<String>? _serverIds;
  String _serverFor = '';

  @override
  void initState() {
    super.initState();
    if ((widget.initialText ?? '').trim().length >= 2) _searchServer();
  }

  void _onText() {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), _searchServer);
  }

  Future<void> _searchServer() async {
    final text = _ctrl.text.trim();
    if (text.length < 2) {
      if (mounted) setState(() => _serverIds = null);
      return;
    }
    try {
      final res = await RealtimeStore.instance.call('products:search', {'q': text, 'limit': 100});
      if (!mounted || _ctrl.text.trim() != text) return;
      setState(() {
        _serverIds = ((res as Map)['ids'] as List).map((e) => '$e').toList();
        _serverFor = text;
      });
    } catch (_) {
      if (mounted) setState(() => _serverIds = null);
    }
  }

  List<Product> _results() {
    final text = _ctrl.text.trim();
    final ids = _serverIds;
    if (ids == null || _serverFor != text) return runQuery(liveCatalog(), _q);
    final byId = {for (final p in liveCatalog()) p.uuid: p};
    final ranked = ids.map((id) => byId[id]).whereType<Product>().toList();
    // Filters and sorts still apply; with "relevance" the server's order is kept.
    final saved = _q.text;
    _q.text = '';
    final out = runQuery(ranked, _q);
    _q.text = saved;
    return out;
  }

  List<String> _quickSorts(Strings s) => [s.sortRelevance, s.sortPriceAsc, s.sortPriceDesc, s.sortTopRated, s.sortDeals];

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(listenable: RealtimeStore.instance, builder: (_, __) => _scaffold(context));
  }

  Widget _scaffold(BuildContext context) {
    final tr = Strings.of(context);
    final lang = tr.lang;
    _q.text = _ctrl.text;
    final results = _results();
    final t = foldText(_ctrl.text.trim());
    final stores = liveSellers().where((s) => t.isEmpty || foldText(s.name).contains(t)).toList();

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 0,
        leading: IconButton(icon: const Icon(Icons.arrow_back_rounded), onPressed: () => Navigator.maybePop(context)),
        title: Padding(
          padding: const EdgeInsets.only(right: 12),
          child: BrowseSearchField(
            controller: _ctrl,
            hint: tr.searchBothHint,
            autofocus: widget.initialText == null,
            onChanged: (_) => _onText(),
          ),
        ),
      ),
      body: Column(children: [
        // Products / Stores toggle
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
          // Wrap: with long labels or large text the filter button moves under the toggle instead of overflowing.
          child: Wrap(alignment: WrapAlignment.spaceBetween, crossAxisAlignment: WrapCrossAlignment.center, runSpacing: 8, children: [
            Row(mainAxisSize: MainAxisSize.min, children: [_seg(tr.products, 0), const SizedBox(width: 8), _seg(tr.tabStores, 1)]),
            if (_tab == 0) _filterButton(tr),
          ]),
        ),
        if (_tab == 0) _quickSortRow(tr),
        Expanded(child: _tab == 0 ? _productResults(tr, results, lang) : _storeResults(tr, stores)),
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

  Widget _filterButton(Strings tr) {
    final n = _q.activeCount;
    return GestureDetector(
      onTap: () async {
        final res = await showFilterSheet(context, _q);
        if (res != null) {
          setState(() {
            _q.sort = res.sort;
            _q.takeCategory(res);
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
          Text(n > 0 ? tr.filtersN(n) : tr.filters, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5, color: n > 0 ? AppColors.primary : AppColors.muted)),
        ]),
      ),
    );
  }

  Widget _quickSortRow(Strings tr) => SizedBox(
        height: 40,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
          itemCount: _quickSorts(tr).length,
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
                child: Text(_quickSorts(tr)[i], style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: active ? Colors.white : AppColors.muted)),
              ),
            );
          },
        ),
      );

  Widget _productResults(Strings tr, List<Product> results, String lang) {
    if (results.isEmpty) return _empty(tr.noProductsFor(_ctrl.text));
    return CustomScrollView(slivers: [
      SliverToBoxAdapter(child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),
        child: Text(results.length == 1 ? tr.resultOne(1) : tr.resultMany(results.length), style: const TextStyle(color: AppColors.muted, fontWeight: FontWeight.w600, fontSize: 13)),
      )),
      SliverPadding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
        sliver: SliverGrid(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 0.62, crossAxisSpacing: 14, mainAxisSpacing: 14),
          delegate: SliverChildBuilderDelegate((_, i) => productCard(context, results[i], widget.locale), childCount: results.length),
        ),
      ),
    ]);
  }

  Widget _storeResults(Strings tr, List<Seller> stores) {
    if (stores.isEmpty) return _empty(tr.noStoresFor(_ctrl.text));
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      itemCount: stores.length,
      separatorBuilder: (_, __) => const SizedBox(height: 10),
      itemBuilder: (_, i) {
        final s = stores[i];
        return GestureDetector(
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StoreScreen(locale: widget.locale, sellerId: s.id, sellerName: s.name))),
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18), boxShadow: AppShadow.card),
            child: Row(children: [
              CircleAvatar(radius: 24, backgroundColor: AppColors.primary.withValues(alpha: 0.12), child: Text(s.name[0].toUpperCase(), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 18))),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                const SizedBox(height: 2),
                Text(s.productCount == 1 ? tr.productOne(1) : tr.productMany(s.productCount), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
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
