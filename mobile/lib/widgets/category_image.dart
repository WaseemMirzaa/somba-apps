import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import '../data/catalog_models.dart';
import '../services/env.dart';
import '../theme/app_theme.dart';

/// A category's address as the platform serves it (an upload is a path relative to the API's host).
String categoryImageUrl(String url) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return '${Env.apiUrl}${url.startsWith('/') ? '' : '/'}$url';
}

/// The letter or digit a category's fallback tile shows: the first one in the name, skipping emoji, symbols and spaces.
/// Null when the name has none (the tile then shows a neutral glyph).
String? categoryInitial(String name) {
  final m = RegExp(r'[\p{L}\p{N}]', unicode: true).firstMatch(name);
  return m?.group(0)?.toUpperCase();
}

/// How a category looks on every screen: its IMAGE, never the emoji `icon` the server also stores. When there is no image,
/// or it can not be loaded, a designed fallback takes its place: a tinted tile from the design tokens with the category's
/// initial (a neutral glyph when the name has no letter). Pictures are cached on the phone, the tile reads as an image for
/// screen readers with the category's name, and the initial scales with the tile, not with the text size.
class CategoryImage extends StatelessWidget {
  const CategoryImage({super.key, required this.category, required this.lang, required this.size, this.tint = 0, this.radius = AppRadius.md, this.decorative = false});

  final Category category;

  /// `en` | `fr`: the language of the name that labels the tile.
  final String lang;

  /// Width and height of the square tile.
  final double size;

  /// Picks the fallback tint (the tile's position in its row or grid), so neighbours differ.
  final int tint;
  final double radius;

  /// The category's name is written right next to the tile (a chip, a row): the picture adds nothing for a screen reader.
  final bool decorative;

  @override
  Widget build(BuildContext context) {
    final name = category.displayName(lang);
    final grad = AppColors.tileGradients[tint % AppColors.tileGradients.length];
    final fallback = _Fallback(key: ValueKey('category-fallback-${category.id}'), name: name, size: size, colors: grad);
    final url = category.image.trim();
    final px = (size * MediaQuery.devicePixelRatioOf(context)).round();
    final tile = ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(
        width: size,
        height: size,
        child: url.isEmpty
            ? fallback
            : CachedNetworkImage(
                key: ValueKey('category-image-${category.id}'),
                imageUrl: categoryImageUrl(url),
                fit: BoxFit.cover,
                memCacheWidth: px,
                fadeInDuration: const Duration(milliseconds: 150),
                placeholder: (_, __) => fallback,
                errorWidget: (_, __, ___) => fallback,
              ),
      ),
    );
    if (decorative) return ExcludeSemantics(child: tile);
    return Semantics(label: name, image: true, child: ExcludeSemantics(child: tile));
  }
}

class _Fallback extends StatelessWidget {
  const _Fallback({super.key, required this.name, required this.size, required this.colors});
  final String name;
  final double size;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) {
    final initial = categoryInitial(name);
    final glyphSize = size * 0.46;
    return DecoratedBox(
      decoration: BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors)),
      child: Center(
        child: initial == null
            ? Icon(Icons.category_outlined, size: glyphSize, color: AppColors.primary)
            : Text(initial, key: const ValueKey('category-initial'), textScaler: TextScaler.noScaling, style: TextStyle(color: AppColors.primary, fontWeight: FontWeight.w800, fontSize: glyphSize)),
      ),
    );
  }
}
