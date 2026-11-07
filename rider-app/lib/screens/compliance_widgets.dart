import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart' show ButtonLabel, ButtonSpinner;

/// Text colours that pass 4.5:1 on white (the brand's bright amber and red do not, as text).
const kWarnText = Color(0xFFB45309);
const kBadText = Color(0xFFB91C1C);
const kGoodText = Color(0xFF15803D);

/// A `YYYY-MM-DD` day written in the rider's language ("12 Mar 2027"); a value that is not a day is shown as it came.
String fmtDay(Strings s, String? iso) {
  if (iso == null || iso.isEmpty) return '—';
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(iso);
  if (m == null) return iso;
  try {
    return DateFormat.yMMMd(s.lang).format(DateTime(int.parse(m.group(1)!), int.parse(m.group(2)!), int.parse(m.group(3)!)));
  } catch (_) {
    return iso;
  }
}

/// A small tinted label: the status goes in a badge, never a whole-card tint.
class StatusChip extends StatelessWidget {
  const StatusChip(this.text, {super.key, required this.color});
  final String text;

  /// The text colour; the background is a soft tint of it.
  final Color color;

  @override
  Widget build(BuildContext context) => ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 260),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(100)),
          child: Text(text, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700, height: 1.2)),
        ),
      );
}

/// A reminder strip (amber or red). Only ever a reminder: nothing in the app is blocked by it.
class WarningStrip extends StatelessWidget {
  const WarningStrip(this.text, {super.key, required this.color, this.icon = Icons.info_outline_rounded});
  final String text;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(14), border: Border.all(color: color.withValues(alpha: 0.35))),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.w600, height: 1.35))),
        ]),
      );
}

/// A label with its value, one under the other (the vehicle details).
class DetailRow extends StatelessWidget {
  const DetailRow(this.label, this.value, {super.key});
  final String label, value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
          const SizedBox(height: 2),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14.5)),
        ]),
      );
}

/// The screen's one filled button, pinned above the keyboard and the home bar. Label only (no icon); a long label (French, or text at
/// 200%) shrinks to one line instead of overflowing; while [busy] the label becomes a same-size spinner.
class PinnedCta extends StatelessWidget {
  const PinnedCta(this.label, {super.key, required this.onPressed, this.busy = false});
  final String label;
  final VoidCallback onPressed;
  final bool busy;

  @override
  Widget build(BuildContext context) => SafeArea(
        minimum: const EdgeInsets.fromLTRB(20, 8, 20, 12),
        child: SizedBox(
          width: double.infinity,
          child: FilledButton(onPressed: busy ? null : onPressed, child: busy ? const ButtonSpinner() : ButtonLabel(label)),
        ),
      );
}
