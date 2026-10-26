import 'dart:async';
import 'package:flutter/material.dart';
import '../l10n/strings.dart';
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
              style: TextButton.styleFrom(foregroundColor: AppColors.primary),
              // Size on the Text, not the button's textStyle (that would drop the theme font).
              child: Text(actionLabel!, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            ),
        ],
      ),
    );
  }
}

/// The time left as text: `02:14:09`, or `2d 03:14:09` from one day up (`1j` in French). Never negative.
String remainingText(Duration left, Strings s) {
  final secs = left.isNegative ? 0 : (left.inMilliseconds + 999) ~/ 1000;
  final d = secs ~/ 86400;
  String two(int n) => n.toString().padLeft(2, '0');
  final clock = '${two((secs % 86400) ~/ 3600)}:${two((secs % 3600) ~/ 60)}:${two(secs % 60)}';
  return d > 0 ? '${s.cdDays(d)} $clock' : clock;
}

/// A live countdown to a fixed moment: it ticks every second, shows days (when there are any), hours, minutes and
/// seconds, and calls [onEnd] once when [end] is reached (right away when it already has been).
///
/// The remaining time is always worked out from [end] against the clock, never by counting ticks, so it stays right
/// after the app was in the background. [now] stands in for the clock in tests.
class CountdownTo extends StatefulWidget {
  final DateTime end;
  final VoidCallback? onEnd;
  final DateTime Function()? now;
  final TextStyle? style;

  /// Plain text only: puts the time into a sentence ("Flash sale · ends in 02:14:09").
  final String Function(String time)? format;

  /// Boxed cells (the deals header) instead of plain text (a badge).
  final bool boxed;
  final Color boxColor;
  final Color textColor;
  const CountdownTo({
    super.key,
    required this.end,
    this.onEnd,
    this.now,
    this.style,
    this.format,
    this.boxed = false,
    this.boxColor = Colors.white,
    this.textColor = AppColors.accentDark,
  });

  @override
  State<CountdownTo> createState() => _CountdownToState();
}

class _CountdownToState extends State<CountdownTo> {
  Timer? _timer;
  late Duration _left;
  bool _ended = false;

  DateTime _clock() => (widget.now ?? DateTime.now)();

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void didUpdateWidget(covariant CountdownTo old) {
    super.didUpdateWidget(old);
    if (old.end != widget.end) {
      _timer?.cancel();
      _ended = false;
      _start();
    }
  }

  void _start() {
    _left = widget.end.difference(_clock());
    if (_left <= Duration.zero) {
      _left = Duration.zero;
      // Not during build: the parent may be rebuilding.
      WidgetsBinding.instance.addPostFrameCallback((_) => _finish());
      return;
    }
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  void _tick() {
    if (!mounted) return;
    final left = widget.end.difference(_clock());
    if (left <= Duration.zero) {
      _timer?.cancel();
      setState(() => _left = Duration.zero);
      _finish();
      return;
    }
    if ((left.inMilliseconds + 999) ~/ 1000 != (_left.inMilliseconds + 999) ~/ 1000) setState(() => _left = left);
  }

  void _finish() {
    if (!mounted || _ended) return;
    _ended = true;
    widget.onEnd?.call();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Widget _cell(String v) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
        decoration: BoxDecoration(color: widget.boxColor, borderRadius: BorderRadius.circular(8)),
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
    final s = Strings.of(context);
    if (!widget.boxed) {
      final time = remainingText(_left, s);
      return Text(
        widget.format == null ? time : widget.format!(time),
        key: const ValueKey('countdown-text'),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: (widget.style ?? const TextStyle(fontWeight: FontWeight.w800)).copyWith(fontFeatures: const [FontFeature.tabularFigures()]),
      );
    }
    final secs = (_left.inMilliseconds + 999) ~/ 1000;
    String two(int n) => n.toString().padLeft(2, '0');
    const sep = Padding(
      padding: EdgeInsets.symmetric(horizontal: 3),
      child: Text(':', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
    );
    final days = secs ~/ 86400;
    return Row(
      key: const ValueKey('countdown-boxes'),
      mainAxisSize: MainAxisSize.min,
      children: [
        if (days > 0) ...[_cell(s.cdDays(days)), const SizedBox(width: 4)],
        _cell(two((secs % 86400) ~/ 3600)),
        sep,
        _cell(two((secs % 3600) ~/ 60)),
        sep,
        _cell(two(secs % 60)),
      ],
    );
  }
}

/// A countdown that starts from [duration] when it appears and stops at zero (it no longer loops).
/// Kept for callers that only know a length of time; prefer [CountdownTo] when the sale has an end date.
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
  late final DateTime _end = DateTime.now().add(widget.duration);

  @override
  Widget build(BuildContext context) =>
      CountdownTo(end: _end, boxed: true, style: widget.style, boxColor: widget.boxColor, textColor: widget.textColor);
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
