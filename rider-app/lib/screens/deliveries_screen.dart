import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../l10n/strings.dart';
import '../services/history_filter.dart';
import '../services/location_reporter.dart';
import '../services/maps_config.dart';
import '../services/models.dart';
import '../services/navigation_link.dart';
import '../services/auth_service.dart' show ApiException;
import '../services/rider_store.dart';
import '../theme/app_theme.dart';
import '../services/delivery_proof.dart';
import '../widgets/ui.dart';
import 'delivery_proof_sheet.dart';
import 'location_access_screen.dart';
import 'task_route_screen.dart';

/// Ids of the failure reasons a rider can pick (texts: `fail_<id>`).
const kFailReasonIds = ['unreachable', 'wrong_address', 'refused', 'payment', 'other'];

/// The next status a rider can set, and the key of its button. `delivered` is never offered on a leg that ends
/// at a warehouse: the warehouse staff scan the parcel in.
(String, String)? nextStatusFor(DeliveryTaskDto t) {
  switch (t.status) {
    case 'assigned':
      return ('picked_up', switch (t.kind) {
        LegKind.pickup || LegKind.express => 'act_picked_up_seller',
        LegKind.returnPickup => 'act_picked_up_customer',
        _ => 'act_picked_up',
      });
    case 'picked_up':
      return ('in_transit', switch (t.kind) {
        LegKind.delivery || LegKind.express || LegKind.replacementDelivery => 'act_in_transit',
        LegKind.returnToSeller => 'act_in_transit_seller',
        _ => 'act_in_transit_hub',
      });
    case 'in_transit':
      if (t.endsAtHub) return null;
      return ('delivered', t.kind == LegKind.returnToSeller ? 'act_delivered_seller' : 'act_delivered');
  }
  return null;
}

/// The rider's work: the legs the warehouse assigned (pickups, transfers, deliveries, returns, replacements) and
/// what was finished. Riders cannot accept or pick tasks: the warehouse staff assign them. Everything is live.
class DeliveriesScreen extends StatefulWidget {
  /// Opens a navigation link; defaults to the system (Google Maps app / browser, Apple Maps on an iPhone). Replaced in tests.
  final Future<bool> Function(Uri uri)? launcher;

  /// Tests: pretend to be an iPhone (or not), and say whether the Google Maps app is installed.
  final bool? isIPhone;
  final Future<bool> Function()? googleInstalled;

  /// Tests: choose the days of the history filter without driving the Material picker.
  final Future<DateTimeRange?> Function(DateTimeRange? current)? pickDays;

  /// Tests: draw something else than the Google map on the route map screen.
  final RouteMapBuilder? routeMapBuilder;
  const DeliveriesScreen({super.key, this.launcher, this.isIPhone, this.googleInstalled, this.pickDays, this.routeMapBuilder});
  @override
  State<DeliveriesScreen> createState() => _DeliveriesScreenState();
}

class _DeliveriesScreenState extends State<DeliveriesScreen> with WidgetsBindingObserver {
  final store = RiderStore.instance;
  int _tab = 0; // 0 active · 1 done
  bool _busy = false;

  /// The Done list's search (order reference) and date range.
  final _search = TextEditingController();
  DateTimeRange? _range;

  /// Transfer runs whose parcel list is open.
  final Set<String> _openRuns = {};

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    store.focus.addListener(_onFocus);
    _onFocus();
  }

  /// Back from the phone's location settings (or from another app): if a ride is on and the position is not being
  /// shared, try to start sharing again.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) store.retryLocation();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    store.focus.removeListener(_onFocus);
    _search.dispose();
    super.dispose();
  }

  /// A tapped notification: open Active or Done, then clear the request.
  void _onFocus() {
    final sub = store.focus.value?.deliveriesTab;
    if (sub == null) return;
    setState(() => _tab = sub);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (store.focus.value?.deliveriesTab != null) store.focus.value = null;
    });
  }

  /// Runs an action; a completed one says so, a failed one says why (both in a snackbar).
  Future<void> _run(Future<void> Function() action, {String? done}) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted && done != null) showSnack(context, done);
    } catch (e) {
      if (mounted) showSnack(context, Strings.current.errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static const _rationaleSeenKey = 'somba.rider.bgLocationExplained';

  /// Before the first ride: a full screen that says why the position is shared (also with the screen off), then the phone's
  /// own prompt. When the rider already allowed location, nothing is shown. A rider who answers "Not now" is not asked by the
  /// phone again on this ride: the card says location is off and offers "Open settings". Shown once per install.
  Future<void> _explainBackgroundLocation() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (prefs.getBool(_rationaleSeenKey) == true || !mounted) return;
      final access = await store.location.checkAccess();
      if (access == LocationAccess.granted || !mounted) return;
      final allowed = await Navigator.of(context).push<bool>(
        MaterialPageRoute(fullscreenDialog: true, builder: (_) => LocationAccessScreen(reporter: store.location, initial: access)),
      );
      store.location.promptsAllowed = allowed != false;
      await prefs.setBool(_rationaleSeenKey, true);
    } catch (_) {/* storage unavailable: skip the explanation */}
  }

  Future<bool> _confirm(String title, String body, {String? yes}) async {
    final s = Strings.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s.notYet)),
          FilledButton(key: const ValueKey('confirm-dialog'), onPressed: () => Navigator.pop(ctx, true), child: Text(yes ?? s.yesCollected)),
        ],
      ),
    );
    return ok == true && mounted;
  }

  Future<void> _askCode(DeliveryTaskDto t, ) async {
    // The dialog keeps itself open and shows the server's error until the code is right.
    final done = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => DeliveryCodeDialog(onSubmit: (code) => store.advance(t.id, 'delivered', code: code)),
    );
    if (done == true && mounted) showSnack(context, Strings.of(context).doneDelivered);
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
      await _run(() => store.advance(t.id, 'failed', reason: reason), done: s.doneFailed);
      return;
    }
    if (to == 'delivered') {
      if (t.collectOld && !await _confirm(s.collectOldTitle, s.collectOldBody(t.customerName ?? s.theCustomer))) return;
      // Optional proof at the door: a photo and the customer's signature, saved on the server before the leg is completed.
      // The code below is checked exactly as before; the sheet only adds the proof.
      if (t.takesProof && mounted) {
        final go = await showModalBottomSheet<bool>(
          context: context,
          isScrollControlled: true,
          showDragHandle: true,
          builder: (ctx) => DeliveryProofSheet(taskId: t.id),
        );
        if (go != true || !mounted) return;
      }
      // The customer's code is asked on the customer delivery only (never on a hub-bound leg, a return or a replacement).
      if (t.needsCode && store.requireDeliveryCode) return _askCode(t);
      try {
        setState(() => _busy = true);
        await store.advance(t.id, 'delivered');
        if (mounted) showSnack(context, s.doneDelivered);
      } catch (e) {
        // The setting was not known yet but the server wants the code: ask for it.
        if (e is ApiException && e.message.startsWith('Wrong delivery code') && mounted) {
          setState(() => _busy = false);
          return _askCode(t);
        }
        if (mounted) showSnack(context, Strings.current.errorText(e));
      } finally {
        if (mounted) setState(() => _busy = false);
      }
      return;
    }
    await _run(() => store.advance(t.id, to), done: to == 'picked_up' ? s.donePickedUp : s.doneInTransit);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final s = Strings.of(context);
        // Done can be searched by order reference and narrowed to some days.
        final filtering = _tab == 1 && (_search.text.trim().isNotEmpty || _range != null);
        final allDone = store.finished.length + store.finishedRuns.length;
        final lists = [
          store.active,
          filtering ? filterFinishedTasks(store.finished, query: _search.text, from: _range?.start, to: _range?.end) : store.finished,
        ];
        final rows = lists[_tab];
        // This driver's transfer runs come first, one card each; their parcels are inside the card.
        final runs = _tab == 0
            ? store.activeRuns
            : filtering
                ? filterFinishedRuns(store.finishedRuns, store.tasksOfRun, query: _search.text, from: _range?.start, to: _range?.end)
                : store.finishedRuns;
        final total = runs.length + rows.length;
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
                _seg(s.tabActive, 0, store.active.length + store.activeRuns.length),
                const SizedBox(width: 8),
                _seg(s.tabDone, 1, store.finished.length + store.finishedRuns.length),
              ]),
            ]),
          ),
          if (_tab == 1 && store.loaded && allDone > 0) _historyBar(s),
          Expanded(
            child: RefreshIndicator(
              onRefresh: store.refresh,
              child: !store.loaded
                  ? ListView(children: const [SizedBox(height: 120), Center(child: CircularProgressIndicator())])
                  : total == 0
                      ? ListView(children: [const SizedBox(height: 90), _empty(s, noMatch: filtering)])
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 110),
                          itemCount: total,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (_, i) => i < runs.length ? _runCard(s, runs[i], alone: total == 1) : _taskCard(s, rows[i - runs.length], alone: total == 1),
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

  Widget _empty(Strings s, {bool noMatch = false}) {
    final msg = noMatch ? s.historyNoMatch : [s.emptyActive, s.emptyDone][_tab];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Column(children: [
        Icon(Icons.inbox_rounded, size: 56, color: AppColors.faint),
        const SizedBox(height: 12),
        Text(msg, key: const ValueKey('empty-tasks'), textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, height: 1.4)),
      ]),
    );
  }

  /// A card's main action, label only. Filled only when the card is [alone] on
  /// the list, so the screen never shows more than one filled button.
  Widget _cardAction({required Key key, required bool alone, required VoidCallback? onPressed, required String label}) => SizedBox(
        width: double.infinity,
        child: alone
            ? FilledButton(key: key, onPressed: onPressed, child: ButtonLabel(label))
            : OutlinedButton(key: key, onPressed: onPressed, child: ButtonLabel(label)),
      );

  String _kindLabel(Strings s, DeliveryTaskDto t) => s.has('kind_${t.kind}') ? s.t('kind_${t.kind}') : t.kind.replaceAll('_', ' ');

  String _statusLabel(Strings s, DeliveryTaskDto t) {
    if (t.status == 'delivered' && t.endsAtHub) return s.taskScannedIn;
    return s.has('task_${t.status}') ? s.t('task_${t.status}') : t.status.replaceAll('_', ' ');
  }

  Widget _taskCard(Strings s, DeliveryTaskDto t, {required bool alone}) {
    final next = nextStatusFor(t);
    final nav = navTargetFor(t);
    final hubName = (t.toHubName ?? s.theWarehouse);
    return SurfaceCard(
      key: ValueKey('task-${t.id}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(t.orderReference, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
          Pill(_statusLabel(s, t), color: _statusColor(t.status).withValues(alpha: 0.14), textColor: _statusColor(t.status)),
        ]),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Wrap(spacing: 6, runSpacing: 6, children: [
            Pill(_kindLabel(s, t), key: ValueKey('kind-${t.id}'), color: AppColors.violet.withValues(alpha: 0.12), textColor: AppColors.violet),
            if (t.attempts > 1) _attemptPill(s, t),
            if (t.readyAt != null && t.kind == LegKind.pickup) Pill(s.sellerReady, color: AppColors.success.withValues(alpha: 0.14), textColor: AppColors.success),
            if (t.isExpress) Pill(s.kindExpress, key: ValueKey('express-${t.id}'), color: AppColors.accent.withValues(alpha: 0.18), textColor: const Color(0xFF92610A)),
            if (t.partial) Pill(s.partOfOrder, key: ValueKey('partial-${t.id}'), color: AppColors.info.withValues(alpha: 0.14), textColor: AppColors.info),
            if (t.receivedAt != null && t.kind == LegKind.delivery) Pill(s.receivedAtHub, color: AppColors.primary.withValues(alpha: 0.12), textColor: AppColors.primary),
          ]),
        ),
        if (t.isRelayHop) _hopLabel(ValueKey('hop-${t.id}'), s.hopRoute(t.hop!, t.hops!, t.fromHubName, t.toHubName)),
        ..._legLines(s, t),
        if (t.status == 'failed' && t.failureReason != null)
          Container(
            key: ValueKey('failure-${t.id}'),
            margin: const EdgeInsets.only(top: 4, bottom: 4),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              const Icon(Icons.error_outline_rounded, size: 18, color: AppColors.danger),
              const SizedBox(width: 8),
              Expanded(child: Text(s.failedWithReason(t.failureReason), style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 13))),
            ]),
          ),
        if (t.items.isNotEmpty) _line(Icons.shopping_bag_outlined, _itemsText(s, t)),
        if (t.deliverByText != null && t.isCustomerLeg) _line(Icons.event_available_rounded, s.deliverBy(t.deliverByText)),
        if (t.isActive && nav?.kind == NavKind.customer && nav?.pin != null && t.status != 'assigned') _line(Icons.push_pin_rounded, s.pinExact),
        if (t.isActive && nav != null)
          Padding(
            padding: const EdgeInsets.only(top: 6),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                key: ValueKey('navigate-${t.id}'),
                onPressed: () => _navigate(s, nav),
                child: ButtonLabel(switch (nav.kind) {
                  NavKind.seller => s.navigateSeller,
                  NavKind.hub => s.navigateHub,
                  NavKind.pickup => s.navigatePickup,
                  NavKind.customer => s.navigateCustomer,
                }),
              ),
            ),
          ),
        if (t.isActive && nav != null && MapsConfig.enabled)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(key: ValueKey('route-map-${t.id}'), onPressed: () => _openRouteMap(t), child: ButtonLabel(s.routeMap)),
            ),
          ),
        if (t.collectOld && t.isActive)
          Container(
            key: ValueKey('collect-old-${t.id}'),
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.violet.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(14)),
            child: Row(children: [
              const Icon(Icons.swap_horiz_rounded, color: AppColors.violet),
              const SizedBox(width: 10),
              Expanded(child: Text(s.collectOld, style: const TextStyle(fontWeight: FontWeight.w700, color: AppColors.violet))),
            ]),
          ),
        if (t.endsAtHub && t.isActive)
          Container(
            key: ValueKey('handover-${t.id}'),
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14)),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.warehouse_rounded, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(s.handoverAt(hubName), style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary)),
                  if (t.status == 'in_transit')
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(s.waitingScan, key: ValueKey('waiting-scan-${t.id}'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                    ),
                ]),
              ),
            ]),
          ),
        if (t.isActive && t.needsCode && store.requireDeliveryCode && t.status != 'assigned')
          Padding(padding: const EdgeInsets.only(top: 8), child: Text(s.codeHint, key: ValueKey('code-hint-${t.id}'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5))),
        if (t.status == 'in_transit') _gpsRow(s, toCustomer: t.isCustomerLeg || t.kind == LegKind.replacementDelivery),
        if (next != null) ...[
          const SizedBox(height: 12),
          _cardAction(
            key: ValueKey('next-${t.id}'),
            alone: alone,
            onPressed: _busy ? null : () => _advance(t, next.$1),
            label: s.t(next.$2),
          ),
        ],
        if (t.isActive)
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              key: ValueKey('fail-${t.id}'),
              onPressed: _busy ? null : () => _advance(t, 'failed'),
              style: TextButton.styleFrom(foregroundColor: AppColors.danger),
              child: Text(s.couldNotDeliver),
            ),
          ),
      ]),
    );
  }

  /// "Hop 1/2 · Limete → Kinshasa": this leg is one hop of a route through several warehouses.
  Widget _hopLabel(Key key, String text) => Container(
        key: key,
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(color: AppColors.violet.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(10)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.alt_route_rounded, size: 16, color: AppColors.violet),
          const SizedBox(width: 6),
          Expanded(child: Text(text, style: const TextStyle(color: AppColors.violet, fontWeight: FontWeight.w700, fontSize: 12.5, height: 1.3))),
        ]),
      );

  /// "On the road" for the whole run: every parcel in it goes in transit. The GPS follows, as for any ride.
  Future<void> _runOnRoad(TransferRun r) async {
    await _explainBackgroundLocation();
    if (!mounted) return;
    await _run(() => store.markRunOnRoad(r.id), done: Strings.of(context).doneRunOnRoad);
  }

  /// One card for a transfer run (UC-11): where it goes and how many parcels, the parcels, "On the road", and the
  /// hand-over at the receiving warehouse (its staff scan the run in; the driver has nothing to confirm).
  Widget _runCard(Strings s, TransferRun r, {required bool alone}) {
    final parcels = store.tasksOfRun(r);
    final onRoad = store.runOnRoad(r);
    final hop = store.runHop(r);
    final to = r.toHubName ?? s.theWarehouse;
    final (label, color) = r.isClosed
        ? (s.runStatusClosed, AppColors.success)
        : r.isArrived
            ? (s.runStatusArrived, AppColors.success)
            : onRoad
                ? (s.runStatusOnRoad, AppColors.primary)
                : r.isDispatched
                    ? (s.runStatusLoaded, AppColors.accent)
                    : (s.runStatusPlanned, AppColors.muted);
    final nav = r.isDispatched && parcels.isNotEmpty ? navTargetFor(parcels.first) : null;
    final open = _openRuns.contains(r.id);
    return SurfaceCard(
      key: ValueKey('run-${r.id}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(r.reference, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
          Pill(label, key: ValueKey('run-status-${r.id}'), color: color.withValues(alpha: 0.14), textColor: color),
        ]),
        const SizedBox(height: 8),
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Pill(s.kindRun, key: ValueKey('kind-run-${r.id}'), color: AppColors.violet.withValues(alpha: 0.12), textColor: AppColors.violet),
        ),
        if (hop != null) _hopLabel(ValueKey('hop-run-${r.id}'), s.hopRoute(hop.hop, hop.hops, r.fromHubName, r.toHubName)),
        _title(Icons.swap_horiz_rounded, s.runTitle(to, r.count)),
        _line(Icons.warehouse_rounded, s.legTransferFrom(r.fromHubName ?? s.theWarehouse)),
        if (r.isArrived || r.isClosed || r.receivedCount > 0) _line(Icons.inventory_2_outlined, s.runReceived(r.receivedCount, r.count)),
        if (r.missingCount > 0)
          Container(
            key: ValueKey('run-missing-${r.id}'),
            margin: const EdgeInsets.only(top: 4, bottom: 4),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: AppColors.danger.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              const Icon(Icons.error_outline_rounded, size: 18, color: AppColors.danger),
              const SizedBox(width: 8),
              Expanded(child: Text(s.runMissing(r.missingCount), style: const TextStyle(color: AppColors.danger, fontWeight: FontWeight.w700, fontSize: 13))),
            ]),
          ),
        if (parcels.isNotEmpty) ...[
          InkWell(
            key: ValueKey('run-parcels-${r.id}'),
            borderRadius: BorderRadius.circular(8),
            onTap: () => setState(() => open ? _openRuns.remove(r.id) : _openRuns.add(r.id)),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Row(children: [
                const Icon(Icons.inventory_2_rounded, size: 17, color: AppColors.muted),
                const SizedBox(width: 8),
                Expanded(child: Text(s.runParcels(parcels.length), style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700))),
                Icon(open ? Icons.expand_less_rounded : Icons.expand_more_rounded, color: AppColors.muted),
              ]),
            ),
          ),
          if (open)
            for (final t in parcels)
              Padding(
                key: ValueKey('run-parcel-${t.id}'),
                padding: const EdgeInsets.only(left: 25, bottom: 5),
                child: Text.rich(
                  TextSpan(children: [
                    TextSpan(text: t.orderReference, style: const TextStyle(fontWeight: FontWeight.w800)),
                    if (t.items.isNotEmpty) TextSpan(text: ' · ${_itemsText(s, t)}'),
                  ]),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, height: 1.3),
                ),
              ),
        ],
        if (r.isPlanned)
          Padding(padding: const EdgeInsets.only(top: 4), child: Text(s.runWaitLoad, key: ValueKey('run-wait-${r.id}'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)))
        else if (!r.isClosed)
          Container(
            key: ValueKey('run-handover-${r.id}'),
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14)),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.warehouse_rounded, color: AppColors.primary),
              const SizedBox(width: 10),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(r.allReceived ? s.handedOverAt(to) : s.handoverAt(to), style: const TextStyle(fontWeight: FontWeight.w800, color: AppColors.primary)),
                  if (r.allReceived)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(s.runAllIn, key: ValueKey('run-all-in-${r.id}'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                    )
                  else if (onRoad || r.isArrived)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(s.waitingScan, key: ValueKey('run-waiting-scan-${r.id}'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, height: 1.3)),
                    ),
                ]),
              ),
            ]),
          ),
        if (onRoad && !r.isArrived && !r.isClosed) _gpsRow(s, toCustomer: false),
        if (nav != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(key: ValueKey('run-navigate-${r.id}'), onPressed: () => _navigate(s, nav), child: ButtonLabel(s.navigateHub)),
            ),
          ),
        if (nav != null && MapsConfig.enabled)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: SizedBox(
              width: double.infinity,
              child: OutlinedButton(key: ValueKey('run-route-map-${r.id}'), onPressed: () => _openRouteMap(parcels.first), child: ButtonLabel(s.routeMap)),
            ),
          ),
        if (r.isDispatched && !onRoad) ...[
          const SizedBox(height: 12),
          _cardAction(key: ValueKey('run-next-${r.id}'), alone: alone, onPressed: _busy ? null : () => _runOnRoad(r), label: s.actRunOnRoad),
        ],
      ]),
    );
  }

  /// What the card says about the leg, by kind: who to go to, where, and where the parcel ends up.
  List<Widget> _legLines(Strings s, DeliveryTaskDto t) {
    final customer = (t.customerName ?? '').isNotEmpty ? _line(Icons.person_rounded, t.customerName!) : null;
    final custAddress = _line(Icons.location_on_rounded, t.address.isEmpty ? s.addressMissing : t.address);
    final phone = t.phone != null ? _line(Icons.phone_rounded, t.phone!) : null;
    final seller = t.sellerLabel ?? s.theSeller;
    final toHub = t.toHub ?? (t.to?.isHub == true ? t.to : null);
    final fromHub = t.fromHub ?? (t.from?.isHub == true ? t.from : null);
    String where(TaskEndpoint? e) => e == null ? s.theWarehouse : (e.label.isEmpty ? s.theWarehouse : e.label);
    // Before the rider has the parcel it is at a warehouse (deliveries, replacements, returns to the seller).
    final fetchAtHub = t.status == 'assigned' && fromHub != null ? _line(Icons.warehouse_rounded, s.collectAt(where(fromHub))) : null;

    switch (t.kind) {
      case LegKind.pickup:
        final from = t.from;
        final addr = from?.address ?? t.pickupAddress;
        return [
          _title(Icons.storefront_rounded, s.legPickupTitle(seller)),
          _line(Icons.location_on_rounded, addr ?? s.addressMissing),
          _line(Icons.warehouse_rounded, s.legBringTo(where(toHub))),
        ];
      case LegKind.transfer:
        return [
          _title(Icons.swap_horiz_rounded, s.legTransferTitle(toHub?.name ?? s.theWarehouse)),
          _line(Icons.warehouse_rounded, s.legTransferFrom(where(fromHub))),
          _line(Icons.location_on_rounded, toHub?.address ?? where(toHub)),
        ];
      case LegKind.returnPickup:
        return [
          _title(Icons.assignment_return_rounded, s.legReturnPickupTitle),
          if (customer != null) customer,
          custAddress,
          if (phone != null) phone,
          _line(Icons.warehouse_rounded, s.legBringTo(where(toHub))),
        ];
      case LegKind.returnTransfer:
        return [
          _title(Icons.swap_horiz_rounded, s.legReturnTransferTitle(toHub?.name ?? s.theWarehouse)),
          _line(Icons.warehouse_rounded, s.legTransferFrom(where(fromHub))),
          _line(Icons.location_on_rounded, toHub?.address ?? where(toHub)),
        ];
      case LegKind.returnToSeller:
        final to = t.to;
        return [
          _title(Icons.storefront_rounded, s.legReturnSellerTitle(seller)),
          _line(Icons.location_on_rounded, to?.address ?? t.pickupAddress ?? s.addressMissing),
          if (fetchAtHub != null) fetchAtHub,
        ];
      case LegKind.express:
        // Straight from the store to the customer: collect at the store first, then the customer's door.
        final from = t.from;
        final storeAddr = from?.address ?? t.pickupAddress;
        final beforePickup = t.status == 'assigned';
        return [
          _title(Icons.bolt_rounded, s.legExpressTitle(seller)),
          if (beforePickup && storeAddr != null) _line(Icons.storefront_rounded, s.collectAt(storeAddr)),
          if (customer != null) customer,
          _line(Icons.location_on_rounded, t.isFinished ? (t.address.isEmpty ? s.addressMissing : t.address) : s.deliverTo(t.address.isEmpty ? s.addressMissing : t.address)),
          if (phone != null) phone,
        ];
      case LegKind.replacementDelivery:
        return [
          _title(Icons.local_shipping_rounded, s.legReplacementTitle),
          if (customer != null) customer,
          _line(Icons.location_on_rounded, t.isFinished ? (t.address.isEmpty ? s.addressMissing : t.address) : s.deliverTo(t.address.isEmpty ? s.addressMissing : t.address)),
          if (phone != null) phone,
          if (fetchAtHub != null) fetchAtHub,
        ];
      default: // delivery, and anything a newer server invents: the customer's door
        return [
          if (customer != null) customer,
          if (fetchAtHub == null && t.status == 'assigned' && t.pickupAddress != null && fromHub == null) _line(Icons.storefront_rounded, s.collectAt(t.pickupAddress)),
          if (fetchAtHub != null) fetchAtHub,
          _line(
              Icons.location_on_rounded,
              t.isFinished || (t.pickupAddress == null && t.from == null)
                  ? (t.address.isEmpty ? s.addressMissing : t.address)
                  : s.deliverTo(t.address.isEmpty ? s.addressMissing : t.address)),
          if (phone != null) phone,
        ];
    }
  }

  /// The in-app route map of a task: the rider, the next stop and the line between them. Navigate stays the way to drive.
  void _openRouteMap(DeliveryTaskDto t) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => TaskRouteScreen(task: t, launcher: widget.launcher, isIPhone: widget.isIPhone, googleInstalled: widget.googleInstalled, mapBuilder: widget.routeMapBuilder),
    ));
  }

  Future<void> _navigate(Strings s, NavTarget target) async {
    final opened = await openNavigation(
      pin: target.pin,
      addressText: target.addressText,
      launcher: widget.launcher,
      isIPhone: widget.isIPhone,
      googleInstalled: widget.googleInstalled,
      choose: () => _chooseMapsApp(s),
    );
    if (!opened && mounted) showSnack(context, s.navFailed);
  }

  /// iPhone with both maps apps: which one to use for this trip (a tap outside cancels).
  Future<MapsApp?> _chooseMapsApp(Strings s) => showModalBottomSheet<MapsApp>(
        context: context,
        showDragHandle: true,
        builder: (ctx) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
              child: Text(s.navChooseTitle, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            ),
            ListTile(key: const ValueKey('nav-choice-google'), title: Text(s.navGoogleMaps), onTap: () => Navigator.pop(ctx, MapsApp.google)),
            ListTile(key: const ValueKey('nav-choice-apple'), title: Text(s.navAppleMaps), onTap: () => Navigator.pop(ctx, MapsApp.apple)),
            const SizedBox(height: 8),
          ]),
        ),
      );

  Future<void> _pickRange(Strings s) async {
    final now = DateTime.now();
    final picked = widget.pickDays != null
        ? await widget.pickDays!(_range)
        : await showDateRangePicker(
            context: context,
            firstDate: DateTime(now.year - 2),
            lastDate: DateTime(now.year, now.month, now.day),
            initialDateRange: _range,
          );
    if (picked != null && mounted) setState(() => _range = picked);
  }

  String _rangeLabel(BuildContext context, Strings s) {
    final r = _range;
    if (r == null) return s.historyAnyDate;
    final m = MaterialLocalizations.of(context);
    final a = m.formatShortDate(r.start), b = m.formatShortDate(r.end);
    return a == b ? a : '$a – $b';
  }

  /// Search by order reference and a date range, above the Done list.
  Widget _historyBar(Strings s) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          TextField(
            key: const ValueKey('history-search'),
            controller: _search,
            onChanged: (_) => setState(() {}),
            textInputAction: TextInputAction.search,
            autocorrect: false,
            textCapitalization: TextCapitalization.characters,
            decoration: InputDecoration(
              hintText: s.historySearchHint,
              prefixIcon: const Icon(Icons.search_rounded, size: 20),
              suffixIcon: _search.text.isEmpty
                  ? null
                  : IconButton(key: const ValueKey('history-search-clear'), tooltip: s.historyClear, icon: const Icon(Icons.close_rounded, size: 18), onPressed: () => setState(_search.clear)),
              isDense: true,
              filled: true,
              fillColor: AppColors.surface,
              enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
              focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.primary, width: 1.6)),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
            ),
          ),
          const SizedBox(height: 8),
          Row(children: [
            ActionChip(
              key: const ValueKey('history-date'),
              avatar: const Icon(Icons.calendar_today_rounded, size: 16),
              label: Text(_rangeLabel(context, s)),
              onPressed: () => _pickRange(s),
            ),
            if (_range != null) TextButton(key: const ValueKey('history-date-clear'), onPressed: () => setState(() => _range = null), child: Text(s.historyClear)),
          ]),
        ]),
      );

  /// Who follows the driver: the customer on a delivery to them; only the warehouses on pickups and transfers (the server
  /// never sends those positions to a customer).
  Widget _gpsRow(Strings s, {required bool toCustomer}) {
    final a = store.lastLocationAccess;
    final sharing = store.location.running;
    final (icon, color, text) = sharing
        ? (Icons.my_location_rounded, AppColors.success, toCustomer ? s.gpsSharing : s.gpsSharingHub)
        : switch (a) {
            LocationAccess.denied => (Icons.location_off_rounded, AppColors.danger, toCustomer ? s.gpsDenied : s.gpsDeniedHub),
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

  Widget _title(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 18, color: AppColors.primary),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w800, height: 1.3))),
        ]),
      );

  Widget _line(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 5),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, size: 17, color: AppColors.muted),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13.5, height: 1.3))),
        ]),
      );

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
          decoration: AppInput.multiline(label: s.failDetails).copyWith(counterText: null),
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
        FilledButton(key: const ValueKey('delivery-code-submit'), onPressed: _busy ? null : _submit, child: ButtonLabel(_busy ? s.codeChecking : s.codeConfirm)),
      ],
    );
  }
}
