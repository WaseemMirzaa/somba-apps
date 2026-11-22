import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../data/catalog_live.dart';
import '../l10n/strings.dart';
import '../screens/deals_screen.dart';
import '../screens/more/catalog_extra.dart';
import '../screens/more/shop_extra.dart';
import '../services/models.dart';
import '../services/realtime_store.dart';
import '../theme/app_theme.dart';
import 'feedback.dart';
import 'product_actions.dart';

/// The gradient a home card draws when it has no picture (or the picture fails): the admin's colour token, or a
/// rotation of brand / deal / blue by position when none is set. Every token keeps white text above 4.5:1 at the dark end.
const _cardGradients = <String, LinearGradient>{
  'brand': AppColors.brandGradient,
  'deal': AppColors.dealGradient,
  'blue': LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF2563EB), AppColors.royalBlue]),
  'green': LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AppColors.success, Color(0xFF065F46)]),
  'teal': LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF0F766E), Color(0xFF115E59)]),
  'amber': LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFFB45309), Color(0xFF92400E)]),
  'ink': LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AppColors.inkSoft, AppColors.ink]),
};
const _rotation = ['brand', 'deal', 'blue'];
const _glyphs = [Icons.auto_awesome_rounded, Icons.local_fire_department_rounded, Icons.local_shipping_rounded];

LinearGradient cardGradientFor(String? colorKey, int index) => _cardGradients[colorKey] ?? _cardGradients[_rotation[index % _rotation.length]]!;

/// Opens a URL outside the app. Replaced in tests.
typedef CardUrlLauncher = Future<bool> Function(Uri uri);
CardUrlLauncher cardUrlLauncher = (uri) => launchUrl(uri, mode: LaunchMode.externalApplication);

/// What a tap on a home card opens. A target that no longer exists (a product taken down, a bad address) says so in a
/// snackbar instead of doing nothing.
Future<void> openCardLink(BuildContext context, BannerDto b, Locale locale) async {
  final s = Strings(locale.languageCode);
  final target = b.linkTarget;
  switch (b.linkType) {
    case 'deals':
      Navigator.push(context, MaterialPageRoute(builder: (_) => DealsScreen(locale: locale)));
    case 'product':
      final p = target == null ? null : productByUuid(target);
      if (p == null) {
        showSnack(context, s.cmsCardMissing);
      } else {
        openProduct(context, p, locale);
      }
    case 'category':
      final c = RealtimeStore.instance.categories.where((c) => c.id == target).firstOrNull;
      if (c == null) {
        showSnack(context, s.cmsCardMissing);
      } else {
        Navigator.push(context, MaterialPageRoute(builder: (_) => ProductListScreen(locale: locale, category: c.name, categoryId: c.id)));
      }
    case 'store':
      if (target == null) {
        showSnack(context, s.cmsCardMissing);
      } else {
        Navigator.push(context, MaterialPageRoute(builder: (_) => StoreScreen(locale: locale, sellerId: target)));
      }
    case 'url':
      final uri = target == null ? null : Uri.tryParse(target);
      var ok = false;
      if (uri != null && uri.scheme == 'https') {
        try {
          ok = await cardUrlLauncher(uri);
        } catch (_) {
          ok = false;
        }
      }
      if (!ok && context.mounted) showSnack(context, s.cmsCardLinkFailed);
  }
}

/// One card of the home carousel, built entirely from a CMS block: picture (or the designed gradient), title, body and an
/// optional button. The whole card opens the link; the button does the same and is only there when the block has a label
/// and a link. [index] picks the gradient and glyph when the block names no colour.
class CmsHomeCard extends StatelessWidget {
  final BannerDto banner;
  final int index;
  final String lang;
  final VoidCallback? onOpen;
  const CmsHomeCard({super.key, required this.banner, required this.index, required this.lang, this.onOpen});

  static const _scrim = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [Color(0xCC000000), Color(0x33000000)],
  );

  @override
  Widget build(BuildContext context) {
    final b = banner;
    final cta = b.hasLink ? b.displayCta(lang) : null;
    final gradient = cardGradientFor(b.colorKey, index);
    final fallback = DecoratedBox(
      key: const ValueKey('cms-card-fallback'),
      decoration: BoxDecoration(gradient: gradient),
      child: Stack(children: [
        Positioned(right: -20, top: -20, child: Icon(_glyphs[index % _glyphs.length], size: 150, color: Colors.white.withValues(alpha: 0.14))),
      ]),
    );
    final image = b.imageUrl;
    return Semantics(
      button: onOpen != null,
      label: b.displayTitle(lang),
      child: Container(
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), boxShadow: AppShadow.soft),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
          child: Material(
            color: Colors.transparent,
            child: Stack(fit: StackFit.expand, children: [
              if (image == null)
                fallback
              else ...[
                CachedNetworkImage(
                  key: const ValueKey('cms-card-image'),
                  imageUrl: image,
                  fit: BoxFit.cover,
                  placeholder: (_, __) => fallback,
                  errorWidget: (_, __, ___) => fallback,
                ),
                const DecoratedBox(decoration: BoxDecoration(gradient: _scrim)),
              ],
              Padding(
                padding: const EdgeInsets.all(22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Flexible(
                      child: Text(
                        b.displayTitle(lang),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, height: 1.1, letterSpacing: -0.5),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Flexible(
                      child: Text(b.displayBody(lang),
                          maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: Colors.white.withValues(alpha: 0.92), fontSize: 12.5)),
                    ),
                    if (cta != null) ...[
                      const SizedBox(height: AppSpace.md),
                      Container(
                        key: const ValueKey('cms-card-cta'),
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: const BoxDecoration(color: Colors.white, borderRadius: AppRadius.pill),
                        child: Text(cta, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.ink, fontWeight: FontWeight.w800, fontSize: 13)),
                      ),
                    ],
                  ],
                ),
              ),
              if (onOpen != null) Positioned.fill(child: InkWell(key: const ValueKey('cms-card-tap'), onTap: onOpen)),
            ]),
          ),
        ),
      ),
    );
  }
}
