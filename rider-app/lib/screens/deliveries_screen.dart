import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../l10n/strings.dart';
import '../services/location_reporter.dart';
import '../services/models.dart';
import '../services/navigation_link.dart';
import '../services/rider_store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// Ids of the failure reasons a rider can pick (texts: `fail_<id>`).
const kFailReasonIds = ['unreachable', 'wrong_address', 'refused', 'payment', 'other'];

/// The rider's work: deliveries on the road, the open pool to claim from, and
/// what was finished. Everything is live from the server.
class DeliveriesScreen extends StatefulWidget {
  /// Opens a navigation link; defaults to the system (Google Maps app / browser). Replaced in tests.
  final Future<bool> Function(Uri uri)? launcher;
  const DeliveriesScreen({super.key, this.launcher});
  @override
  State<DeliveriesScreen> createState() => _DeliveriesScreenState();
}

class _DeliveriesScreenState extends State<DeliveriesScreen> {
  final store = RiderStore.instance;
  int _tab = 0; // 0 active · 1 available · 2 done
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    store.focus.addListener(_onFocus);
    _onFocus();
  }

  @override
  void dispose() {
    store.focus.removeListener(_onFocus);
    super.dispose();
  }

  /// A tapped notification: open Active or Available, then clear the request.
  void _onFocus() {
    final sub = store.focus.value?.deliveriesTab;
    if (sub == null) return;
    setState(() => _tab = sub);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (store.focus.value?.deliveriesTab != null) store.focus.value = null;
    });
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(Strings.current.errorText(e))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// status -> (next status, strings key of the button, icon)
  static const _next = {
    'assigned': ('picked_up', 'act_picked_up'),
    'picked_up': ('in_transit', 'act_in_transit'),
    'in_transit': ('delivered', 'act_delivered'),
  };


  static const _rationaleSeenKey = 'somba.rider.bgLocationExplained';

  /// Before the first ride: say why the position is shared even with the screen off.
  /// (The system permission prompt follows; this runs once per install.)
  Future<void> _explainBackgroundLocation() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(_rationaleSeenKey) == true || !mounted) return;
      final s = Strings.of(context);
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          key: const ValueKey('bg-location-rationale'),
          icon: const Icon(Icons.my_location_rounded, color: AppColors.primary),
          title: Text(s.bgRationaleTitle),
          content: Text(s.bgRationaleBody),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(s.bgRationaleContinue))],
        ),
      );
      await prefs.setBool(_rationaleSeenKey, true);
    } catch (_) {/* storage unavailable: skip the explanation */}
  }

  Future<void> _advance(DeliveryTaskDto t, String to) async {
    final s = Strings.of(context);
    if (to == 'in_transit') await _explainBackgroundLocation();
    if (!mounted) return;
    if (to == 'failed') {
      final reason = await showModalBottomSheet<String>(
        context: context,
        isScrollControlled: true,
        showDragHandle: true,
        builder: (ctx) => const FailReasonSheet(),
      );
      if (reason == null || !mounted) return;
      await _run(() => store.advance(t.id, 'failed', reason: reason));
      return;
    }
    if (to == 'delivered') {
      if (t.collectsCash) {
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text(s.cashTitle),
            content: Text(s.cashBody(s.usd(t.codAmountUsd), t.customerName ?? s.theCustomer)),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.notYet)),
              FilledButton(key: const ValueKey('confirm-cash'), onPressed: () => Navigator.pop(ctx, true), child: Text(s.yesCollected)),
            ],
          ),
        );
        if (ok != true || !mounted) return;
      }
      if (store.requireDeliveryCode) {
        // The dialog keeps itself open and shows the server's error until the code is right.
        await showDialog<bool>(
          context: context,
          barrierDismissible: false,
          builder: (ctx) => DeliveryCodeDialog(onSubmit: (code) => store.advance(t.id, 'delivered', code: code)),
        );
        return;
      }
    }
    await _run(() => store.advance(t.id, to));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final s = Strings.of(context);
        final lists = [store.active, store.pool, store.finished];
        final rows = lists[_tab];
        final top = MediaQuery.of(context).padding.top;
        return Column(children: [
          Container(
            padding: EdgeInsets.fromLTRB(20, top + 16, 20, 18),
            decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(26))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(s.hiName(store.user?.name.split(' ').first ?? ''), style: const TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w800))),
                _status(s),
              ]),
              const SizedBox(height: 14),
              Row(children: [
                _seg(s.tabActive, 0, store.active.length),
                const SizedBox(width: 8),
                _seg(s.tabAvailable, 1, store.pool.length),
                const SizedBox(width: 8),
                _seg(s.tabDone, 2, store.finished.length),
              ]),
            ]),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: store.refresh,
              child: !store.loaded
                  ? ListView(children: const [SizedBox(height: 120), Center(child: CircularProgressIndicator())])
                  : rows.isEmpty
                      ? ListView(children: [const SizedBox(height: 90), _empty(s)])
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 110),
                          itemCount: rows.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (_, i) =>
                              _tab == 1 ? _poolCard(s, rows[i], alone: rows.length == 1) : _taskCard(s, rows[i], alone: rows.length == 1),
                        ),
            ),
          ),
        ]);
      },
    );
  }

  Widget _status(Strings s) {
    final (c, l) = switch (store.status) {
      ConnStatus.connected => (const Color(0xFF34D399), s.connOnline),
      ConnStatus.connecting => (const Color(0xFFFBBF24), s.connConnecting),
      ConnStatus.error => (const Color(0xFFF87171), s.connError),
      ConnStatus.disconnected => (Colors.white54, s.connOffline),
    };
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.circle, size: 10, color: c),
      const SizedBox(width: 5),
      Text(l, key: const ValueKey('conn-status'), style: const TextStyle(color: Colors.white, fontSize: 12.5, fontWeight: FontWeight.w600)),
    ]);
  }

  Widget _seg(String label, int i, int count) {
    final sel = _tab == i;
    return Expanded(
      child: GestureDetector(
        key: ValueKey('tab-$i'),
        onTap: () => setState(() => _tab = i),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          alignment: Alignment.center,
          decoration: BoxDecoration(color: sel ? Colors.white : Colors.white.withValues(alpha: 0.18), borderRadius: BorderRadius.circular(100)),
          child: Text(count > 0 ? '$label · $count' : label,
              style: TextStyle(color: sel ? AppColors.primary : Colors.white, fontWeight: FontWeight.w700, fontSize: 12.5)),
        ),
      ),
    );
  }

  Widget _empty(Strings s) {
    final msg = [s.emptyActive, s.emptyAvailable, s.emptyDone][_tab];
    return Column(children: [
      Icon(Icons.inbox_rounded, size: 56, color: AppColors.faint),
      const SizedBox(height: 12),
      Text(msg, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, height: 1.4)),
    ]);
  }

  /// A card's main action, label only. Filled only when the card is [alone] on
  /// the list, so the screen never shows more than one filled button.
  Widget _cardAction({required Key key, required bool alone, required VoidCallback? onPressed, required String label}) => SizedBox(
        width: double.infinity,
        child: alone
            ? FilledButton(key: key, onPressed: onPressed, child: Text(label))
            : OutlinedButton(key: key, onPressed: onPressed, child: Text(label)),
      );

  Widget _poolCard(Strings s, DeliveryTaskDto t, {required bool alone}) {
    return SurfaceCard(
      key: ValueKey('pool-${t.orderReference}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(t.orderReference, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
          if (t.collectsCash) Pill(s.codPill(s.usd(t.codAmountUsd)), color: AppColors.accent.withValues(alpha: 0.18), textColor: const Color(0xFF92610A)),
        ]),
        const SizedBox(height: 8),
        if (t.pickupAddress != null) _line(Icons.storefront_rounded, s.collectAt(t.pickupAddress)),
        _line(Icons.location_on_rounded, s.deliverTo(_address(s, t))),
        if (t.items.isNotEmpty) _line(Icons.shopping_bag_outlined, _itemsText(s, t)),
        if (t.zoneName != null || t.preferred)
          Padding(
            padding: const EdgeInsets.only(top: 2, bottom: 4),
            child: Wrap(spacing: 6, runSpacing: 6, children: [
              if (t.zoneName != null) Pill(s.zoneLabel(t.zoneName), color: AppColors.primary.withValues(alpha: 0.10), textColor: AppColors.primary),
              if (t.preferred)
                Pill(s.yourZone, key: ValueKey('your-zone-${t.orderReference}'), color: AppColors.success.withValues(alpha: 0.14), textColor: AppColors.success),
            ]),
          ),
        if (t.attempts > 1) Padding(padding: const EdgeInsets.only(top: 2, bottom: 4), child: Wrap(children: [_attemptPill(s, t)])),
        const SizedBox(height: 12),
        _cardAction(
          key: ValueKey('accept-${t.orderReference}'),
          alone: alone,
          onPressed: _busy ? null : () => _run(() => store.accept(t.id)),
          label: s.acceptDelivery,
        ),
      ]),
    );
  }

  Widget _taskCard(Strings s, DeliveryTaskDto t, {required bool alone}) {
    final next = _next[t.status];
    return SurfaceCard(
      key: ValueKey('task-${t.orderReference}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(t.orderReference, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
          Pill(s.has('task_${t.status}') ? s.t('task_${t.status}') : t.status.replaceAll('_', ' '), color: _statusColor(t.status).withValues(alpha: 0.14), textColor: _statusColor(t.status)),
        ]),
        const SizedBox(height: 10),
        if (t.attempts > 1 || t.readyAt != null || t.receivedAt != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Wrap(spacing: 6, runSpacing: 6, children: [
              if (t.attempts > 1) _attemptPill(s, t),
              if (t.readyAt != null) Pill(s.sellerReady, color: AppColors.success.withValues(alpha: 0.14), textColor: AppColors.success),
              if (t.receivedAt != null) Pill(s.receivedAtHub, color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary),
            ]),
          ),
        if ((t.customerName ?? '').isNotEmpty) _line(Icons.person_rounded, t.customerName!),
        if (t.pickupAddress != null && (t.status == 'assigned' || t.isFinished)) _line(Icons.storefront_rounded, s.collectAt(t.pickupAddress)),
        _line(Icons.location_on_rounded, t.isFinished || t.pickupAddress == null ? _address(s, t) : s.deliverTo(_address(s, t))),
        if (t.status == 'failed' && t.failureReason != null)
          Container(
            key: ValueKey('failure-${t.orderReference}'),
            margin: const EdgeInsets.only(top: 4, bottom: 4),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              const Icon(Icons.error_outline_rounded, size: 18, color: AppColors.danger),
              const SizedBox(width: 8),
              Expanded(child: Text(s.failedWithReason(t.failureReason), style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 13))),
            ]),
          ),
        if (t.phone != null) _line(Icons.phone_rounded, t.phone!),
        if (t.items.isNotEmpty) _line(Icons.shopping_bag_outlined, _itemsText(s, t)),
        if (t.deliverByText != null) _line(Icons.event_available_rounded, s.deliverBy(t.deliverByText)),
        if (t.isActive && t.pin != null && t.status != 'assigned') _line(Icons.push_pin_rounded, s.pinExact),
        if (t.isActive)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                key: ValueKey('navigate-${t.orderReference}'),
                onPressed: () => _navigate(s, t),
                child: Text(_toPickup(t) ? s.navigatePickup : s.navigateCustomer),
              ),
            ),
          ),
        if (t.collectsCash && t.isActive)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
            child: Row(children: [
              const Icon(Icons.payments_rounded, color: Color(0xFF92610A)),
              const SizedBox(width: 10),
              Expanded(child: Text(s.collectCash(s.usd(t.codAmountUsd)), style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF92610A)))),
            ]),
          )
        else if (t.isActive)
          Padding(padding: const EdgeInsets.only(top: 8), child: Text(s.alreadyPaid, style: const TextStyle(color: AppColors.muted, fontSize: 12.5))),
        if (t.status == 'in_transit') _gpsRow(s),
        if (next != null) ...[
          const SizedBox(height: 12),
          _cardAction(
            key: ValueKey('next-${t.orderReference}'),
            alone: alone,
            onPressed: _busy ? null : () => _advance(t, next.$1),
            label: s.t(next.$2),
          ),
          if (t.isActive)
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                key: ValueKey('fail-${t.orderReference}'),
                onPressed: _busy ? null : () => _advance(t, 'failed'),
                style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                child: Text(s.couldNotDeliver),
              ),
            ),
        ],
      ]),
    );
  }

  /// Before pickup the rider heads to the seller; afterwards to the customer.
  static bool _toPickup(DeliveryTaskDto t) => t.status == 'assigned' && t.pickupAddress != null;

  Future<void> _navigate(Strings s, DeliveryTaskDto t) async {
    final toPickup = _toPickup(t);
    final opened = await openNavigation(
      pin: toPickup ? null : t.pin, // the pin is the customer's spot, never the seller's
      addressText: toPickup ? t.pickupAddress : t.mapsQuery,
      launcher: widget.launcher,
    );
    if (!opened && mounted) {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(content: Text(s.navFailed)));
    }
  }

  Widget _gpsRow(Strings s) {
    final a = store.lastLocationAccess;
    final sharing = store.location.running;
    final (icon, color, text) = sharing
        ? (Icons.my_location_rounded, AppColors.success, s.gpsSharing)
        : switch (a) {
            LocationAccess.denied => (Icons.location_off_rounded, AppColors.danger, s.gpsDenied),
            LocationAccess.deniedForever => (Icons.location_off_rounded, AppColors.danger, s.gpsBlocked),
            LocationAccess.serviceOff => (Icons.location_off_rounded, AppColors.danger, s.gpsOff),
            _ => (Icons.location_searching_rounded, AppColors.muted, s.gpsGetting),
          };
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 8),
        Expanded(child: Text(text, key: const ValueKey('gps-status'), style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w600))),
        if (!sharing && (a == LocationAccess.deniedForever || a == LocationAccess.serviceOff || a == LocationAccess.denied))
          TextButton(
            key: const ValueKey('open-location-settings'),
            onPressed: () async {
              await store.location.openSettings(a!);
            },
            child: Text(s.openSettings),
          ),
      ]),
    );
  }

  Widget _line(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 5),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 17, color: AppColors.muted),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13.5, height: 1.3))),
        ]),
      );

  /// The delivery address, or a "not provided" line.
  static String _address(Strings s, DeliveryTaskDto t) => t.address.isEmpty ? s.addressMissing : t.address;

  Widget _attemptPill(Strings s, DeliveryTaskDto t) => Pill(s.attemptN(t.attempts), color: AppColors.accent.withValues(alpha: 0.18), textColor: const Color(0xFF92610A));

  static String _itemsText(Strings s, DeliveryTaskDto t) => t.items.map((i) => i.text(s.lang)).join(', ');

  static Color _statusColor(String s) => switch (s) {
        'delivered' => AppColors.success,
        'failed' => AppColors.danger,
        'in_transit' => AppColors.primary,
        _ => AppColors.accent,
      };
}


/// Bottom sheet: why the parcel could not be delivered (sent to the customer's support trail).
class FailReasonSheet extends StatefulWidget {
  const FailReasonSheet({super.key});
  @override
  State<FailReasonSheet> createState() => _FailReasonSheetState();
}

class _FailReasonSheetState extends State<FailReasonSheet> {
  String? _chip;
  final _other = TextEditingController();

  @override
  void dispose() {
    _other.dispose();
    super.dispose();
  }

  /// The reason as sent to support/the customer: in the rider's language.
  String? _reason(Strings s) {
    final extra = _other.text.trim();
    if (_chip == null) return extra.isEmpty ? null : extra;
    final label = s.t('fail_$_chip');
    if (_chip == 'other') return extra.isEmpty ? null : s.failOtherPrefix(extra);
    return extra.isEmpty ? label : '$label - $extra';
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final reason = _reason(s);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 20),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(s.failTitle, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
        const SizedBox(height: 4),
        Text(s.failHint, style: const TextStyle(color: AppColors.muted, fontSize: 13)),
        const SizedBox(height: 14),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final r in kFailReasonIds)
            ChoiceChip(
              key: ValueKey('reason-$r'),
              label: Text(s.t('fail_$r')),
              selected: _chip == r,
              onSelected: (_) => setState(() => _chip = r),
            ),
        ]),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('reason-text'),
          controller: _other,
          maxLength: 200,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(labelText: s.failDetails, border: const OutlineInputBorder()),
        ),
        SizedBox(
          width: double.infinity,
          child: FilledButton(
            key: const ValueKey('reason-submit'),
            style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
            onPressed: reason == null ? null : () => Navigator.pop(context, reason),
            child: Text(s.failSubmit),
          ),
        ),
      ]),
    );
  }
}

/// Asks for the customer's 4-digit delivery code. Stays open and shows the
/// server's message ("Wrong delivery code…") until the code is accepted.
class DeliveryCodeDialog extends StatefulWidget {
  final Future<void> Function(String code) onSubmit;
  const DeliveryCodeDialog({super.key, required this.onSubmit});
  @override
  State<DeliveryCodeDialog> createState() => _DeliveryCodeDialogState();
}

class _DeliveryCodeDialogState extends State<DeliveryCodeDialog> {
  final _ctrl = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _ctrl.text.trim();
    if (code.length != 4) {
      setState(() => _error = Strings.of(context).codeErrLen);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.onSubmit(code);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = Strings.current.errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    return AlertDialog(
      title: Text(s.codeTitle),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(s.codeBody),
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('delivery-code-field'),
          controller: _ctrl,
          autofocus: true,
          keyboardType: TextInputType.number,
          maxLength: 4,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 26, letterSpacing: 8, fontWeight: FontWeight.w800),
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: const InputDecoration(counterText: '', border: OutlineInputBorder(), hintText: '0000'),
          onSubmitted: (_) => _submit(),
        ),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, key: const ValueKey('delivery-code-error'), style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w600))),
      ]),
      actions: [
        TextButton(onPressed: _busy ? null : () => Navigator.pop(context, false), child: Text(s.cancel)),
        FilledButton(key: const ValueKey('delivery-code-submit'), onPressed: _busy ? null : _submit, child: Text(_busy ? s.codeChecking : s.codeConfirm)),
      ],
    );
  }
}
