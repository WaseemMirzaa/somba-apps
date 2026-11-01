import 'package:flutter/material.dart';
import '../data/catalog_models.dart';
import '../l10n/strings.dart';
import '../screens/more/engage_gallery.dart';
import '../theme/app_theme.dart';
import 'product_image.dart';

/// The product page's picture: a swipeable gallery with page dots; a tap opens the pictures full screen.
/// A product with one picture shows it without dots; one with none shows the app's category tile.
class ProductGallery extends StatefulWidget {
  final Product product;
  final double iconSize;

  /// Space kept free under the dots (the page's rounded sheet overlaps the bottom of the gallery).
  final double dotsInset;
  const ProductGallery({super.key, required this.product, this.iconSize = 130, this.dotsInset = 38});

  @override
  State<ProductGallery> createState() => _ProductGalleryState();
}

class _ProductGalleryState extends State<ProductGallery> {
  final PageController _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _openFull(int i) {
    Navigator.push(context, MaterialPageRoute<void>(builder: (_) => GalleryScreen(product: widget.product, initial: i), fullscreenDialog: true));
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.product;
    final urls = p.gallery;
    final s = Strings.of(context);
    if (urls.isEmpty) return ProductImage(product: p, iconSize: widget.iconSize);
    // The gallery can shrink while the page is open (the seller removed a picture).
    final page = _page.clamp(0, urls.length - 1);
    return Stack(fit: StackFit.expand, children: [
      PageView.builder(
        key: const ValueKey('gallery-pages'),
        controller: _controller,
        itemCount: urls.length,
        onPageChanged: (i) => setState(() => _page = i),
        itemBuilder: (_, i) => GestureDetector(
          key: ValueKey('gallery-page-$i'),
          behavior: HitTestBehavior.opaque,
          onTap: () => _openFull(i),
          child: Semantics(
            image: true,
            label: s.galAlt(i + 1, urls.length, p.displayName(s.lang)),
            child: ProductImage(product: p, url: urls[i], iconSize: widget.iconSize),
          ),
        ),
      ),
      if (urls.length > 1)
        Positioned(
          left: 0,
          right: 0,
          bottom: widget.dotsInset,
          child: IgnorePointer(child: PageDots(count: urls.length, index: page)),
        ),
    ]);
  }
}

/// Page indicator: the current page is a longer, solid dot.
class PageDots extends StatelessWidget {
  final int count;
  final int index;
  final Color? activeColor;
  final Color? idleColor;
  const PageDots({super.key, required this.count, required this.index, this.activeColor, this.idleColor});

  @override
  Widget build(BuildContext context) {
    return Row(
      key: const ValueKey('page-dots'),
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < count; i++)
          AnimatedContainer(
            key: ValueKey('page-dot-$i${i == index ? '-on' : ''}'),
            duration: const Duration(milliseconds: 180),
            margin: const EdgeInsets.symmetric(horizontal: 3),
            height: 7,
            width: i == index ? 18 : 7,
            decoration: BoxDecoration(
              color: i == index ? (activeColor ?? AppColors.primary) : (idleColor ?? AppColors.faint.withValues(alpha: 0.55)),
              borderRadius: BorderRadius.circular(100),
            ),
          ),
      ],
    );
  }
}
