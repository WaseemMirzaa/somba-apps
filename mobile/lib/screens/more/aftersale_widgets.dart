import 'package:flutter/material.dart';
import '../../l10n/strings.dart';
import '../../services/aftersale_models.dart';
import '../../services/env.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';

/// Text colour for amber badges and notices (the brand amber is too light to read as text).
const Color kAmberText = Color(0xFFB45309);

/// The public URL of an uploaded photo (the API may answer a path relative to its own host).
String uploadUrl(String url) {
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  return '${Env.apiUrl}${url.startsWith('/') ? '' : '/'}$url';
}

/// An exact amount for text that quotes what the server computed (a refund, a price difference). In francs it is
/// [money]; in dollars it keeps the cents (`money` rounds to whole dollars, which would turn a $12.50 refund into $13).
String exactMoney(Strings s, num usd) => secondaryMoney(usd) == null ? s.usd(usd) : money(usd);

/// A small tinted status badge.
class StatusBadge extends StatelessWidget {
  const StatusBadge({super.key, required this.label, required this.color, this.textColor});
  final String label;
  final Color color;
  final Color? textColor;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: AppRadius.pill),
        child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: textColor ?? color, fontSize: 11.5, fontWeight: FontWeight.w700)),
      );
}

/// Badge colour and text for a request's stage.
({Color color, Color text}) stageColors(DisputeView d) {
  if (d.isClosed) {
    if (d.wasCancelled) return (color: AppColors.muted, text: AppColors.inkSoft);
    return d.status == 'resolved' ? (color: AppColors.success, text: AppColors.success) : (color: AppColors.danger, text: AppColors.dangerStrong);
  }
  return switch (d.stage) {
    'seller_rejected' || 'seller_timeout' => (color: AppColors.danger, text: AppColors.dangerStrong),
    'approved' || 'pickup' || 'received' || 'escalated' => (color: AppColors.primary, text: AppColors.primaryDark),
    _ => (color: AppColors.amber, text: kAmberText),
  };
}

/// The short badge label of a request's stage (lists and the detail header).
String stageLabel(Strings s, DisputeView d) {
  if (d.isClosed) {
    if (d.wasCancelled) return s.asSbCancelled;
    return d.status == 'resolved' ? s.returnResolved : s.returnRejected;
  }
  if (!d.hasStage) return s.returnOpen;
  return switch (d.stage) {
    'seller_replied' => s.asSbReplied,
    'seller_rejected' => s.asSbRejected,
    'seller_timeout' => s.asSbTimeout,
    'escalated' => s.asSbEscalated,
    'approved' => s.asSbApproved,
    'pickup' => s.asSbPickup,
    'received' => s.asSbReceived,
    _ => s.asSbAwaiting,
  };
}

/// "$12.50 refunded to your wallet" (empty when nothing was refunded).
String refundText(Strings s, DisputeView d) {
  if (!d.hasRefund) return '';
  final amount = exactMoney(s, d.refundUsd);
  return d.refundTo == 'phone' ? s.asRefundPhone(amount) : s.asRefundWallet(amount);
}

/// The category the customer picked, worded in the user's language (the raw value when unknown).
String categoryLabel(Strings s, String? category) {
  final key = 'as_cat_${category ?? ''}';
  return category != null && s.has(key) ? s.t(key) : (category ?? '');
}

String outcomeLabel(Strings s, String? outcome) {
  final key = 'as_outcome_${outcome ?? ''}';
  return outcome != null && s.has(key) ? s.t(key) : '';
}

/// What the status banner of a request says.
class StageBanner {
  const StageBanner(this.title, this.body, this.icon, this.color, this.textColor);
  final String title;
  final String body;
  final IconData icon;
  final Color color;
  final Color textColor;
}

StageBanner stageBanner(Strings s, DisputeView d) {
  final c = stageColors(d);
  StageBanner b(String title, String body, IconData icon) => StageBanner(title, body, icon, c.color, c.text);
  if (d.isClosed) {
    if (d.wasCancelled) return b(s.asStCancelledTitle, s.asStCancelled, Icons.cancel_outlined);
    if (d.status == 'resolved') {
      if (d.outcome == 'replacement') return b(s.asStReplacementTitle, s.asStReplacement, Icons.autorenew_rounded);
      if (d.hasRefund) return b(s.asStRefundTitle, refundText(s, d), Icons.check_circle_rounded);
      return b(s.returnResolved, (d.resolution ?? '').isNotEmpty ? d.resolution! : '', Icons.check_circle_rounded);
    }
    return b(s.returnRejected, (d.resolution ?? '').isNotEmpty ? d.resolution! : s.asStDeclinedBody, Icons.cancel_rounded);
  }
  if (!d.hasStage) return b(s.returnOpen, s.returnReviewing, Icons.hourglass_top_rounded);
  switch (d.stage) {
    case 'seller_replied':
      return b(s.asStRepliedTitle, s.asStReplied, Icons.mark_chat_read_outlined);
    case 'seller_rejected':
      return b(s.asStRejectedTitle, s.asStNextSteps, Icons.thumb_down_alt_outlined);
    case 'seller_timeout':
      return b(s.asStTimeoutTitle, s.asStNextSteps, Icons.timer_off_outlined);
    case 'escalated':
      return b(s.asStEscalatedTitle, s.asStEscalated, Icons.support_agent_rounded);
    case 'approved':
      return b(s.asStApprovedTitle, s.asStApproved, Icons.check_circle_outline_rounded);
    case 'pickup':
      return b(s.asStPickupTitle, s.asStPickup, Icons.local_shipping_outlined);
    case 'received':
      return b(s.asStReceivedTitle, s.asStReceived, Icons.inventory_2_outlined);
    default:
      final due = d.sellerDueAt;
      final body = !d.isReturn
          ? s.asStAwaitingDispute
          : due == null
              ? s.asStAwaitingReturn
              : due.isAfter(DateTime.now())
                  ? s.asStAwaitingReturnDue(s.when(due))
                  : s.asStAwaitingLate;
      return b(s.asStAwaitingTitle, body, Icons.hourglass_top_rounded);
  }
}

/// A stepper bounded by [min] and [max] (units of an item). Keys: `<prefix>-dec`, `<prefix>-inc`, `<prefix>-value`.
class LimitedStepper extends StatelessWidget {
  const LimitedStepper({super.key, required this.value, required this.max, required this.onChanged, this.min = 0, required this.keyPrefix});
  final int value;
  final int min;
  final int max;
  final ValueChanged<int> onChanged;
  final String keyPrefix;

  @override
  Widget build(BuildContext context) {
    Widget btn(String k, IconData icon, bool enabled, VoidCallback onTap) => Material(
          color: Colors.transparent,
          shape: const CircleBorder(),
          child: InkWell(
            key: ValueKey('$keyPrefix-$k'),
            customBorder: const CircleBorder(),
            onTap: enabled ? onTap : null,
            child: Padding(padding: const EdgeInsets.all(8), child: Icon(icon, size: 18, color: enabled ? AppColors.ink : AppColors.faint)),
          ),
        );
    return Container(
      decoration: BoxDecoration(color: AppColors.background, borderRadius: AppRadius.pill, border: Border.all(color: AppColors.line)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        btn('dec', Icons.remove_rounded, value > min, () => onChanged(value - 1)),
        SizedBox(
          width: 32,
          child: Text('$value', key: ValueKey('$keyPrefix-value'), textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        ),
        btn('inc', Icons.add_rounded, value < max, () => onChanged(value + 1)),
      ]),
    );
  }
}

/// A row of photo thumbnails (the customer's own uploads); a tap opens the photo full screen.
class RemotePhotos extends StatelessWidget {
  const RemotePhotos({super.key, required this.urls, this.size = 72});
  final List<String> urls;
  final double size;

  Widget _image(String url, {BoxFit fit = BoxFit.cover}) => Image.network(
        uploadUrl(url),
        fit: fit,
        errorBuilder: (_, __, ___) => Container(color: AppColors.line, child: const Icon(Icons.image_not_supported_outlined, color: AppColors.faint)),
      );

  @override
  Widget build(BuildContext context) {
    if (urls.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 10, runSpacing: 10, children: [
      for (var i = 0; i < urls.length; i++)
        InkWell(
          key: ValueKey('photo-$i'),
          borderRadius: BorderRadius.circular(AppRadius.sm),
          onTap: () => showDialog<void>(
            context: context,
            builder: (ctx) => Dialog(
              backgroundColor: Colors.black,
              insetPadding: const EdgeInsets.all(AppSpace.lg),
              child: Stack(children: [
                InteractiveViewer(child: Center(child: _image(urls[i], fit: BoxFit.contain))),
                Positioned(
                  right: 4,
                  top: 4,
                  child: IconButton(
                    tooltip: Strings.of(context).close,
                    onPressed: () => Navigator.pop(ctx),
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                ),
              ]),
            ),
          ),
          child: ClipRRect(borderRadius: BorderRadius.circular(AppRadius.sm), child: SizedBox(width: size, height: size, child: _image(urls[i]))),
        ),
    ]);
  }
}

/// A load failure that fills the screen or a tab: the message and a retry button (the screen itself is the message).
class AfterSaleError extends StatelessWidget {
  const AfterSaleError({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.cloud_off_rounded, size: 40, color: AppColors.faint),
          const SizedBox(height: AppSpace.md),
          Text(s.errorText(error), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
          const SizedBox(height: AppSpace.lg),
          OutlinedButton(key: const ValueKey('as-retry'), onPressed: onRetry, child: Text(s.retry)),
        ]),
      ),
    );
  }
}

/// A small section heading inside a panel.
class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: AppSpace.sm),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
      );
}

/// "Label ........ value" with a long value wrapping instead of overflowing.
class KeyValueRow extends StatelessWidget {
  const KeyValueRow(this.label, this.value, {super.key});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
        const SizedBox(width: AppSpace.md),
        Expanded(child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13))),
      ]);
}

/// A tappable card with press feedback (lists of requests).
class PressableCard extends StatelessWidget {
  const PressableCard({super.key, required this.onTap, required this.child});
  final VoidCallback onTap;
  final Widget child;
  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.surface,
        borderRadius: AppRadius.card,
        child: InkWell(
          borderRadius: AppRadius.card,
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(borderRadius: AppRadius.card, boxShadow: AppShadow.card),
            padding: const EdgeInsets.all(AppSpace.lg),
            child: child,
          ),
        ),
      );
}

/// The leading icon tile of a card.
class IconTile extends StatelessWidget {
  const IconTile(this.icon, this.color, {super.key});
  final IconData icon;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
        height: 44,
        width: 44,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
        child: Icon(icon, color: color),
      );
}

/// The inline validation text under a field (also announced by a snackbar when a submit is blocked).
class FieldError extends StatelessWidget {
  const FieldError(this.text, {super.key, this.fieldKey});
  final String? text;
  final Key? fieldKey;
  @override
  Widget build(BuildContext context) => text == null
      ? const SizedBox.shrink()
      : Padding(
          padding: const EdgeInsets.only(top: 6, left: 4),
          child: Text(text!, key: fieldKey, style: const TextStyle(color: AppColors.dangerStrong, fontSize: 12.5, fontWeight: FontWeight.w600)),
        );
}

/// The primary button of a form or screen: label only, kept on one line (it shrinks rather than wraps or overflows),
/// and while [busy] the label is replaced by a spinner of the same height.
class SubmitButton extends StatelessWidget {
  const SubmitButton(this.label, {super.key, required this.busy, required this.onPressed});
  final String label;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        child: FilledButton(onPressed: busy ? null : onPressed, child: busy ? const ButtonSpinner() : ButtonLabel(label)),
      );
}
