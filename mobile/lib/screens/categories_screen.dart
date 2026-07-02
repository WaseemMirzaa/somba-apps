import 'package:flutter/material.dart';
import '../data/mock_data.dart';
import '../data/catalog_meta.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/product_image.dart';
import 'more/catalog_extra.dart';
import 'more/browse.dart';
import 'more/search_screen.dart';
import 'more/shop_extra.dart';

class CategoriesScreen extends StatefulWidget {
  final Locale locale;
  const CategoriesScreen({super.key, required this.locale});
  @override
  State<CategoriesScreen> createState() => _CategoriesScreenState();
}

class _CategoriesScreenState extends State<CategoriesScreen> {
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _openCategory(String name) => Navigator.push(context, MaterialPageRoute(builder: (_) => ProductListScreen(locale: widget.locale, category: name)));
  void _openStore(Seller s) => Navigator.push(context, MaterialPageRoute(builder: (_) => StoreScreen(locale: widget.locale, seller: s)));

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final lang = widget.locale.languageCode;
    final t = _ctrl.text.trim().toLowerCase();
    final searching = t.isNotEmpty;
    final cats = categories.where((c) => !searching || c.name.toLowerCase().contains(t) || c.nameFr.toLowerCase().contains(t)).toList();
    final stores = allSellers.where((x) => !searching || x.name.toLowerCase().contains(t)).toList();

    return Scaffold(
      body: Column(children: [
        _hero(s, lang),
        Expanded(child: searching ? _searchResults(cats, stores, s) : _browse(cats, stores, s, lang)),
      ]),
    );
  }

  // Premium gradient hero header with brand blobs + a frosted glass search.
  Widget _hero(Strings s, String lang) {
    final top = MediaQuery.of(context).padding.top;
    return ClipRRect(
      borderRadius: const BorderRadius.vertical(bottom: Radius.circular(28)),
      child: Container(
        decoration: const BoxDecoration(gradient: AppColors.brandGradient),
        child: Stack(children: [
          Positioned(top: -40, right: -30, child: _blob(160, Colors.white.withValues(alpha: 0.16))),
          Positioned(bottom: -60, left: -40, child: _blob(180, const Color(0xFFFF5A6E).withValues(alpha: 0.26))),
          Padding(
            padding: EdgeInsets.fromLTRB(20, top + 14, 20, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(s.categories, style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, letterSpacing: -0.4, fontFamily: 'PlusJakartaSans')),
              const SizedBox(height: 2),
              Text(lang == 'fr' ? 'Explorez par catégorie et boutique' : 'Explore by category and store',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13)),
              const SizedBox(height: 14),
              Container(
                height: 50,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.96),
                  borderRadius: BorderRadius.circular(100),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.6)),
                  boxShadow: AppShadow.lifted,
                ),
                child: Row(children: [
                  const SizedBox(width: 16),
                  const Icon(Icons.search_rounded, color: AppColors.primary, size: 22),
                  const SizedBox(width: 10),
                  Expanded(child: TextField(
                    controller: _ctrl,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      isCollapsed: true,
                      border: InputBorder.none,
                      hintText: trl(lang, 'Search categories, stores…'),
                      hintStyle: const TextStyle(color: AppColors.faint, fontSize: 14, fontWeight: FontWeight.w500),
                    ),
                  )),
                  if (_ctrl.text.isNotEmpty)
                    IconButton(icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.faint), onPressed: () => setState(() => _ctrl.clear())),
                  const SizedBox(width: 6),
                ]),
              ),
            ]),
          ),
        ]),
      ),
    );
  }

  Widget _blob(double d, Color c) => Container(height: d, width: d, decoration: BoxDecoration(shape: BoxShape.circle, color: c));

  // Default browse view: category grid + popular stores.
  Widget _browse(List<Category> cats, List<Seller> stores, Strings s, String lang) {
    return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 120), children: [
      GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 1.12, crossAxisSpacing: 14, mainAxisSpacing: 14),
        itemCount: cats.length,
        itemBuilder: (_, i) {
          final cat = cats[i];
          final grad = AppColors.tileGradients[i % AppColors.tileGradients.length];
          return GestureDetector(
            onTap: () => _openCategory(cat.name),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: grad),
                borderRadius: BorderRadius.circular(22),
                boxShadow: AppShadow.card,
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(height: 52, width: 52, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.75), borderRadius: BorderRadius.circular(16), boxShadow: AppShadow.soft), child: Icon(categoryIcon(cat.name), color: AppColors.primary, size: 27)),
                  const Spacer(),
                  Container(height: 28, width: 28, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.55), shape: BoxShape.circle), child: const Icon(Icons.arrow_outward_rounded, color: AppColors.primary, size: 16)),
                ]),
                const Spacer(),
                Text(cat.displayName(lang), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16.5, color: AppColors.ink)),
                const SizedBox(height: 2),
                Text(s.itemsCount(categoryCount(cat.name)), style: const TextStyle(color: AppColors.inkSoft, fontSize: 12.5, fontWeight: FontWeight.w600)),
              ]),
            ),
          );
        },
      ),
      const SizedBox(height: 22),
      Row(children: [
        Text(trl(lang, 'Popular stores'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
        const Spacer(),
        TextButton(
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SellersDirectoryScreen(locale: widget.locale))),
          child: Text(s.seeAll, style: const TextStyle(fontWeight: FontWeight.w700)),
        ),
      ]),
      const SizedBox(height: 6),
      ...stores.take(4).map((x) => _storeRow(x)),
    ]);
  }

  // Search results: matching categories, then matching stores.
  Widget _searchResults(List<Category> cats, List<Seller> stores, Strings s) {
    return ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 24), children: [
      GestureDetector(
        onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SearchScreen(locale: widget.locale, initialText: _ctrl.text))),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14)),
          child: Row(children: [
            const Icon(Icons.search_rounded, color: AppColors.primary),
            const SizedBox(width: 10),
            Expanded(child: Text('${trl(s.lang, 'Search all products for')} “${_ctrl.text}”', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
            const Icon(Icons.chevron_right_rounded, color: AppColors.primary),
          ]),
        ),
      ),
      if (cats.isNotEmpty) ...[
        const SizedBox(height: 18),
        Text(trl(s.lang, 'Categories'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 8),
        ...cats.map((c) => ListTile(
              contentPadding: EdgeInsets.zero,
              leading: Container(height: 42, width: 42, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)), child: Icon(categoryIcon(c.name), color: AppColors.primary)),
              title: Text(c.displayName(s.lang), style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text(s.itemsCount(categoryCount(c.name))),
              trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
              onTap: () => _openCategory(c.name),
            )),
      ],
      if (stores.isNotEmpty) ...[
        const SizedBox(height: 12),
        Text(trl(s.lang, 'Stores & sellers'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 8),
        ...stores.map((x) => _storeRow(x)),
      ],
      if (cats.isEmpty && stores.isEmpty)
        Padding(padding: const EdgeInsets.only(top: 40), child: Center(child: Text(trl(s.lang, 'No matches — try a product search'), style: const TextStyle(color: AppColors.muted)))),
    ]);
  }

  Widget _storeRow(Seller x) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: GestureDetector(
          onTap: () => _openStore(x),
          child: Container(
            padding: const EdgeInsets.all(11),
            decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), boxShadow: AppShadow.card),
            child: Row(children: [
              CircleAvatar(radius: 22, backgroundColor: AppColors.primary.withValues(alpha: 0.12), child: Text(x.name[0], style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800))),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(x.name, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                Text('${x.rating}★ · ${x.badge.label}', style: const TextStyle(color: AppColors.muted, fontSize: 12)),
              ])),
              const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
            ]),
          ),
        ),
      );
}
