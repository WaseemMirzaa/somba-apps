import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/shop_service.dart';
import '../../core/theme/app_theme.dart';
import '../../routes/app_routes.dart';
import '../../widgets/common.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _controller = TextEditingController();
  final shop = Get.find<ShopService>();
  String _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit(String query) {
    if (query.trim().isEmpty) return;
    shop.rememberSearch(query);
    Get.toNamed(AppRoutes.products, arguments: {'query': query.trim()});
  }

  @override
  Widget build(BuildContext context) {
    final suggestions = _query.isEmpty
        ? <String>[]
        : shop.products
            .where((p) =>
                p.nameEn.toLowerCase().contains(_query.toLowerCase()) ||
                p.nameFr.toLowerCase().contains(_query.toLowerCase()) ||
                p.brand.toLowerCase().contains(_query.toLowerCase()))
            .map((p) => p.name)
            .take(8)
            .toList();
    final matchingStores = _query.isEmpty
        ? []
        : shop.stores
            .where((s) =>
                s.name.toLowerCase().contains(_query.toLowerCase()))
            .toList();

    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          textInputAction: TextInputAction.search,
          onChanged: (v) => setState(() => _query = v),
          onSubmitted: _submit,
          decoration: InputDecoration(
            hintText: 'search_hint'.tr,
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            filled: false,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () => _submit(_controller.text),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_query.isEmpty) ...[
            Obx(() {
              if (shop.recentSearches.isEmpty) return const SizedBox.shrink();
              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('recent_searches'.tr,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 15)),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final term in shop.recentSearches)
                        ActionChip(
                          label: Text(term),
                          avatar: const Icon(Icons.history, size: 16),
                          onPressed: () => _submit(term),
                        ),
                    ],
                  ),
                ],
              );
            }),
          ] else ...[
            if (suggestions.isNotEmpty) ...[
              Text('suggestions'.tr,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 15)),
              for (final s in suggestions)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: const Icon(Icons.search, color: AppColors.muted),
                  title: Text(s),
                  onTap: () => _submit(s),
                ),
            ],
            if (matchingStores.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text('stores'.tr,
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 15)),
              for (final store in matchingStores)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  leading: NetImage(
                    seed: store.logoSeed,
                    width: 40,
                    height: 40,
                    radius: BorderRadius.circular(20),
                  ),
                  title: Text(store.name),
                  subtitle: Text('${store.commune}, ${store.city}'),
                  onTap: () => Get.toNamed(AppRoutes.store, arguments: store),
                ),
            ],
            if (suggestions.isEmpty && matchingStores.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 48),
                child: Center(
                  child: Text('no_results'.tr,
                      style: const TextStyle(color: AppColors.muted)),
                ),
              ),
          ],
        ],
      ),
    );
  }
}
