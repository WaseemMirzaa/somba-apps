import 'package:flutter/material.dart';
import '../services/models.dart';
import '../services/rider_store.dart';
import '../theme/app_theme.dart';

const _green = Color(0xFF059669);

/// Live delivery tasks backed by the WebSocket link to the Somba&Teka backend.
/// Accept from the unassigned pool, advance status, and stream GPS — every
/// action pushes live to the customer app and web dashboards.
class LiveTasksScreen extends StatefulWidget {
  const LiveTasksScreen({super.key});

  @override
  State<LiveTasksScreen> createState() => _LiveTasksScreenState();
}

class _LiveTasksScreenState extends State<LiveTasksScreen> {
  final store = RiderStore.instance;
  final _email = TextEditingController(text: 'rider@somba.app');
  final _password = TextEditingController(text: 'Somba@2026');
  bool _busy = false;

  static const _next = {
    'assigned': ['picked_up'],
    'picked_up': ['in_transit'],
    'in_transit': ['delivered', 'failed'],
  };

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action) async {
    setState(() => _busy = true);
    try {
      await action();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(e.toString())));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _streamGps(DeliveryTaskDto t) async {
    const base = [-4.325, 15.322];
    for (var i = 0; i < 5; i++) {
      await store.sendLocation(t.id, base[0] + i * 0.001, base[1] + i * 0.001);
      await Future.delayed(const Duration(milliseconds: 600));
    }
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Streamed live GPS to the customer')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: store,
      builder: (context, _) => Scaffold(
        backgroundColor: AppColors.background,
        appBar: AppBar(
          title: const Text('Live tasks'),
          backgroundColor: AppColors.surface,
          foregroundColor: AppColors.ink,
          elevation: 0,
          actions: [
            if (store.user != null)
              Center(child: _chip(store.status)),
            const SizedBox(width: 12),
          ],
        ),
        body: store.user == null ? _login() : _tasks(),
      ),
    );
  }

  Widget _chip(ConnStatus status) {
    final (c, l) = switch (status) {
      ConnStatus.connected => (_green, 'Live'),
      ConnStatus.connecting => (AppColors.accent, 'Connecting'),
      ConnStatus.error => (AppColors.danger, 'Error'),
      ConnStatus.disconnected => (AppColors.faint, 'Offline'),
    };
    return Row(children: [
      Icon(Icons.circle, size: 10, color: c),
      const SizedBox(width: 4),
      Text(l, style: TextStyle(color: c, fontSize: 12)),
    ]);
  }

  Widget _login() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const SizedBox(height: 24),
        Text('Rider sign-in',
            style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        const Text(
          'Connect to the backend to receive delivery tasks live.',
          style: TextStyle(color: AppColors.muted),
        ),
        const SizedBox(height: 20),
        TextField(
          controller: _email,
          decoration: const InputDecoration(
              labelText: 'Email', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: true,
          decoration: const InputDecoration(
              labelText: 'Password', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy
              ? null
              : () => _run(() => store.login(_email.text.trim(), _password.text)),
          style: FilledButton.styleFrom(backgroundColor: AppColors.primary),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Text(_busy ? 'Signing in…' : 'Sign in'),
          ),
        ),
        const SizedBox(height: 12),
        const Text('Demo: rider@somba.app · Somba@2026',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppColors.faint, fontSize: 12)),
      ]),
    );
  }

  Widget _tasks() {
    return RefreshIndicator(
      onRefresh: store.refresh,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(children: [
            Expanded(
                child: Text('Hi, ${store.user!.name}',
                    style: Theme.of(context).textTheme.titleMedium)),
            TextButton(
                onPressed: store.logout,
                child: const Text('Sign out',
                    style: TextStyle(color: AppColors.danger))),
          ]),
          const SizedBox(height: 12),
          if (store.unassigned.isNotEmpty) ...[
            const _Heading('Available pool'),
            ...store.unassigned.map((t) => _poolTile(t)),
            const SizedBox(height: 16),
          ],
          const _Heading('My deliveries'),
          if (store.myTasks.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(
                  child: Text('No tasks yet — accept one from the pool.',
                      style: TextStyle(color: AppColors.faint))),
            ),
          ...store.myTasks.map((t) => _taskTile(t)),
          const SizedBox(height: 40),
        ],
      ),
    );
  }

  Widget _poolTile(DeliveryTaskDto t) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.accent.withValues(alpha: 0.4)),
      ),
      child: Row(children: [
        Expanded(
          child: Text('${t.orderReference} · COD \$${t.codAmountUsd.toStringAsFixed(2)}',
              style: const TextStyle(fontWeight: FontWeight.w600)),
        ),
        FilledButton(
          onPressed: _busy ? null : () => _run(() => store.accept(t.id)),
          style: FilledButton.styleFrom(backgroundColor: _green),
          child: const Text('Accept'),
        ),
      ]),
    );
  }

  Widget _taskTile(DeliveryTaskDto t) {
    final actions = _next[t.status] ?? const [];
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
              child: Text(t.orderReference,
                  style: const TextStyle(fontWeight: FontWeight.w700))),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(100),
            ),
            child: Text(t.status.replaceAll('_', ' '),
                style: const TextStyle(
                    color: AppColors.primary,
                    fontSize: 11,
                    fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final a in actions)
            FilledButton(
              onPressed: _busy ? null : () => _run(() => store.advance(t.id, a)),
              style: FilledButton.styleFrom(
                  backgroundColor: a == 'failed' ? AppColors.danger : AppColors.primary,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8)),
              child: Text('→ ${a.replaceAll('_', ' ')}'),
            ),
          if (t.status == 'assigned' ||
              t.status == 'picked_up' ||
              t.status == 'in_transit')
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _run(() => _streamGps(t)),
              icon: const Icon(Icons.my_location_rounded, size: 16),
              label: const Text('Stream GPS'),
            ),
        ]),
      ]),
    );
  }
}

class _Heading extends StatelessWidget {
  final String text;
  const _Heading(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text,
            style: const TextStyle(
                fontWeight: FontWeight.w700, color: AppColors.ink)),
      );
}
