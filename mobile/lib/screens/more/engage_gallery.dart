import 'package:flutter/material.dart';
import '../../data/catalog_models.dart';
import '../../l10n/strings.dart';
import '../../theme/app_theme.dart';
import '../../widgets/common.dart' show CircleIconButton;
import '../../widgets/product_gallery.dart' show PageDots;
import '../../widgets/product_image.dart';

/// The product's pictures full screen: swipe between them, pinch to zoom (double tap to zoom in and out).
class GalleryScreen extends StatefulWidget {
  final Product product;
  final int initial;
  const GalleryScreen({super.key, required this.product, this.initial = 0});

  @override
  State<GalleryScreen> createState() => _GalleryScreenState();
}

class _GalleryScreenState extends State<GalleryScreen> {
  late final PageController _controller;
  late int _page;
  final Map<int, TransformationController> _zoom = {};

  /// While a picture is zoomed in, a drag pans it instead of turning the page.
  bool _zoomed = false;

  @override
  void initState() {
    super.initState();
    final n = widget.product.gallery.length;
    _page = widget.initial.clamp(0, n == 0 ? 0 : n - 1);
    _controller = PageController(initialPage: _page);
  }

  @override
  void dispose() {
    _controller.dispose();
    for (final c in _zoom.values) {
      c.dispose();
    }
    super.dispose();
  }

  TransformationController _tc(int i) => _zoom.putIfAbsent(i, TransformationController.new);

  void _toggleZoom(int i) {
    final c = _tc(i);
    final zoomedIn = c.value.getMaxScaleOnAxis() > 1.01;
    // Zoom about the middle of the screen.
    const k = 2.5;
    final size = MediaQuery.of(context).size;
    c.value = zoomedIn
        ? Matrix4.identity()
        : (Matrix4.translationValues(-size.width * (k - 1) / 2, -size.height * (k - 1) / 2, 0) * Matrix4.diagonal3Values(k, k, 1));
    setState(() => _zoomed = !zoomedIn);
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final p = widget.product;
    final urls = p.gallery;
    final top = MediaQuery.of(context).padding.top;
    return Scaffold(
      backgroundColor: AppColors.ink,
      body: Stack(fit: StackFit.expand, children: [
        if (urls.isEmpty)
          Center(child: ProductImage(product: p, iconSize: 120))
        else
          PageView.builder(
            key: const ValueKey('fullscreen-pages'),
            controller: _controller,
            itemCount: urls.length,
            physics: _zoomed ? const NeverScrollableScrollPhysics() : null,
            onPageChanged: (i) => setState(() {
              _page = i;
              _zoomed = _tc(i).value.getMaxScaleOnAxis() > 1.01;
            }),
            itemBuilder: (_, i) => GestureDetector(
              behavior: HitTestBehavior.opaque,
              onDoubleTap: () => _toggleZoom(i),
              child: InteractiveViewer(
                key: ValueKey('fullscreen-zoom-$i'),
                transformationController: _tc(i),
                minScale: 1,
                maxScale: 4,
                onInteractionEnd: (_) {
                  final z = _tc(i).value.getMaxScaleOnAxis() > 1.01;
                  if (z != _zoomed) setState(() => _zoomed = z);
                },
                child: Semantics(
                  image: true,
                  label: s.galAlt(i + 1, urls.length, p.displayName(s.lang)),
                  child: SizedBox.expand(child: ProductImage(product: p, url: urls[i], iconSize: 110)),
                ),
              ),
            ),
          ),
        Positioned(
          top: top + 8,
          left: 12,
          child: CircleIconButton(
            key: const ValueKey('gallery-close'),
            icon: Icons.close_rounded,
            background: Colors.white,
            onTap: () => Navigator.maybePop(context),
          ),
        ),
        if (urls.length > 1) ...[
          Positioned(
            top: top + 16,
            right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(100)),
              child: Text(s.galCounter(_page + 1, urls.length),
                  key: const ValueKey('gallery-counter'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5)),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 24 + MediaQuery.of(context).padding.bottom,
            child: IgnorePointer(child: PageDots(count: urls.length, index: _page, activeColor: Colors.white, idleColor: Colors.white38)),
          ),
        ],
      ]),
    );
  }
}
