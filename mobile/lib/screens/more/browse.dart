import 'package:flutter/material.dart';
import '../../data/catalog_models.dart';
import '../../data/catalog_live.dart';
import '../../l10n/strings.dart';
import '../../theme/app_theme.dart';
import '../../services/realtime_store.dart';
import '../../util/format.dart';
import '../../util/text_fold.dart';
import '../../widgets/kit.dart';
import 'shop_extra.dart';

/// A filter/sort query over the product catalogue (AliExpress-style).
class ProductQuery {
  String text;
  int sort; // 0 relevance · 1 price↑ · 2 price↓ · 3 rating · 4 discount
  String? category; // null = all (the English name older screens pass around)

  /// The category's id; preferred over [category] whenever the listing carries one (a rename keeps its products).
  String? categoryId;
  double minPrice;

  /// Upper price bound; null = no cap (the slider ends at the dearest live listing).
  double? maxPrice;
  double minRating; // 0 = any
  bool dealsOnly;
  ProductQuery({
    this.text = '',
    this.sort = 0,
    this.category,
    this.categoryId,
    this.minPrice = 0,
    this.maxPrice,
    this.minRating = 0,
    this.dealsOnly = false,
  });

  ProductQuery copy() => ProductQuery(
      text: text,
      sort: sort,
      category: category,
      categoryId: categoryId,
      minPrice: minPrice,
      maxPrice: maxPrice,
      minRating: minRating,
      dealsOnly: dealsOnly);

  /// Takes the category choice of [other] (the filter sheet's result).
  void takeCategory(ProductQuery other) {
    category = other.category;
    categoryId = other.categoryId;
  }

  int get activeCount {
    var n = 0;
    if (category != null || categoryId != null) n++;
    if (minPrice > 0 || maxPrice != null) n++;
    if (minRating > 0) n++;
    if (dealsOnly) n++;
    if (sort != 0) n++;
    return n;
  }
}

/// True when [foldedQuery] (see [foldText]) occurs in the product's name, French name, category, French category,
/// description or French description. Accents and case do not matter, in either language (L15).
bool productMatchesText(Product p, String foldedQuery) {
  if (foldedQuery.isEmpty) return true;
  for (final field in [p.name, p.nameFr, p.category, p.categoryFr, p.description, p.descriptionFr]) {
    if (field != null && field.isNotEmpty && foldText(field).contains(foldedQuery)) return true;
  }
  return false;
}

/// True when the product is in the query's category: by id when the listing carries one, else by the English name.
bool _inQueryCategory(Product p, ProductQuery q) {
  if (q.category == null && q.categoryId == null) return true;
  final id = q.categoryId, pid = p.categoryId;
  if (id != null && id.isNotEmpty && pid != null && pid.isNotEmpty) return pid == id;
  return q.category != null && p.category == q.category;
}

/// Runs a query against a product source list.
List<Product> runQuery(List<Product> src, ProductQuery q) {
  final t = foldText(q.text.trim());
  final list = src.where((p) {
    return productMatchesText(p, t) &&
        _inQueryCategory(p, q) &&
        p.price >= q.minPrice &&
        (q.maxPrice == null || p.price <= q.maxPrice!) &&
        p.rating >= q.minRating &&
        (!q.dealsOnly || p.discount >= 15);
  }).toList();
  switch (q.sort) {
    case 1:
      list.sort((a, b) => a.price.compareTo(b.price));
      break;
    case 2:
      list.sort((a, b) => b.price.compareTo(a.price));
      break;
    case 3:
      list.sort((a, b) => b.rating.compareTo(a.rating));
      break;
    case 4:
      list.sort((a, b) => b.discount.compareTo(a.discount));
      break;
  }
  return list;
}

/// Opens the filter sheet; returns the applied query, or null if dismissed.
Future<ProductQuery?> showFilterSheet(BuildContext context, ProductQuery current) {
  return showModalBottomSheet<ProductQuery>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => _FilterSheet(query: current.copy()),
  );
}

class _FilterSheet extends StatefulWidget {
  final ProductQuery query;
  const _FilterSheet({required this.query});
  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late ProductQuery q = widget.query;
  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final sorts = [s.filterSort0, s.filterSort1, s.filterSort2, s.filterSort3, s.filterSort4];
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.8,
        maxChildSize: 0.92,
        builder: (_, controller) => Column(children: [
          const SizedBox(height: 10),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(100))),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 12, 4),
            child: Row(children: [
              Text(s.filters, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'PlusJakartaSans')),
              const Spacer(),
              TextButton(onPressed: () => setState(() => q = ProductQuery(text: q.text)), child: Text(s.filterReset)),
            ]),
          ),
          Expanded(
            child: ListView(controller: controller, padding: const EdgeInsets.fromLTRB(20, 4, 20, 20), children: [
              _label(s.filterSortBy),
              Wrap(spacing: 8, runSpacing: 8, children: List.generate(sorts.length, (i) => _chip(sorts[i], q.sort == i, () => setState(() => q.sort = i)))),
              const SizedBox(height: 20),
              _label(s.filterCategory),
              Wrap(spacing: 8, runSpacing: 8, children: [
                _chip(s.filterAll, q.category == null && q.categoryId == null, () => setState(() {
                  q.category = null;
                  q.categoryId = null;
                })),
                ...liveCategories().map((c) => _chip(
                    c.displayName(s.lang),
                    q.categoryId != null ? q.categoryId == c.id : q.category == c.name,
                    () => setState(() {
                          q.category = c.name;
                          q.categoryId = c.id;
                        }))),
              ]),
              const SizedBox(height: 20),
              Row(children: [
                _label(s.filterPrice),
                const Spacer(),
                Text('${money(q.minPrice)} – ${money(q.maxPrice ?? liveMaxPrice())}', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 13)),
              ]),
              RangeSlider(
                values: RangeValues(q.minPrice, q.maxPrice ?? liveMaxPrice()),
                min: 0, max: liveMaxPrice(), divisions: 32,
                activeColor: AppColors.primary,
                labels: RangeLabels(money(q.minPrice), money(q.maxPrice ?? liveMaxPrice())),
                onChanged: (v) => setState(() {
                  q.minPrice = v.start;
                  q.maxPrice = v.end >= liveMaxPrice() ? null : v.end;
                }),
              ),
              const SizedBox(height: 12),
              _label(s.filterMinRating),
              Wrap(spacing: 8, runSpacing: 8, children: [
                _chip(s.filterAny, q.minRating == 0, () => setState(() => q.minRating = 0)),
                _chip('4.0★+', q.minRating == 4.0, () => setState(() => q.minRating = 4.0)),
                _chip('4.5★+', q.minRating == 4.5, () => setState(() => q.minRating = 4.5)),
              ]),
              const SizedBox(height: 16),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                activeThumbColor: AppColors.primary,
                value: q.dealsOnly,
                onChanged: (v) => setState(() => q.dealsOnly = v),
                title: Text(s.filterDealsOnly, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                subtitle: Text(s.filterDealsSub, style: const TextStyle(fontSize: 12.5)),
              ),
            ]),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 6, 20, 12),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.pop(context, q),
                  child: Text(s.filterShow(runQuery(liveCatalog(), q).length)),
                ),
              ),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _label(String t) => Padding(padding: const EdgeInsets.only(bottom: 10), child: Text(t, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)));

  Widget _chip(String label, bool sel, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
          decoration: BoxDecoration(
            color: sel ? AppColors.primary : AppColors.background,
            borderRadius: BorderRadius.circular(100),
            border: Border.all(color: sel ? AppColors.primary : AppColors.line),
          ),
          child: Text(label, style: TextStyle(color: sel ? Colors.white : AppColors.inkSoft, fontWeight: FontWeight.w700, fontSize: 12.5)),
        ),
      );
}

/// Searchable directory of the stores that currently have live products.
class SellersDirectoryScreen extends StatefulWidget {
  final Locale locale;
  final String? initialQuery;
  const SellersDirectoryScreen({super.key, this.locale = const Locale('en'), this.initialQuery});
  @override
  State<SellersDirectoryScreen> createState() => _SellersDirectoryScreenState();
}

class _SellersDirectoryScreenState extends State<SellersDirectoryScreen> {
  late final TextEditingController _ctrl = TextEditingController(text: widget.initialQuery ?? '');

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final tr = Strings.of(context);
        final t = foldText(_ctrl.text.trim());
        final list = liveSellers().where((s) => t.isEmpty || foldText(s.name).contains(t)).toList();
        return Scaffold(
          appBar: backAppBar(context, tr.sellersTitle),
          body: Column(children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: _SearchField(controller: _ctrl, hint: tr.sellersSearch, onChanged: (_) => setState(() {})),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
              child: Align(alignment: Alignment.centerLeft, child: Text(list.length == 1 ? tr.storeOne(1) : tr.storeMany(list.length), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600))),
            ),
            Expanded(
              child: list.isEmpty
                  ? Center(child: Text(tr.sellersNone, style: const TextStyle(color: AppColors.muted)))
                  : ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                      itemCount: list.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 10),
                      itemBuilder: (_, i) => _sellerTile(tr, list[i]),
                    ),
            ),
          ]),
        );
      },
    );
  }

  Widget _sellerTile(Strings tr, Seller s) {
    return Panel(
      padding: const EdgeInsets.all(12),
      child: Row(children: [
        CircleAvatar(radius: 24, backgroundColor: AppColors.primary.withValues(alpha: 0.12), child: Text(s.name[0].toUpperCase(), style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 18))),
        const SizedBox(width: 12),
        Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          const SizedBox(height: 2),
          Text(s.productCount == 1 ? tr.productOne(1) : tr.productMany(s.productCount), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
        ])),
        // Outlined: one per row, so a filled button would repeat down the list.
        OutlinedButton(
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StoreScreen(locale: widget.locale, sellerId: s.id, sellerName: s.name))),
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 38), padding: const EdgeInsets.symmetric(horizontal: 16)),
          child: Text(tr.visit),
        ),
      ]),
    );
  }
}

/// Rounded search field used across browse surfaces.
class _SearchField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;
  final bool autofocus;
  const _SearchField({required this.controller, required this.hint, required this.onChanged, this.autofocus = false});
  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      autofocus: autofocus,
      onChanged: onChanged,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: const Icon(Icons.search_rounded, color: AppColors.muted, size: 22),
        suffixIcon: controller.text.isEmpty
            ? null
            : IconButton(icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.faint), onPressed: () {
                controller.clear();
                onChanged('');
              }),
        filled: true,
        fillColor: AppColors.surface,
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.line)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.primary, width: 1.4)),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(100)),
      ),
    );
  }
}

/// Public alias so other browse screens can reuse the search field.
class BrowseSearchField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;
  final bool autofocus;
  const BrowseSearchField({super.key, required this.controller, required this.hint, required this.onChanged, this.autofocus = false});
  @override
  Widget build(BuildContext context) => _SearchField(controller: controller, hint: hint, onChanged: onChanged, autofocus: autofocus);
}
