import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// A small rounded pill badge (discount, tags, etc).
class Pill extends StatelessWidget {
  final String text;
  final Color color;
  final Color textColor;
  final IconData? icon;
  final EdgeInsets padding;
  final double fontSize;

  const Pill(
    this.text, {
    super.key,
    this.color = AppColors.accent,
    this.textColor = Colors.white,
    this.icon,
    this.padding = const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    this.fontSize = 11,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: fontSize + 2, color: textColor),
            const SizedBox(width: 3),
          ],
          Text(
            text,
            style: TextStyle(
              color: textColor,
              fontSize: fontSize,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.1,
            ),
          ),
        ],
      ),
    );
  }
}

/// Star rating chip: ★ 4.8
class RatingPill extends StatelessWidget {
  final double rating;
  final bool compactStyle;
  const RatingPill(this.rating, {super.key, this.compactStyle = true});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: AppColors.amber.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(100),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.star_rounded, size: 14, color: AppColors.amber),
          const SizedBox(width: 2),
          Text(
            rating.toStringAsFixed(1),
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: Color(0xFF92610A),
            ),
          ),
        ],
      ),
    );
  }
}

/// Section header with an optional trailing "See all" action.
class SectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  final EdgeInsets padding;

  const SectionHeader(
    this.title, {
    super.key,
    this.actionLabel,
    this.onAction,
    this.padding = const EdgeInsets.fromLTRB(20, 22, 12, 10),
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(
        children: [
          Expanded(
            child: Text(title, style: Theme.of(context).textTheme.titleLarge),
          ),
          if (actionLabel != null)
            TextButton(
              onPressed: onAction,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.primary,
                textStyle: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 13.5),
              ),
              child: Row(
                children: [
                  Text(actionLabel!),
                  const Icon(Icons.chevron_right_rounded, size: 18),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// A live-updating HH:MM:SS countdown, used for the flash sale.
class Countdown extends StatefulWidget {
  final Duration duration;
  final TextStyle? style;
  final Color boxColor;
  final Color textColor;
  const Countdown({
    super.key,
    this.duration = const Duration(hours: 2, minutes: 45, seconds: 30),
    this.style,
    this.boxColor = Colors.white,
    this.textColor = AppColors.accentDark,
  });

  @override
  State<Countdown> createState() => _CountdownState();
}

class _CountdownState extends State<Countdown> {
  late Duration _left;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _left = widget.duration;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        _left = _left.inSeconds > 0
            ? _left - const Duration(seconds: 1)
            : widget.duration;
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  String _two(int n) => n.toString().padLeft(2, '0');

  Widget _cell(String v) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
        decoration: BoxDecoration(
          color: widget.boxColor,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          v,
          style: TextStyle(
            color: widget.textColor,
            fontWeight: FontWeight.w800,
            fontSize: 13,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final h = _left.inHours;
    final m = _left.inMinutes % 60;
    final s = _left.inSeconds % 60;
    const sep = Padding(
      padding: EdgeInsets.symmetric(horizontal: 3),
      child: Text(':',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [_cell(_two(h)), sep, _cell(_two(m)), sep, _cell(_two(s))],
    );
  }
}

/// +/- quantity stepper.
class QuantityStepper extends StatelessWidget {
  final int value;
  final ValueChanged<int> onChanged;
  final int min;
  const QuantityStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.min = 1,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.background,
        borderRadius: BorderRadius.circular(100),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _btn(Icons.remove_rounded, () {
            if (value > min) onChanged(value - 1);
          }),
          SizedBox(
            width: 34,
            child: Text(
              '$value',
              textAlign: TextAlign.center,
              style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
            ),
          ),
          _btn(Icons.add_rounded, () => onChanged(value + 1)),
        ],
      ),
    );
  }

  Widget _btn(IconData icon, VoidCallback onTap) => Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Icon(icon, size: 18, color: AppColors.ink),
          ),
        ),
      );
}

/// Circular icon button used in app bars (frosted look).
class CircleIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final Color background;
  final Color color;
  final int? badgeCount;

  const CircleIconButton({
    super.key,
    required this.icon,
    this.onTap,
    this.background = AppColors.surface,
    this.color = AppColors.ink,
    this.badgeCount,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Material(
          color: background,
          shape: const CircleBorder(),
          child: InkWell(
            customBorder: const CircleBorder(),
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.all(9),
              child: Icon(icon, size: 21, color: color),
            ),
          ),
        ),
        if (badgeCount != null && badgeCount! > 0)
          Positioned(
            right: -2,
            top: -2,
            child: Container(
              padding: const EdgeInsets.all(4),
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              decoration: BoxDecoration(
                color: AppColors.accent,
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white, width: 1.5),
              ),
              child: Text(
                '$badgeCount',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  height: 1,
                ),
              ),
            ),
          ),
      ],
    );
  }
}
