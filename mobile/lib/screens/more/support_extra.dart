import 'dart:convert';
import 'package:flutter/material.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';

/// Add a delivery address (saved on the server, encrypted at rest).
class AddressFormScreen extends StatefulWidget {
  final Locale locale;
  const AddressFormScreen({super.key, this.locale = const Locale('en')});
  @override
  State<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends State<AddressFormScreen> {
  final _label = TextEditingController(text: 'Home');
  final _phone = TextEditingController();
  final _line1 = TextEditingController();
  final _commune = TextEditingController();
  final _city = TextEditingController(text: 'Kinshasa');
  bool _default = false;
  bool _busy = false;
  String? _lineErr, _cityErr;

  @override
  void dispose() {
    for (final c in [_label, _phone, _line1, _commune, _city]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _lineErr = _line1.text.trim().isEmpty ? 'Enter the street address' : null;
      _cityErr = _city.text.trim().isEmpty ? 'Enter the city' : null;
    });
    if (_lineErr != null || _cityErr != null) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await RealtimeStore.instance.addAddress({
        'label': _label.text.trim().isEmpty ? 'Home' : _label.text.trim(),
        'line1': _line1.text.trim(),
        if (_commune.text.trim().isNotEmpty) 'commune': _commune.text.trim(),
        'city': _city.text.trim(),
        if (_phone.text.trim().isNotEmpty) 'phone': _phone.text.trim(),
        if (_default) 'isDefault': true,
      });
      if (!mounted) return;
      messenger.showSnackBar(const SnackBar(content: Text('Address saved')));
      Navigator.pop(context);
    } catch (e) {
      if (mounted) setState(() => _busy = false);
      messenger.showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Add address'),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [
        AppField(label: 'Label', hint: 'Home, Work…', icon: Icons.bookmark_outline_rounded, controller: _label),
        const SizedBox(height: 16),
        AppField(label: 'Phone (for the rider)', hint: '+243 81 234 5678', icon: Icons.phone_outlined, keyboard: TextInputType.phone, controller: _phone),
        const SizedBox(height: 16),
        AppField(label: 'Street address', hint: '12 Commerce Ave', icon: Icons.location_on_outlined, controller: _line1, error: _lineErr),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(child: AppField(label: 'Commune', hint: 'Gombe', controller: _commune)),
          const SizedBox(width: 12),
          Expanded(child: AppField(label: 'City', hint: 'Kinshasa', controller: _city, error: _cityErr)),
        ]),
        const SizedBox(height: 16),
        CheckboxListTile(
          contentPadding: EdgeInsets.zero,
          controlAffinity: ListTileControlAffinity.leading,
          value: _default,
          onChanged: (v) => setState(() => _default = v ?? false),
          title: const Text('Set as default address', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
        ),
        const SizedBox(height: 12),
        FilledButton(
          key: const ValueKey('save-address'),
          onPressed: _busy ? null : _save,
          child: Text(_busy ? '…' : 'Save address'),
        ),
      ]),
    );
  }
}

/// A support ticket as returned by `support:list` (messages is a JSON array).
class TicketView {
  final String id;
  final String reference;
  final String subject;
  final String status;
  final List<({String from, String role, String text})> messages;

  TicketView({required this.id, required this.reference, required this.subject, required this.status, required this.messages});

  factory TicketView.fromJson(Map<String, dynamic> j) {
    List<dynamic> raw = const [];
    try {
      raw = jsonDecode((j['messages'] as String?) ?? '[]') as List;
    } catch (_) {}
    return TicketView(
      id: j['id'] as String,
      reference: j['reference'] as String? ?? '',
      subject: j['subject'] as String? ?? '',
      status: j['status'] as String? ?? 'open',
      messages: raw
          .map((m) => (from: (m['from'] ?? '').toString(), role: (m['role'] ?? '').toString(), text: (m['text'] ?? '').toString()))
          .toList(),
    );
  }

  Color get color => switch (status) {
        'resolved' || 'closed' => AppColors.success,
        'pending' => AppColors.primary,
        _ => AppColors.amber,
      };
  String get label => switch (status) { 'pending' => 'In progress', 'resolved' => 'Resolved', 'closed' => 'Closed', _ => 'Open' };
}

class SupportListScreen extends StatefulWidget {
  final Locale locale;
  const SupportListScreen({super.key, this.locale = const Locale('en')});
  @override
  State<SupportListScreen> createState() => _SupportListScreenState();
}

class _SupportListScreenState extends State<SupportListScreen> {
  late Future<List<TicketView>> _future = _load();

  Future<List<TicketView>> _load() async => ((await RealtimeStore.instance.call('support:list')) as List)
      .map((e) => TicketView.fromJson((e as Map).map((k, v) => MapEntry(k.toString(), v))))
      .toList();

  Future<void> _newTicket() async {
    final subject = TextEditingController();
    final message = TextEditingController();
    final created = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + MediaQuery.of(ctx).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const Text('New support ticket', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'PlusJakartaSans')),
          const SizedBox(height: 12),
          TextField(key: const ValueKey('ticket-subject'), controller: subject, decoration: const InputDecoration(labelText: 'Subject')),
          const SizedBox(height: 10),
          TextField(key: const ValueKey('ticket-message'), controller: message, maxLines: 4, decoration: const InputDecoration(labelText: 'How can we help?')),
          const SizedBox(height: 14),
          FilledButton(
            key: const ValueKey('ticket-submit'),
            onPressed: () async {
              final nav = Navigator.of(ctx);
              final messenger = ScaffoldMessenger.of(context);
              try {
                await RealtimeStore.instance.call('support:open', {'subject': subject.text, 'message': message.text});
                nav.pop(true);
              } catch (e) {
                messenger.showSnackBar(SnackBar(content: Text(e.toString())));
              }
            },
            child: const Text('Send'),
          ),
        ]),
      ),
    );
    if (created == true && mounted) setState(() => _future = _load());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Support'),
      body: FutureBuilder<List<TicketView>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snap.hasError) return Center(child: Text('${snap.error}', style: const TextStyle(color: AppColors.muted)));
          final tickets = snap.data ?? const <TicketView>[];
          return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            if (tickets.isEmpty) const Panel(child: Text('No tickets yet. Need help? Open one below.', style: TextStyle(color: AppColors.muted))),
            ...tickets.map((t) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: GestureDetector(
                  onTap: () async {
                    await Navigator.push(context, MaterialPageRoute(builder: (_) => SupportTicketDetailScreen(ticket: t)));
                    if (mounted) setState(() => _future = _load());
                  },
                  child: Panel(
                    child: Row(children: [
                      Container(
                          height: 44,
                          width: 44,
                          decoration: BoxDecoration(color: t.color.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                          child: Icon(Icons.confirmation_number_outlined, color: t.color)),
                      const SizedBox(width: 12),
                      Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(t.subject, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        Text(t.reference, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                      ])),
                      Pill(t.label, color: t.color.withValues(alpha: 0.14), textColor: t.color, fontSize: 10.5),
                    ]),
                  ),
                ))),
            const SizedBox(height: 4),
            PrimaryButton('New ticket', icon: Icons.add_rounded, onPressed: _newTicket),
          ]);
        },
      ),
    );
  }
}

class HelpScreen extends StatelessWidget {
  final Locale locale;
  const HelpScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    const faqs = [
      ('How do I track my order?', 'Open Account → My Orders and tap the order. Its status updates live, and once a rider is on the way you can see the live position.'),
      ('Which payment methods are accepted?', 'Airtel Money, Orange Money and Vodacom M-Pesa, or your Somba&Teka wallet. You approve mobile-money payments on your phone.'),
      ('What are the delivery fees?', 'The fee depends on your delivery zone and is shown at checkout before you pay.'),
      ('What if my payment is not approved?', 'The order is cancelled automatically and the items are released. Nothing is charged; you can simply try again.'),
      ('How do I contact support?', 'Open Account → Support and create a ticket. Replies appear there and as notifications.'),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Help & support'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        PrimaryButton('Contact support',
            icon: Icons.support_agent_rounded,
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SupportListScreen(locale: locale)))),
        const SectionHeader('FAQs', padding: EdgeInsets.fromLTRB(4, 22, 4, 10)),
        Panel(
            padding: EdgeInsets.zero,
            child: Column(children: [
              for (int i = 0; i < faqs.length; i++) ...[
                ExpansionTile(
                  shape: const Border(),
                  collapsedShape: const Border(),
                  tilePadding: const EdgeInsets.symmetric(horizontal: 16),
                  title: Text(faqs[i].$1, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
                  childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                  expandedCrossAxisAlignment: CrossAxisAlignment.start,
                  children: [Text(faqs[i].$2, style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.4))],
                ),
                if (i != faqs.length - 1) const Divider(height: 1),
              ],
            ])),
        const SizedBox(height: 16),
        TextButton.icon(
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountDeleteScreen())),
          style: TextButton.styleFrom(foregroundColor: AppColors.accentDark),
          icon: const Icon(Icons.delete_outline_rounded, size: 18),
          label: const Text('Delete my account'),
        ),
      ]),
    );
  }
}

/// Permanently erases the account (the server checks the password).
class AccountDeleteScreen extends StatefulWidget {
  /// Called after the account is deleted (returns the app to sign-in).
  final VoidCallback? onDeleted;
  const AccountDeleteScreen({super.key, this.onDeleted});
  @override
  State<AccountDeleteScreen> createState() => _AccountDeleteScreenState();
}

class _AccountDeleteScreenState extends State<AccountDeleteScreen> {
  final _pw = TextEditingController();
  bool _busy = false;
  String? _err;

  @override
  void dispose() {
    _pw.dispose();
    super.dispose();
  }

  Future<void> _delete() async {
    if (_pw.text.isEmpty) {
      setState(() => _err = 'Enter your password to confirm');
      return;
    }
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await RealtimeStore.instance.deleteAccount(_pw.text);
      if (!mounted) return;
      Navigator.of(context).popUntil((r) => r.isFirst);
      widget.onDeleted?.call();
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _err = e.toString();
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Delete account'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(20)),
          child: const Column(children: [
            Icon(Icons.warning_amber_rounded, color: AppColors.accentDark, size: 40),
            SizedBox(height: 10),
            Text('This action is permanent', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.accentDark)),
            SizedBox(height: 6),
            Text('Your personal data, addresses and wishlist are erased and you are signed out everywhere. Past orders are kept for accounting without your details.',
                textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF7F1D1D), fontSize: 13, height: 1.4)),
          ]),
        ),
        const SizedBox(height: 16),
        const Panel(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Before you go', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          SizedBox(height: 10),
          _Bullet('Any wallet balance is forfeited — spend it first'),
          _Bullet('Active orders should be completed or cancelled'),
          _Bullet('You can create a new account anytime'),
        ])),
        const SizedBox(height: 16),
        AppField(label: 'Confirm with your password', obscure: true, icon: Icons.lock_outline_rounded, controller: _pw, error: _err),
        const SizedBox(height: 20),
        SizedBox(
            width: double.infinity,
            child: FilledButton(
              key: const ValueKey('delete-account'),
              style: FilledButton.styleFrom(backgroundColor: AppColors.accentDark),
              onPressed: _busy ? null : _delete,
              child: Text(_busy ? '…' : 'Permanently delete account'),
            )),
        const SizedBox(height: 10),
        SizedBox(width: double.infinity, child: OutlinedButton(onPressed: () => Navigator.maybePop(context), child: const Text('Keep my account'))),
      ]),
    );
  }
}

// Support ticket conversation (loaded from the server; replies are sent live).
class SupportTicketDetailScreen extends StatefulWidget {
  final TicketView ticket;
  const SupportTicketDetailScreen({super.key, required this.ticket});
  @override
  State<SupportTicketDetailScreen> createState() => _SupportTicketDetailScreenState();
}

class _SupportTicketDetailScreenState extends State<SupportTicketDetailScreen> {
  final _ctrl = TextEditingController();
  late TicketView _t = widget.ticket;
  bool _sending = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _sending = true);
    try {
      final res = await RealtimeStore.instance.call('support:reply', {'id': _t.id, 'text': text});
      _t = TicketView.fromJson((res as Map).map((k, v) => MapEntry(k.toString(), v)));
      _ctrl.clear();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, _t.reference),
      body: Column(children: [
        Container(
          width: double.infinity,
          color: AppColors.surface,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
          child: Row(children: [
            Expanded(child: Text(_t.subject, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
            Pill(_t.label, color: _t.color.withValues(alpha: 0.14), textColor: _t.color, fontSize: 10.5),
          ]),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            itemCount: _t.messages.length,
            itemBuilder: (_, i) {
              final m = _t.messages[i];
              final mine = !m.role.startsWith('admin');
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.72),
                  decoration: BoxDecoration(
                    color: mine ? AppColors.primary : AppColors.surface,
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(mine ? 16 : 4),
                      bottomRight: Radius.circular(mine ? 4 : 16),
                    ),
                    boxShadow: mine ? null : AppShadow.card,
                  ),
                  child: Text(m.text, style: TextStyle(color: mine ? Colors.white : AppColors.ink, fontSize: 13.5, height: 1.35)),
                ),
              );
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(
                    hintText: 'Reply…',
                    filled: true,
                    fillColor: AppColors.surface,
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.line)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Material(
                color: AppColors.primary,
                shape: const CircleBorder(),
                child: InkWell(
                  customBorder: const CircleBorder(),
                  onTap: _sending ? null : _send,
                  child: const Padding(padding: EdgeInsets.all(13), child: Icon(Icons.send_rounded, color: Colors.white, size: 22)),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _Bullet extends StatelessWidget {
  final String text;
  const _Bullet(this.text);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.remove_rounded, size: 16, color: AppColors.muted),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13, color: AppColors.inkSoft))),
        ]),
      );
}
