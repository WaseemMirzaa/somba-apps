import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../theme/app_theme.dart';
import '../../l10n/strings.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';

class ReferScreen extends StatelessWidget {
  final Locale locale;
  const ReferScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Refer & Earn'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(24), boxShadow: AppShadow.soft),
          child: Column(children: [
            const Icon(Icons.card_giftcard_rounded, color: Colors.white, size: 44),
            const SizedBox(height: 12),
            const Text('Give \$5, get \$5', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, fontFamily: 'PlusJakartaSans')),
            const SizedBox(height: 6),
            Text('Invite friends — you both earn \$5 in store credit on their first order.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 13)),
          ]),
        ),
        const SizedBox(height: 18),
        const Text('Your referral code', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
          decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.primary, width: 1.4)),
          child: Row(children: [
            const Icon(Icons.confirmation_number_rounded, color: AppColors.primary),
            const SizedBox(width: 12),
            const Expanded(child: Text('MARIE-5X9K', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, letterSpacing: 1))),
            TextButton.icon(
              onPressed: () {
                Clipboard.setData(const ClipboardData(text: 'MARIE-5X9K'));
                ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Referral code copied')));
              },
              icon: const Icon(Icons.copy_rounded, size: 16),
              label: const Text('Copy'),
            ),
          ]),
        ),
        const SizedBox(height: 12),
        PrimaryButton('Share invite link',
            icon: Icons.share_rounded,
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Sharing your invite link…')))),
        const SectionHeader('Your rewards', padding: EdgeInsets.fromLTRB(4, 22, 4, 10)),
        Panel(child: Row(children: [
          _stat('7', 'Friends joined'), _div(), _stat('\$35', 'Earned'), _div(), _stat('3', 'Pending'),
        ])),
      ]),
    );
  }

  Widget _stat(String v, String l) => Expanded(child: Column(children: [
        Text(v, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.primary)),
        const SizedBox(height: 2),
        Text(l, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
      ]));
  Widget _div() => Container(width: 1, height: 30, color: AppColors.line);
}

class SupportListScreen extends StatefulWidget {
  final Locale locale;
  const SupportListScreen({super.key, this.locale = const Locale('en')});
  @override
  State<SupportListScreen> createState() => _SupportListScreenState();
}

class _SupportListScreenState extends State<SupportListScreen> {
  // Mutable so a newly-created ticket appears at the top of the list.
  final List<(String, String, String, Color)> _tickets = [
    ('TKT-3391', 'Refund not received', 'Open', AppColors.amber),
    ('TKT-3382', 'Wrong item delivered', 'In progress', AppColors.primary),
    ('TKT-3360', 'Change delivery address', 'Resolved', AppColors.success),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'Support')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        ..._tickets.map((t) => Padding(padding: const EdgeInsets.only(bottom: 12), child: GestureDetector(
          onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => SupportTicketDetailScreen(id: t.$1, subject: t.$2, status: t.$3, statusColor: t.$4))),
          child: Panel(
          child: Row(children: [
            Container(height: 44, width: 44, decoration: BoxDecoration(color: t.$4.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: Icon(Icons.confirmation_number_outlined, color: t.$4)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.$2, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              Text(t.$1, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            ])),
            Pill(tr(context, t.$3), color: t.$4.withValues(alpha: 0.14), textColor: t.$4, fontSize: 10.5),
          ]),
        )))),
        const SizedBox(height: 4),
        PrimaryButton(tr(context, 'New ticket'),
            icon: Icons.add_rounded,
            onPressed: () async {
              final created = await Navigator.push<(String, String)>(context, MaterialPageRoute(builder: (_) => NewTicketScreen(locale: widget.locale)));
              if (created != null) {
                setState(() => _tickets.insert(0, (created.$1, created.$2, 'Open', AppColors.amber)));
              }
            }),
      ]),
    );
  }
}

/// CF-34 — Create a support ticket: choose an order/product, subject + issue.
class NewTicketScreen extends StatefulWidget {
  final Locale locale;
  const NewTicketScreen({super.key, this.locale = const Locale('en')});
  @override
  State<NewTicketScreen> createState() => _NewTicketScreenState();
}

class _NewTicketScreenState extends State<NewTicketScreen> {
  final _subject = TextEditingController();
  final _body = TextEditingController();
  int _order = 0;
  int _topic = 0;

  static const _orders = ['SMB-2026-4821', 'SMB-2026-4805', 'SMB-2026-4712', 'Not order-related'];
  static const _topics = ['Refund / payment', 'Delivery issue', 'Wrong / damaged item', 'Account help', 'Other'];

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'New ticket')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 10, 16, 24), children: [
        Text(tr(context, 'Related order'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: List.generate(_orders.length, (i) {
          final sel = _order == i;
          return GestureDetector(onTap: () => setState(() => _order = i), child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(color: sel ? AppColors.primary : AppColors.surface, borderRadius: BorderRadius.circular(100), border: Border.all(color: sel ? AppColors.primary : AppColors.line)),
            child: Text(tr(context, _orders[i]), style: TextStyle(color: sel ? Colors.white : AppColors.inkSoft, fontWeight: FontWeight.w700, fontSize: 12.5)),
          ));
        })),
        const SizedBox(height: 20),
        Text(tr(context, 'Topic'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: List.generate(_topics.length, (i) {
          final sel = _topic == i;
          return GestureDetector(onTap: () => setState(() => _topic = i), child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(color: sel ? AppColors.primary.withValues(alpha: 0.12) : AppColors.surface, borderRadius: BorderRadius.circular(100), border: Border.all(color: sel ? AppColors.primary : AppColors.line)),
            child: Text(tr(context, _topics[i]), style: TextStyle(color: sel ? AppColors.primary : AppColors.inkSoft, fontWeight: FontWeight.w700, fontSize: 12.5)),
          ));
        })),
        const SizedBox(height: 20),
        Text(tr(context, 'Subject'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
        const SizedBox(height: 8),
        TextField(controller: _subject, decoration: InputDecoration(hintText: tr(context, 'Brief summary of the issue'))),
        const SizedBox(height: 18),
        Text(tr(context, 'Describe the issue'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
        const SizedBox(height: 8),
        TextField(
          controller: _body,
          maxLines: 5,
          decoration: InputDecoration(
            hintText: tr(context, 'Tell us what happened…'),
            filled: true, fillColor: AppColors.surface,
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.primary, width: 1.4)),
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: AppColors.line)),
          ),
        ),
      ]),
      bottomNavigationBar: Padding(
        padding: EdgeInsets.fromLTRB(16, 8, 16, 12 + MediaQuery.of(context).padding.bottom),
        child: PrimaryButton(tr(context, 'Open ticket'), icon: Icons.send_rounded, onPressed: () {
          final subject = _subject.text.trim().isEmpty ? _topics[_topic] : _subject.text.trim();
          final id = 'TKT-${3400 + _subject.text.length + _topic}';
          final orderRef = _order < 3 ? _orders[_order] : null;
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => SupportTicketDetailScreen(
            id: id, subject: subject, status: 'Open', statusColor: AppColors.amber,
            orderRef: orderRef, firstMessage: _body.text.trim().isEmpty ? null : _body.text.trim(),
          )));
        }),
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
      'How do I track my order?',
      'What are the delivery fees?',
      'How do returns and refunds work?',
      'Which payment methods are accepted?',
      'How do I contact a seller?',
    ];
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'Help & support')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Row(children: [
          Expanded(child: _contact(Icons.chat_bubble_rounded, tr(context, 'Live chat'), AppColors.primary)),
          const SizedBox(width: 12),
          Expanded(child: _contact(Icons.call_rounded, tr(context, 'Call us'), AppColors.success)),
          const SizedBox(width: 12),
          Expanded(child: _contact(Icons.mail_rounded, tr(context, 'Email'), AppColors.royalBlue)),
        ]),
        SectionHeader(tr(context, 'FAQs'), padding: const EdgeInsets.fromLTRB(4, 22, 4, 10)),
        Panel(padding: EdgeInsets.zero, child: Column(children: [
          for (int i = 0; i < faqs.length; i++) ...[
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              title: Text(tr(context, faqs[i]), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
              trailing: const Icon(Icons.expand_more_rounded, color: AppColors.faint),
            ),
            if (i != faqs.length - 1) const Divider(height: 1),
          ],
        ])),
        const SizedBox(height: 16),
        TextButton.icon(
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountDeleteScreen())),
          style: TextButton.styleFrom(foregroundColor: AppColors.accentDark),
          icon: const Icon(Icons.delete_outline_rounded, size: 18),
          label: Text(tr(context, 'Delete my account')),
        ),
      ]),
    );
  }

  Widget _contact(IconData icon, String label, Color c) => Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(18), boxShadow: AppShadow.card),
        child: Column(children: [
          Container(height: 44, width: 44, decoration: BoxDecoration(color: c.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)), child: Icon(icon, color: c)),
          const SizedBox(height: 8),
          Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5)),
        ]),
      );
}

class AccountDeleteScreen extends StatelessWidget {
  const AccountDeleteScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Delete account'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(color: AppColors.accent.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(20)),
          child: Column(children: const [
            Icon(Icons.warning_amber_rounded, color: AppColors.accentDark, size: 40),
            SizedBox(height: 10),
            Text('This action is permanent', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16, color: AppColors.accentDark)),
            SizedBox(height: 6),
            Text('Deleting your account removes your orders, coupons, wishlist and addresses. This cannot be undone.', textAlign: TextAlign.center, style: TextStyle(color: Color(0xFF7F1D1D), fontSize: 13, height: 1.4)),
          ]),
        ),
        const SizedBox(height: 16),
        Panel(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: const [
          Text("Before you go", style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
          SizedBox(height: 10),
          _Bullet('Any unused coupons will be forfeited'),
          _Bullet('Active orders must be completed or cancelled'),
          _Bullet('You can create a new account anytime'),
        ])),
        const SizedBox(height: 20),
        SizedBox(width: double.infinity, child: FilledButton(
          style: FilledButton.styleFrom(backgroundColor: AppColors.accentDark),
          onPressed: () {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Account deletion requested')));
            Navigator.maybePop(context);
          },
          child: const Text('Permanently delete account'),
        )),
        const SizedBox(height: 10),
        SizedBox(width: double.infinity, child: OutlinedButton(onPressed: () => Navigator.maybePop(context), child: const Text('Keep my account'))),
      ]),
    );
  }
}

// CF-35 — Support ticket detail (conversation thread + reply, image
// attachments, and the ability to close the ticket).
class _TicketMsg {
  final String text;
  final bool mine;
  final bool isImage;
  _TicketMsg(this.text, this.mine, {this.isImage = false});
}

class SupportTicketDetailScreen extends StatefulWidget {
  final String id;
  final String subject;
  final String status;
  final Color statusColor;
  final String? orderRef;
  final String? firstMessage;
  const SupportTicketDetailScreen({
    super.key,
    required this.id,
    required this.subject,
    required this.status,
    required this.statusColor,
    this.orderRef,
    this.firstMessage,
  });
  @override
  State<SupportTicketDetailScreen> createState() => _SupportTicketDetailScreenState();
}

class _SupportTicketDetailScreenState extends State<SupportTicketDetailScreen> {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  final List<_TicketMsg> _msgs = [];
  late String _status;
  late Color _statusColor;
  int _photoSeq = 0;

  bool get _closed => _status == 'Resolved' || _status == 'Closed';

  @override
  void initState() {
    super.initState();
    _status = widget.status;
    _statusColor = widget.statusColor;
    if (widget.firstMessage != null) {
      _msgs.add(_TicketMsg(widget.firstMessage!, true));
      _msgs.add(_TicketMsg('Thanks for reaching out! Our team is reviewing your ticket and will reply shortly.', false));
    } else {
      _msgs.addAll([
        _TicketMsg('Hi, I need help with this order.', true),
        _TicketMsg('Thanks for reaching out! Could you share the order number so we can look into it?', false),
        _TicketMsg('It is order ${widget.orderRef ?? 'SMB-2026-4821'}.', true),
        _TicketMsg('Got it — our team is reviewing it now and will update you shortly.', false),
      ]);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToEnd() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });

  void _send() {
    final t = _ctrl.text.trim();
    if (t.isEmpty) return;
    setState(() {
      _msgs.add(_TicketMsg(t, true));
      _ctrl.clear();
    });
    _scrollToEnd();
  }

  void _attachImage() {
    setState(() {
      _photoSeq++;
      _msgs.add(_TicketMsg('Photo $_photoSeq', true, isImage: true));
    });
    _scrollToEnd();
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Photo attached')));
  }

  void _closeTicket() {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Container(height: 52, width: 52, decoration: BoxDecoration(color: AppColors.success.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 28)),
          const SizedBox(height: 14),
          Text(tr(context, 'Close this ticket?'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'PlusJakartaSans')),
          const SizedBox(height: 6),
          Text(tr(context, 'Mark this issue as resolved. You can always open a new ticket if you need more help.'), style: const TextStyle(color: AppColors.muted, fontSize: 13.5)),
          const SizedBox(height: 18),
          FilledButton(onPressed: () {
            Navigator.pop(context);
            setState(() {
              _status = 'Resolved';
              _statusColor = AppColors.success;
              _msgs.add(_TicketMsg('You marked this ticket as resolved. Thanks!', false));
            });
            _scrollToEnd();
          }, child: Text(tr(context, 'Close ticket'))),
          const SizedBox(height: 10),
          OutlinedButton(onPressed: () => Navigator.pop(context), child: Text(tr(context, 'Keep open'))),
        ]),
      )),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, widget.id, actions: [
        if (!_closed) TextButton(onPressed: _closeTicket, child: Text(tr(context, 'Close'))),
      ]),
      body: Column(children: [
        Container(
          width: double.infinity,
          color: AppColors.surface,
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(child: Text(widget.subject, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15))),
              Pill(tr(context, _status), color: _statusColor.withValues(alpha: 0.14), textColor: _statusColor, fontSize: 10.5),
            ]),
            if (widget.orderRef != null) ...[
              const SizedBox(height: 6),
              Row(children: [
                const Icon(Icons.receipt_long_rounded, size: 14, color: AppColors.muted),
                const SizedBox(width: 6),
                Text('${tr(context, 'Order')} ${widget.orderRef}', style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600)),
              ]),
            ],
          ]),
        ),
        const Divider(height: 1),
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
            itemCount: _msgs.length,
            itemBuilder: (_, i) {
              final m = _msgs[i];
              final mine = m.mine;
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: m.isImage ? const EdgeInsets.all(6) : const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
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
                  child: m.isImage
                      ? Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
                          Container(
                            height: 130, width: 170,
                            decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(12)),
                            child: const Icon(Icons.image_rounded, color: Colors.white, size: 40),
                          ),
                          Padding(padding: const EdgeInsets.only(top: 4, left: 4), child: Text(tr(context, 'Attachment'), style: const TextStyle(color: Colors.white70, fontSize: 11))),
                        ])
                      : Text(tr(context, m.text), style: TextStyle(color: mine ? Colors.white : AppColors.ink, fontSize: 13.5, height: 1.35)),
                ),
              );
            },
          ),
        ),
        if (_closed)
          SafeArea(top: false, child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            color: AppColors.success.withValues(alpha: 0.08),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.check_circle_rounded, color: AppColors.success, size: 18),
              const SizedBox(width: 8),
              Text(tr(context, 'This ticket is resolved'), style: const TextStyle(color: AppColors.success, fontWeight: FontWeight.w700, fontSize: 13)),
            ]),
          ))
        else
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 12, 10),
              child: Row(children: [
                IconButton(
                  onPressed: _attachImage,
                  icon: const Icon(Icons.add_photo_alternate_rounded, color: AppColors.primary),
                  tooltip: 'Attach photo',
                ),
                Expanded(
                  child: TextField(
                    controller: _ctrl,
                    onSubmitted: (_) => _send(),
                    decoration: InputDecoration(
                      hintText: tr(context, 'Reply…'),
                      filled: true,
                      fillColor: AppColors.surface,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.line)),
                      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(100), borderSide: const BorderSide(color: AppColors.primary, width: 1.4)),
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
                    onTap: _send,
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
