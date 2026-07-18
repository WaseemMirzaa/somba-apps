import 'package:flutter/material.dart';
import '../services/models.dart';
import '../services/realtime_store.dart';
import '../theme/app_theme.dart';

/// Live realtime console backed by the WebSocket connection to the Somba&Teka
/// backend. Demonstrates the mobile app sharing the SAME live state as the web
/// dashboards: place an order here and it appears instantly on the admin web
/// console (and vice-versa for status updates).
class LiveConsoleScreen extends StatefulWidget {
  const LiveConsoleScreen({super.key});

  @override
  State<LiveConsoleScreen> createState() => _LiveConsoleScreenState();
}

class _LiveConsoleScreenState extends State<LiveConsoleScreen> {
  final store = RealtimeStore.instance;
  final _email = TextEditingController(text: 'customer@somba.app');
  final _password = TextEditingController(text: 'Somba@2026');
  bool _busy = false;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    setState(() => _busy = true);
    try {
      await store.login(_email.text.trim(), _password.text);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _placeOrder() async {
    if (store.products.isEmpty) return;
    setState(() => _busy = true);
    try {
      await store.placeOrder(
        productId: store.products.first.id,
        address: {'city': 'Kinshasa', 'line1': '12 Ave du Commerce'},
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Order placed — watch it update live')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString())),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: store,
      builder: (context, _) {
        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            title: const Text('Realtime'),
            backgroundColor: AppColors.surface,
            foregroundColor: AppColors.ink,
            elevation: 0,
            actions: [
              if (store.user != null)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: _ConnectionChip(status: store.status),
                ),
            ],
          ),
          body: store.user == null ? _loginView() : _dashboard(),
        );
      },
    );
  }

  Widget _loginView() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const SizedBox(height: 24),
          Text('Live backend session',
              style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 6),
          const Text(
            'Sign in to open a WebSocket to the Somba&Teka backend. Orders and '
            'notifications sync live with the web dashboards.',
            style: TextStyle(color: AppColors.muted),
          ),
          const SizedBox(height: 20),
          TextField(
            controller: _email,
            decoration: const InputDecoration(
              labelText: 'Email',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(
              labelText: 'Password',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(
            onPressed: _busy ? null : _login,
            style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(_busy ? 'Signing in…' : 'Sign in'),
            ),
          ),
          const SizedBox(height: 12),
          const Text('Demo: customer@somba.app · Somba@2026',
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.faint, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _dashboard() {
    return RefreshIndicator(
      onRefresh: () async {},
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Hi, ${store.user!.name}',
                    style: Theme.of(context).textTheme.titleMedium),
              ),
              TextButton(
                onPressed: store.logout,
                child: const Text('Sign out',
                    style: TextStyle(color: AppColors.danger)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          FilledButton.icon(
            onPressed: _busy || store.products.isEmpty ? null : _placeOrder,
            style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
            icon: const Icon(Icons.add_shopping_cart_rounded),
            label: const Text('Place test order'),
          ),
          const SizedBox(height: 20),
          _sectionTitle('My orders', trailing: 'live'),
          if (store.orders.isEmpty)
            _emptyHint('No orders yet — place one above.'),
          ...store.orders.map(_orderTile),
          const SizedBox(height: 20),
          _sectionTitle('Notifications',
              trailing: store.unreadCount > 0 ? '${store.unreadCount} new' : null),
          if (store.notifications.isEmpty) _emptyHint('Nothing yet.'),
          ...store.notifications.take(15).map(_notifTile),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _sectionTitle(String text, {String? trailing}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Text(text,
              style: const TextStyle(
                  fontWeight: FontWeight.w700, color: AppColors.ink)),
          const Spacer(),
          if (trailing != null)
            Text(trailing,
                style: const TextStyle(color: AppColors.muted, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _emptyHint(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Center(
          child: Text(text, style: const TextStyle(color: AppColors.faint)),
        ),
      );

  Widget _orderTile(OrderDto order) {
    final loc = store.riderLocations[order.id];
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: AppRadius.card,
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(order.reference,
                    style: const TextStyle(fontWeight: FontWeight.w700)),
              ),
              _StatusPill(status: order.status),
            ],
          ),
          const SizedBox(height: 4),
          Text('\$${order.totalUsd.toStringAsFixed(2)} · ${order.paymentMethod}',
              style: const TextStyle(color: AppColors.muted, fontSize: 13)),
          if (loc != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Row(
                children: [
                  const Icon(Icons.location_on_rounded,
                      size: 14, color: AppColors.success),
                  const SizedBox(width: 4),
                  Text(
                    'Rider @ ${loc.lat.toStringAsFixed(3)}, ${loc.lng.toStringAsFixed(3)}',
                    style: const TextStyle(
                        color: AppColors.success, fontSize: 12),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _notifTile(NotificationDto notif) {
    return InkWell(
      onTap: () => store.markRead(notif.id),
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: notif.read ? AppColors.surface : const Color(0xFFFFF1F2),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: notif.read ? AppColors.line : AppColors.primary
                  .withValues(alpha: 0.3)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(notif.title,
                style: const TextStyle(
                    fontWeight: FontWeight.w600, color: AppColors.ink)),
            const SizedBox(height: 2),
            Text(notif.body,
                style: const TextStyle(color: AppColors.muted, fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

class _ConnectionChip extends StatelessWidget {
  final ConnStatus status;
  const _ConnectionChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      ConnStatus.connected => (AppColors.success, 'Live'),
      ConnStatus.connecting => (AppColors.amber, 'Connecting'),
      ConnStatus.error => (AppColors.danger, 'Error'),
      ConnStatus.disconnected => (AppColors.faint, 'Offline'),
    };
    return Row(
      children: [
        Icon(Icons.circle, size: 10, color: color),
        const SizedBox(width: 4),
        Text(label, style: TextStyle(color: color, fontSize: 12)),
      ],
    );
  }
}

class _StatusPill extends StatelessWidget {
  final String status;
  const _StatusPill({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'delivered' => AppColors.success,
      'cancelled' || 'returned' => AppColors.danger,
      'pending' => AppColors.amber,
      _ => AppColors.royalBlue,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(100),
      ),
      child: Text(
        status.replaceAll('_', ' '),
        style: TextStyle(
            color: color, fontSize: 11, fontWeight: FontWeight.w600),
      ),
    );
  }
}
