import 'package:flutter/material.dart';
import '../services/location_reporter.dart';
import '../services/models.dart';
import '../services/rider_store.dart';
import '../theme/app_theme.dart';
import '../widgets/ui.dart';

/// The rider's work: deliveries on the road, the open pool to claim from, and
/// what was finished. Everything is live from the server.
class DeliveriesScreen extends StatefulWidget {
  const DeliveriesScreen({super.key});
  @override
  State<DeliveriesScreen> createState() => _DeliveriesScreenState();
}

class _DeliveriesScreenState extends State<DeliveriesScreen> {
  final store = RiderStore.instance;
  int _tab = 0; // 0 active · 1 available · 2 done
  bool _busy = false;

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  static const _next = {
    'assigned': ('picked_up', 'Picked up the parcel', Icons.inventory_2_rounded),
    'picked_up': ('in_transit', 'On my way to the customer', Icons.two_wheeler_rounded),
    'in_transit': ('delivered', 'Delivered', Icons.check_circle_rounded),
  };

  Future<void> _advance(DeliveryTaskDto t, String to) async {
    if (to == 'delivered' && t.collectsCash) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Cash collected?'),
          content: Text('Confirm you collected \$${t.codAmountUsd.toStringAsFixed(2)} in cash from ${t.customerName ?? 'the customer'}.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not yet')),
            FilledButton(key: const ValueKey('confirm-cash'), onPressed: () => Navigator.pop(ctx, true), child: const Text('Yes, collected')),
          ],
        ),
      );
      if (ok != true) return;
    }
    if (!mounted) return;
    if (to == 'failed') {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Mark as failed?'),
          content: const Text('Use this when the customer cannot be reached or refuses the parcel. Support will follow up.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(style: FilledButton.styleFrom(backgroundColor: AppColors.danger), onPressed: () => Navigator.pop(ctx, true), child: const Text('Mark failed')),
          ],
        ),
      );
      if (ok != true) return;
    }
    await _run(() => store.advance(t.id, to));
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final lists = [store.active, store.pool, store.finished];
        final rows = lists[_tab];
        final top = MediaQuery.of(context).padding.top;
        return Column(children: [
          Container(
            padding: EdgeInsets.fromLTRB(20, top + 16, 20, 18),
            decoration: const BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.vertical(bottom: Radius.circular(26))),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text('Hi, ${store.user?.name.split(' ').first ?? ''}', style: const TextStyle(color: Colors.white, fontSize: 21, fontWeight: FontWeight.w800))),
                _status(),
              ]),
              const SizedBox(height: 14),
              Row(children: [
                _seg('Active', 0, store.active.length),
                const SizedBox(width: 8),
                _seg('Available', 1, store.pool.length),
                const SizedBox(width: 8),
                _seg('Done', 2, store.finished.length),
              ]),
            ]),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: store.refresh,
              child: !store.loaded
                  ? ListView(children: const [SizedBox(height: 120), Center(child: CircularProgressIndicator())])
                  : rows.isEmpty
                      ? ListView(children: [const SizedBox(height: 90), _empty()])
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 14, 16, 110),
                          itemCount: rows.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 12),
                          itemBuilder: (_, i) => _tab == 1 ? _poolCard(rows[i]) : _taskCard(rows[i]),
                        ),
            ),
          ),
        ]);
      },
    );
  }

  Widget _status() {
    final (c, l) = switch (store.status) {
      ConnStatus.connected => (const Color(0xFF34D399), 'Online'),
      ConnStatus.connecting => (const Color(0xFFFBBF24), 'Connecting…'),
      ConnStatus.error => (const Color(0xFFF87171), 'Error'),
      ConnStatus.disconnected => (Colors.white54, 'Offline'),
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

  Widget _empty() {
    final msg = ['No delivery in progress.\nClaim one from “Available”.', 'No deliveries waiting right now.\nThey appear here the moment an order is paid.', 'Nothing finished yet.'][_tab];
    return Column(children: [
      Icon(Icons.inbox_rounded, size: 56, color: AppColors.faint),
      const SizedBox(height: 12),
      Text(msg, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.muted, height: 1.4)),
    ]);
  }

  Widget _poolCard(DeliveryTaskDto t) {
    return SurfaceCard(
      key: ValueKey('pool-${t.orderReference}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(t.orderReference, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
          if (t.collectsCash) Pill('COD \$${t.codAmountUsd.toStringAsFixed(2)}', color: AppColors.accent.withValues(alpha: 0.18), textColor: const Color(0xFF92610A)),
        ]),
        const SizedBox(height: 8),
        _line(Icons.location_on_rounded, t.address),
        if (t.items.isNotEmpty) _line(Icons.shopping_bag_outlined, _itemsText(t)),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            key: ValueKey('accept-${t.orderReference}'),
            onPressed: _busy ? null : () => _run(() => store.accept(t.id)),
            icon: const Icon(Icons.add_task_rounded, size: 20),
            label: const Text('Accept this delivery'),
          ),
        ),
      ]),
    );
  }

  Widget _taskCard(DeliveryTaskDto t) {
    final next = _next[t.status];
    return SurfaceCard(
      key: ValueKey('task-${t.orderReference}'),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text(t.orderReference, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
          Pill(t.status.replaceAll('_', ' '), color: _statusColor(t.status).withValues(alpha: 0.14), textColor: _statusColor(t.status)),
        ]),
        const SizedBox(height: 10),
        if ((t.customerName ?? '').isNotEmpty) _line(Icons.person_rounded, t.customerName!),
        _line(Icons.location_on_rounded, t.address),
        if (t.phone != null) _line(Icons.phone_rounded, t.phone!),
        if (t.items.isNotEmpty) _line(Icons.shopping_bag_outlined, _itemsText(t)),
        if (t.collectsCash && t.isActive)
          Container(
            margin: const EdgeInsets.only(top: 10),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(14)),
            child: Row(children: [
              const Icon(Icons.payments_rounded, color: Color(0xFF92610A)),
              const SizedBox(width: 10),
              Expanded(child: Text('Collect \$${t.codAmountUsd.toStringAsFixed(2)} in cash', style: const TextStyle(fontWeight: FontWeight.w800, color: Color(0xFF92610A)))),
            ]),
          )
        else if (t.isActive)
          const Padding(padding: EdgeInsets.only(top: 8), child: Text('Already paid online — no cash to collect.', style: TextStyle(color: AppColors.muted, fontSize: 12.5))),
        if (t.status == 'picked_up' || t.status == 'in_transit') _gpsRow(),
        if (next != null) ...[
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              key: ValueKey('next-${t.orderReference}'),
              onPressed: _busy ? null : () => _advance(t, next.$1),
              icon: Icon(next.$3, size: 20),
              label: Text(next.$2),
            ),
          ),
          if (t.status == 'in_transit' || t.status == 'picked_up')
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                key: ValueKey('fail-${t.orderReference}'),
                onPressed: _busy ? null : () => _advance(t, 'failed'),
                style: TextButton.styleFrom(foregroundColor: AppColors.danger),
                child: const Text('Could not deliver'),
              ),
            ),
        ],
      ]),
    );
  }

  Widget _gpsRow() {
    final a = store.lastLocationAccess;
    final sharing = store.location.running;
    final (icon, color, text) = sharing
        ? (Icons.my_location_rounded, AppColors.success, 'Sharing your live location with the customer')
        : switch (a) {
            LocationAccess.denied => (Icons.location_off_rounded, AppColors.danger, 'Location permission is off — the customer cannot follow you'),
            LocationAccess.deniedForever => (Icons.location_off_rounded, AppColors.danger, 'Location is blocked. Enable it in the phone settings.'),
            LocationAccess.serviceOff => (Icons.location_off_rounded, AppColors.danger, 'Turn on GPS to share your position'),
            _ => (Icons.location_searching_rounded, AppColors.muted, 'Getting your position…'),
          };
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Row(children: [
        Icon(icon, size: 18, color: color),
        const SizedBox(width: 8),
        Expanded(child: Text(text, key: const ValueKey('gps-status'), style: TextStyle(color: color, fontSize: 12.5, fontWeight: FontWeight.w600))),
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

  static String _itemsText(DeliveryTaskDto t) => t.items.map((i) => '${i.qty}× ${i.name}').join(', ');

  static Color _statusColor(String s) => switch (s) {
        'delivered' => AppColors.success,
        'failed' => AppColors.danger,
        'in_transit' => AppColors.primary,
        _ => AppColors.accent,
      };
}
