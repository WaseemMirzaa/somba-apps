import 'package:flutter/material.dart';
import '../../data/mock_data.dart';
import '../../data/catalog_meta.dart';
import '../../data/shop_state.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';
import 'shop_extra.dart';

/// A filter/sort query over the product catalogue (AliExpress-style).
class ProductQuery {
  String text;
  int sort; // 0 relevance · 1 price↑ · 2 price↓ · 3 rating · 4 discount
  String? category; // null = all
  double minPrice, maxPrice;
  double minRating; // 0 = any
  bool dealsOnly;
  ProductQuery({
    this.text = '',
    this.sort = 0,
    this.category,
    this.minPrice = 0,
    this.maxPrice = 800,
    this.minRating = 0,
    this.dealsOnly = false,
  });

  ProductQuery copy() => ProductQuery(
      text: text, sort: sort, category: category, minPrice: minPrice, maxPrice: maxPrice, minRating: minRating, dealsOnly: dealsOnly);

  int get activeCount {
    var n = 0;
    if (category != null) n++;
    if (minPrice > 0 || maxPrice < 800) n++;
    if (minRating > 0) n++;
    if (dealsOnly) n++;
    if (sort != 0) n++;
    return n;
  }
}

/// Runs a query against a product source list.
List<Product> runQuery(List<Product> src, ProductQuery q) {
  final t = q.text.trim().toLowerCase();
  final list = src.where((p) {
    final matchesText = t.isEmpty ||
        p.name.toLowerCase().contains(t) ||
        p.nameFr.toLowerCase().contains(t) ||
        p.category.toLowerCase().contains(t);
    return matchesText &&
        (q.category == null || p.category == q.category) &&
        p.price >= q.minPrice &&
        p.price <= q.maxPrice &&
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
  static const _sorts = ['Relevance', 'Price: low to high', 'Price: high to low', 'Top rated', 'Biggest discount'];

  @override
  Widget build(BuildContext context) {
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
              const Text('Filters', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'PlusJakartaSans')),
              const Spacer(),
              TextButton(onPressed: () => setState(() => q = ProductQuery(text: q.text)), child: const Text('Reset')),
            ]),
          ),
          Expanded(
            child: ListView(controller: controller, padding: const EdgeInsets.fromLTRB(20, 4, 20, 20), children: [
              _label('Sort by'),
              Wrap(spacing: 8, runSpacing: 8, children: List.generate(_sorts.length, (i) => _chip(_sorts[i], q.sort == i, () => setState(() => q.sort = i)))),
              const SizedBox(height: 20),
              _label('Category'),
              Wrap(spacing: 8, runSpacing: 8, children: [
                _chip('All', q.category == null, () => setState(() => q.category = null)),
                ...categories.map((c) => _chip(c.name, q.category == c.name, () => setState(() => q.category = c.name))),
              ]),
              const SizedBox(height: 20),
              Row(children: [
                _label('Price range'),
                const Spacer(),
                Text('${money(q.minPrice)} – ${money(q.maxPrice)}', style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.primary, fontSize: 13)),
              ]),
              RangeSlider(
                values: RangeValues(q.minPrice, q.maxPrice),
                min: 0, max: 800, divisions: 32,
                activeColor: AppColors.primary,
                labels: RangeLabels(money(q.minPrice), money(q.maxPrice)),
                onChanged: (v) => setState(() {
                  q.minPrice = v.start;
                  q.maxPrice = v.end;
                }),
              ),
              const SizedBox(height: 12),
              _label('Minimum rating'),
              Wrap(spacing: 8, runSpacing: 8, children: [
                _chip('Any', q.minRating == 0, () => setState(() => q.minRating = 0)),
                _chip('4.0★+', q.minRating == 4.0, () => setState(() => q.minRating = 4.0)),
                _chip('4.5★+', q.minRating == 4.5, () => setState(() => q.minRating = 4.5)),
              ]),
              const SizedBox(height: 16),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                activeThumbColor: AppColors.primary,
                value: q.dealsOnly,
                onChanged: (v) => setState(() => q.dealsOnly = v),
                title: const Text('Deals only', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
                subtitle: const Text('Show items with 15%+ off', style: TextStyle(fontSize: 12.5)),
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
                  child: Text('Show ${runQuery(products, q).length} results'),
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

/// Searchable directory of sellers / businesses.
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
    final t = _ctrl.text.trim().toLowerCase();
    final list = allSellers.where((s) => t.isEmpty || s.name.toLowerCase().contains(t)).toList();
    return Scaffold(
      appBar: backAppBar(context, 'Stores & sellers'),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: _SearchField(controller: _ctrl, hint: 'Search stores or businesses…', onChanged: (_) => setState(() {})),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
          child: Align(alignment: Alignment.centerLeft, child: Text('${list.length} stores', style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600))),
        ),
        Expanded(
          child: list.isEmpty
              ? const Center(child: Text('No stores match your search', style: TextStyle(color: AppColors.muted)))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => _sellerTile(list[i]),
                ),
        ),
      ]),
    );
  }

  Widget _sellerTile(Seller s) {
    final gold = s.badge == SellerBadge.gold || s.badge == SellerBadge.sombaAssured;
    final c = s.badge == SellerBadge.sombaAssured
        ? AppColors.primary
        : gold
            ? AppColors.amber
            : s.badge == SellerBadge.silver
                ? AppColors.muted
                : const Color(0xFFB45309);
    return Panel(
      padding: const EdgeInsets.all(12),
      child: Row(children: [
        CircleAvatar(radius: 24, backgroundColor: AppColors.primary.withValues(alpha: 0.12), child: Text(s.name[0], style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: 18))),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(s.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          const SizedBox(height: 2),
          Row(children: [
            const Icon(Icons.star_rounded, size: 14, color: AppColors.amber),
            const SizedBox(width: 3),
            Text('${s.rating} · ${(s.followers / 1000).toStringAsFixed(1)}k followers', style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ]),
          const SizedBox(height: 5),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(100)),
            child: Text(s.badge.label, style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: 10)),
          ),
        ])),
        FilledButton(
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => StoreScreen(locale: widget.locale, seller: s))),
          style: FilledButton.styleFrom(minimumSize: const Size(0, 38), padding: const EdgeInsets.symmetric(horizontal: 16)),
          child: const Text('Visit'),
        ),
      ]),
    );
  }
}

/// Lets the customer change their delivery address / zone (mock).
class AddressSelectScreen extends StatefulWidget {
  final Locale locale;
  const AddressSelectScreen({super.key, this.locale = const Locale('en')});
  @override
  State<AddressSelectScreen> createState() => _AddressSelectScreenState();
}

class _AddressSelectScreenState extends State<AddressSelectScreen> {
  static const _addrs = [
    ('Kinshasa, Gombe', '12 Commerce Ave, Gombe, Kinshasa', Icons.home_rounded),
    ('Kinshasa, Limete', 'Tower B, Limete Industrial, Kinshasa', Icons.work_rounded),
    ('Kinshasa, Ngaliema', '8 Av. des Écoles, Ngaliema, Kinshasa', Icons.location_city_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final selected = ShopState.instance.selectedAddressLabel ?? _addrs.first.$1;
    return Scaffold(
      appBar: backAppBar(context, 'Deliver to'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        ..._addrs.map((a) {
          final sel = a.$1 == selected;
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: GestureDetector(
              onTap: () {
                ShopState.instance.selectedAddressLabel = a.$1;
                Navigator.pop(context, true);
              },
              child: Panel(
                child: Row(children: [
                  Container(height: 44, width: 44, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)), child: Icon(a.$3, color: AppColors.primary)),
                  const SizedBox(width: 12),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(a.$1, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                    const SizedBox(height: 2),
                    Text(a.$2, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                  ])),
                  Icon(sel ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: sel ? AppColors.primary : AppColors.faint),
                ]),
              ),
            ),
          );
        }),
        const SizedBox(height: 4),
        OutlinedButton.icon(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.add_location_alt_rounded, size: 20), label: const Text('Use current location')),
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
