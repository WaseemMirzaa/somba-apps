import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// What has been drawn on a [SignaturePad]: strokes, a clear and a PNG export. No package: a `CustomPainter` and pointer events.
class SignatureController extends ChangeNotifier {
  final List<List<Offset>> _strokes = [];
  Size _size = Size.zero;

  /// A signature needs some real ink: a tap or a smudge shorter than this (logical pixels) does not count.
  static const minInk = 24.0;

  List<List<Offset>> get strokes => List.unmodifiable(_strokes);

  double get inkLength {
    var total = 0.0;
    for (final s in _strokes) {
      for (var i = 1; i < s.length; i++) {
        total += (s[i] - s[i - 1]).distance;
      }
    }
    return total;
  }

  bool get hasInk => inkLength >= minInk;
  bool get isBlank => _strokes.isEmpty;

  void start(Offset p) {
    _strokes.add([p]);
    notifyListeners();
  }

  void extend(Offset p) {
    if (_strokes.isEmpty) return start(p);
    _strokes.last.add(p);
    notifyListeners();
  }

  void clear() {
    if (_strokes.isEmpty) return;
    _strokes.clear();
    notifyListeners();
  }

  void _resize(Size s) => _size = s;

  /// Draws the strokes (black round lines) on [canvas].
  void paint(Canvas canvas, {Color color = Colors.black, double width = 2.6}) {
    final line = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = width
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final dot = Paint()..color = color;
    for (final s in _strokes) {
      if (s.length == 1) {
        canvas.drawCircle(s.first, width / 2, dot);
        continue;
      }
      final path = Path()..moveTo(s.first.dx, s.first.dy);
      for (var i = 1; i < s.length; i++) {
        // A quadratic through the midpoints keeps a fast stroke smooth.
        final mid = Offset((s[i - 1].dx + s[i].dx) / 2, (s[i - 1].dy + s[i].dy) / 2);
        path.quadraticBezierTo(s[i - 1].dx, s[i - 1].dy, mid.dx, mid.dy);
      }
      path.lineTo(s.last.dx, s.last.dy);
      canvas.drawPath(path, line);
    }
  }

  /// The signature as a PNG (black on white, [width] pixels wide), or null when there is no ink.
  Future<Uint8List?> toPng({int width = 600}) async {
    if (!hasInk || _size.isEmpty) return null;
    final scale = width / _size.width;
    final height = math.max(1, (_size.height * scale).round());
    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);
    canvas.drawRect(Rect.fromLTWH(0, 0, width.toDouble(), height.toDouble()), Paint()..color = Colors.white);
    canvas.scale(scale);
    paint(canvas, width: 2.6);
    final image = await recorder.endRecording().toImage(width, height);
    try {
      final data = await image.toByteData(format: ui.ImageByteFormat.png);
      return data?.buffer.asUint8List();
    } finally {
      image.dispose();
    }
  }
}

class _InkPainter extends CustomPainter {
  _InkPainter(this.controller) : super(repaint: controller);
  final SignatureController controller;

  @override
  void paint(Canvas canvas, Size size) {
    controller._resize(size);
    canvas.clipRect(Offset.zero & size);
    controller.paint(canvas, color: AppColors.ink);
  }

  @override
  bool shouldRepaint(_InkPainter old) => old.controller != controller;
}

/// A box the customer signs in with a finger. [hint] is shown until something is drawn. The pad takes the touch away from a
/// scrolling parent while the finger is down on it.
class SignaturePad extends StatelessWidget {
  const SignaturePad({super.key, required this.controller, required this.hint, this.semanticLabel, this.height = 150});
  final SignatureController controller;
  final String hint;
  final String? semanticLabel;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: semanticLabel,
      image: true,
      child: Container(
        height: height,
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.line, width: 1.5)),
        clipBehavior: Clip.antiAlias,
        child: RawGestureDetector(
          // Wins the gesture arena at once, so a vertical scroll behind the pad does not steal the stroke.
          gestures: {EagerGestureRecognizer: GestureRecognizerFactoryWithHandlers<EagerGestureRecognizer>(EagerGestureRecognizer.new, (_) {})},
          child: Listener(
            behavior: HitTestBehavior.opaque,
            onPointerDown: (e) => controller.start(e.localPosition),
            onPointerMove: (e) => controller.extend(e.localPosition),
            child: ListenableBuilder(
              listenable: controller,
              builder: (context, _) => CustomPaint(
                key: const ValueKey('signature-canvas'),
                painter: _InkPainter(controller),
                child: SizedBox.expand(
                  child: controller.isBlank
                      ? Center(child: Padding(padding: const EdgeInsets.all(12), child: Text(hint, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.faint, fontWeight: FontWeight.w600))))
                      : null,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
