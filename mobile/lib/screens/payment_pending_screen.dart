import 'dart:async';
import 'package:flutter/material.dart';
import '../data/catalog_live.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import '../services/engage_store.dart';
import '../services/models.dart';
import '../services/realtime_store.dart';
import '../theme/app_theme.dart';
import '../util/format.dart';
import '../widgets/kit.dart';
import 'order_success_screen.dart';

/// Shown after a mobile-money order is placed. The order stays `pending` until
/// the customer approves the request on their phone; the server then pushes the
/// result (no polling). Handles approval, decline/timeout (with retry) and
/// cancelling.
class PaymentPendingScreen extends StatefulWidget {
  final Locale locale;
  final String orderId;
  const PaymentPendingScreen({super.key, required this.locale, required this.orderId});

  @override
  State<PaymentPendingScreen> createState() => _PaymentPendingScreenState();
}

class _PaymentPendingScreenState extends State<PaymentPendingScreen> {
  bool _cancelling = false;
  bool _navigated = false;
  bool _checking = false;

  void _goSuccess() {
    if (_navigated || !mounted) return;
    _navigated = true;
    Navigator.pushReplacement(
        context, MaterialPageRoute(builder: (_) => OrderSuccessScreen(locale: widget.locale, orderId: widget.orderId)));
  }

  Future<void> _cancel() async {
    setState(() => _cancelling = true);
    try {
      await RealtimeStore.instance.cancelOrder(widget.orderId);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
    } finally {
      if (mounted) setState(() => _cancelling = false);
    }
  }

  /// Ask the server for the payment's current state (in case a push was missed).
  Future<void> _check(PaymentDto? payment) async {
    final s = Strings.of(context);
    if (payment == null) return;
    setState(() => _checking = true);
    try {
      final p = await RealtimeStore.instance.refreshPayment(payment.reference);
      if (!mounted) return;
      if (p.isPending) {
        ScaffoldMessenger.of(context)
          ..hideCurrentSnackBar()
          ..showSnackBar(SnackBar(content: Text(s.ppStillWaiting)));
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  /// Put the order's lines back in the cart so the customer can try again.
  void _retry(OrderDto order) {
    for (final i in order.items) {
      final p = productByUuid(i.productId);
      if (p != null && EngageStore.instance.vacationOf(p) == null) ShopState.instance.addToCart(p, variant: i.variant, qty: i.qty);
    }
    Navigator.popUntil(context, (r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: RealtimeStore.instance,
      builder: (context, _) {
        final store = RealtimeStore.instance;
        final order = store.orderById(widget.orderId);
        if (order == null) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (order.status != 'pending' && order.status != 'cancelled') {
          WidgetsBinding.instance.addPostFrameCallback((_) => _goSuccess());
        }
        final payment = store.paymentForOrder(order.id);
        final s = Strings.of(context);
        final failed = order.status == 'cancelled';

        return Scaffold(
          body: SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(children: [
                const Spacer(),
                Container(
                  height: 108,
                  width: 108,
                  decoration: BoxDecoration(
                    color: (failed ? AppColors.danger : AppColors.primary).withValues(alpha: 0.10),
                    shape: BoxShape.circle,
                  ),
                  child: failed
                      ? const Icon(Icons.error_outline_rounded, size: 56, color: AppColors.danger)
                      : const Padding(padding: EdgeInsets.all(34), child: CircularProgressIndicator(strokeWidth: 3.2)),
                ),
                const SizedBox(height: 26),
                Text(
                  failed
                      ? s.ppFailedTitle
                      : s.ppApproveTitle,
                  key: const ValueKey('pending-title'),
                  style: Theme.of(context).textTheme.headlineSmall,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 10),
                Text(
                  failed
                      ? (payment?.failureReason == null ? s.ppOrderCancelled : s.serverError(payment!.failureReason!))
                      : s.ppRequestSent(s.paymentLabel(order.paymentMethod), money(order.totalUsd)),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.muted, fontSize: 14.5, height: 1.4),
                ),
                if (!failed) ...[
                  const SizedBox(height: 14),
                  PaymentExpiryHint(createdAt: order.createdAt),
                ],
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                  decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(100)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.receipt_long_rounded, size: 18, color: AppColors.primary),
                    const SizedBox(width: 8),
                    Text(order.reference, style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary, fontSize: 14)),
                  ]),
                ),
                const Spacer(),
                if (failed) ...[
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      key: const ValueKey('retry'),
                      onPressed: () => _retry(order),
                      child: Text(s.retry),
                    ),
                  ),
                ] else ...[
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      key: const ValueKey('cancel-order'),
                      onPressed: _cancelling ? null : _cancel,
                      child: Text(s.cancelOrder),
                    ),
                  ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton.tonal(
                      key: const ValueKey('check-payment'),
                      onPressed: _checking || payment == null ? null : () => _check(payment),
                      child: _checking ? const ButtonSpinner() : Text(s.ppCheck),
                    ),
                  ),
                  TextButton(
                    onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                    child: ButtonLabel(s.ppContinue),
                  ),
                ],
              ]),
            ),
          ),
        );
      },
    );
  }
}

/// "Unapproved requests expire after 15 minutes", with the time left when known.
class PaymentExpiryHint extends StatefulWidget {
  final DateTime? createdAt;
  const PaymentExpiryHint({super.key, required this.createdAt});

  @override
  State<PaymentExpiryHint> createState() => _PaymentExpiryHintState();
}

class _PaymentExpiryHintState extends State<PaymentExpiryHint> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final created = widget.createdAt;
    var text = s.ppExpiryDefault;
    if (created != null) {
      final left = created.add(const Duration(minutes: 15)).difference(DateTime.now());
      if (left.isNegative) {
        text = s.ppExpiryMaybe;
      } else {
        final mm = left.inMinutes.toString().padLeft(2, '0');
        final ss = (left.inSeconds % 60).toString().padLeft(2, '0');
        text = s.ppExpiresIn('$mm:$ss');
      }
    }
    return Row(mainAxisAlignment: MainAxisAlignment.center, children: [
      const Icon(Icons.timer_outlined, size: 16, color: AppColors.muted),
      const SizedBox(width: 6),
      Flexible(child: Text(text, key: const ValueKey('expiry-hint'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600))),
    ]);
  }
}
