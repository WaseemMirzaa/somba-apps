import 'package:flutter/material.dart';
import '../../data/rider_state.dart';
import '../../data/mock_tasks.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';
import '../../widgets/rider_brand.dart';
import '../../l10n/strings.dart';
import 'rider_auth.dart';

// ---------------- Settings ----------------
class RiderSettingsScreen extends StatefulWidget {
  const RiderSettingsScreen({super.key});
  @override
  State<RiderSettingsScreen> createState() => _RiderSettingsScreenState();
}

class _RiderSettingsScreenState extends State<RiderSettingsScreen> {
  bool _push = true, _sound = true, _autoAccept = false, _navVoice = true;
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'Settings')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        _group(tr(context, 'Notifications'), [
          _toggle(Icons.notifications_active_rounded, tr(context, 'Push notifications'), tr(context, 'New tasks & route alerts'), _push, (v) => setState(() => _push = v)),
          _toggle(Icons.volume_up_rounded, tr(context, 'Sound alerts'), tr(context, 'Play a sound on new task'), _sound, (v) => setState(() => _sound = v)),
        ]),
        const SizedBox(height: 14),
        _group(tr(context, 'Delivery'), [
          _toggle(Icons.flash_on_rounded, tr(context, 'Auto-accept tasks'), tr(context, 'Automatically accept nearby tasks'), _autoAccept, (v) => setState(() => _autoAccept = v)),
          _toggle(Icons.record_voice_over_rounded, tr(context, 'Voice navigation'), tr(context, 'Spoken turn-by-turn guidance'), _navVoice, (v) => setState(() => _navVoice = v)),
        ]),
        const SizedBox(height: 14),
        _group(tr(context, 'Account'), [
          _nav(Icons.lock_reset_rounded, tr(context, 'Change password'), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ForgotPasswordScreen()))),
          _nav(Icons.info_outline_rounded, tr(context, 'About Somba&Teka'), () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderAboutScreen()))),
        ]),
      ]),
    );
  }

  Widget _group(String title, List<Widget> rows) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 8), child: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5))),
        SurfaceCard(padding: EdgeInsets.zero, child: Column(children: rows)),
      ]);

  Widget _toggle(IconData icon, String title, String sub, bool v, ValueChanged<bool> onCh) => SwitchListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
        activeThumbColor: AppColors.primary,
        value: v,
        onChanged: onCh,
        secondary: _icon(icon),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        subtitle: Text(sub, style: const TextStyle(fontSize: 12.5)),
      );

  Widget _nav(IconData icon, String title, VoidCallback onTap) => ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
        leading: _icon(icon),
        title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        trailing: const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
        onTap: onTap,
      );

  Widget _icon(IconData icon) => Container(
        height: 40, width: 40,
        decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
        child: Icon(icon, color: AppColors.primary, size: 21),
      );
}

// ---------------- Support ----------------
class RiderSupportScreen extends StatelessWidget {
  const RiderSupportScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final faqs = [
      (tr(context, 'A customer is not answering'), tr(context, 'Wait 5 minutes, call twice, then report the task as failed with the right reason.')),
      (tr(context, 'The app shows a wrong address'), tr(context, 'Open the task, tap the address to re-locate, or call the customer to confirm.')),
      (tr(context, 'I can\'t start my shift'), tr(context, 'Make sure you are On duty in your profile and inside your assigned zone.')),
      (tr(context, 'How do I report a damaged item?'), tr(context, 'Use “Failed / report a problem” on the task and select “Damaged package”.')),
    ];
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'Support')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(22)),
          child: Row(children: [
            Container(height: 46, width: 46, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(14)), child: const Icon(Icons.headset_mic_rounded, color: Colors.white)),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(tr(context, '24/7 rider help'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
              const SizedBox(height: 2),
              Text(tr(context, 'Fleet support answers in ~2 min'), style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
            ])),
          ]),
        ),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: _action(context, Icons.call_rounded, 'Call fleet', 'Hotline')),
          const SizedBox(width: 12),
          Expanded(child: _action(context, Icons.chat_bubble_rounded, 'Live chat', 'Message us')),
        ]),
        const SizedBox(height: 14),
        PrimaryButton(tr(context, 'Raise a support ticket'),
            icon: Icons.confirmation_number_rounded,
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderNewTicketScreen()))),
        const SizedBox(height: 20),
        Text(tr(context, 'Common questions'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ...faqs.map((f) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SurfaceCard(
                padding: EdgeInsets.zero,
                child: ExpansionTile(
                  shape: const Border(),
                  collapsedShape: const Border(),
                  tilePadding: const EdgeInsets.symmetric(horizontal: 16),
                  childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                  title: Text(tr(context, f.$1), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  iconColor: AppColors.primary,
                  collapsedIconColor: AppColors.faint,
                  children: [Align(alignment: Alignment.centerLeft, child: Text(tr(context, f.$2), style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.4)))],
                ),
              ),
            )),
      ]),
    );
  }

  Widget _action(BuildContext context, IconData icon, String title, String sub) => SurfaceCard(
        onTap: () {
          if (title == 'Live chat') {
            Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(name: tr(context, 'Fleet support'))));
          } else {
            ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Calling fleet hotline…'))));
          }
        },
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(height: 42, width: 42, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: AppColors.primary)),
          const SizedBox(height: 10),
          Text(tr(context, title), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          Text(tr(context, sub), style: const TextStyle(color: AppColors.muted, fontSize: 12)),
        ]),
      );
}

// ---------------- New support ticket (against a task/order) ----------------
class RiderNewTicketScreen extends StatefulWidget {
  const RiderNewTicketScreen({super.key});
  @override
  State<RiderNewTicketScreen> createState() => _RiderNewTicketScreenState();
}

class _RiderNewTicketScreenState extends State<RiderNewTicketScreen> {
  final _subject = TextEditingController();
  final _body = TextEditingController();
  int _task = 0;
  int _topic = 0;

  late final List<String> _tasks = [...mockTasks.map((t) => '${t.id} · ${t.customer}'), 'Not task-related'];
  static const _topics = ['Address / navigation', 'Customer issue', 'Damaged / missing item', 'Payment / COD', 'App problem', 'Other'];

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
        Text(tr(context, 'Which task or order?'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: List.generate(_tasks.length, (i) {
          final sel = _task == i;
          return GestureDetector(onTap: () => setState(() => _task = i), child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
            decoration: BoxDecoration(color: sel ? AppColors.primary : AppColors.surface, borderRadius: BorderRadius.circular(100), border: Border.all(color: sel ? AppColors.primary : AppColors.line)),
            child: Text(tr(context, _tasks[i]), style: TextStyle(color: sel ? Colors.white : AppColors.inkSoft, fontWeight: FontWeight.w700, fontSize: 12.5)),
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
        TextField(controller: _subject, decoration: InputDecoration(hintText: tr(context, 'Brief summary'))),
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
        const SizedBox(height: 18),
        PrimaryButton(tr(context, 'Open ticket'), icon: Icons.send_rounded, onPressed: () {
          final subject = _subject.text.trim().isEmpty ? _topics[_topic] : _subject.text.trim();
          final ref = _task < mockTasks.length ? mockTasks[_task].id : tr(context, 'General');
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => ChatScreen(
            name: '${tr(context, 'Ticket')} · $subject',
            subtitle: '${tr(context, 'Ref:')} $ref · ${tr(context, _topics[_topic])}',
            seed: [
              if (_body.text.trim().isNotEmpty) (_body.text.trim(), true, false),
              (tr(context, 'Thanks — fleet support has your ticket and will reply shortly. Feel free to attach a photo.'), false, false),
            ],
          )));
        }),
      ]),
    );
  }
}

// ---------------- Chat (customer / support / ticket) ----------------
class ChatScreen extends StatefulWidget {
  final String name;
  final String? subtitle;
  final List<(String, bool, bool)>? seed;
  const ChatScreen({super.key, required this.name, this.subtitle, this.seed});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _ctrl = TextEditingController();
  final _scroll = ScrollController();
  // (text, mine, isImage)
  late final List<(String, bool, bool)> _msgs = widget.seed ??
      [
        ('Hi! I\'m on my way with your order.', true, false),
        ('Great, thank you! I\'m at the main gate.', false, false),
        ('Perfect, I\'ll be there in about 5 minutes.', true, false),
      ];

  @override
  void dispose() {
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _end() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) _scroll.animateTo(_scroll.position.maxScrollExtent, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      });

  void _send() {
    final t = _ctrl.text.trim();
    if (t.isEmpty) return;
    setState(() {
      _msgs.add((t, true, false));
      _ctrl.clear();
    });
    _end();
  }

  void _attach() {
    setState(() => _msgs.add(('photo', true, true)));
    _end();
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Photo attached'))));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, widget.name),
      body: Column(children: [
        if (widget.subtitle != null)
          Container(
            width: double.infinity,
            color: AppColors.surface,
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
            child: Row(children: [
              const Icon(Icons.receipt_long_rounded, size: 15, color: AppColors.muted),
              const SizedBox(width: 6),
              Expanded(child: Text(widget.subtitle!, style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600))),
            ]),
          ),
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            itemCount: _msgs.length,
            itemBuilder: (_, i) {
              final m = _msgs[i];
              final mine = m.$2;
              final isImage = m.$3;
              return Align(
                alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 10),
                  padding: isImage ? const EdgeInsets.all(6) : const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
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
                  child: isImage
                      ? Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Container(height: 128, width: 168, decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.image_rounded, color: Colors.white, size: 40)),
                          Padding(padding: const EdgeInsets.only(top: 4, left: 2), child: Text(tr(context, 'Attachment'), style: const TextStyle(color: Colors.white70, fontSize: 11))),
                        ])
                      : Text(tr(context, m.$1), style: TextStyle(color: mine ? Colors.white : AppColors.ink, fontSize: 13.5, height: 1.35)),
                ),
              );
            },
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(6, 8, 12, 10),
            child: Row(children: [
              IconButton(onPressed: _attach, icon: const Icon(Icons.photo_camera_rounded, color: AppColors.primary), tooltip: tr(context, 'Camera')),
              IconButton(onPressed: _attach, icon: const Icon(Icons.photo_library_rounded, color: AppColors.primary), tooltip: tr(context, 'Gallery'), padding: EdgeInsets.zero, constraints: const BoxConstraints(minWidth: 36)),
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  onSubmitted: (_) => _send(),
                  decoration: InputDecoration(
                    hintText: tr(context, 'Message…'),
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

// ---------------- Documents (with upload flow) ----------------
class RiderDocumentsScreen extends StatefulWidget {
  const RiderDocumentsScreen({super.key});
  @override
  State<RiderDocumentsScreen> createState() => _RiderDocumentsScreenState();
}

class _RiderDocumentsScreenState extends State<RiderDocumentsScreen> {
  // (title, status, valid?, icon)
  final List<(String, String, bool, IconData)> _docs = [
    ('Driver licence', 'Valid until Mar 2028', true, Icons.badge_rounded),
    ('National ID', 'Verified', true, Icons.credit_card_rounded),
    ('Vehicle insurance', 'Valid until Sep 2026', true, Icons.verified_user_rounded),
    ('Roadworthiness', 'Renewal due in 21 days', false, Icons.build_circle_rounded),
  ];

  static const _types = [
    ('Driver licence', Icons.badge_rounded),
    ('National ID', Icons.credit_card_rounded),
    ('Vehicle insurance', Icons.verified_user_rounded),
    ('Roadworthiness', Icons.build_circle_rounded),
    ('Other document', Icons.description_rounded),
  ];

  void _openUpload() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetCtx) => _UploadSheet(types: _types, onUploaded: (type) {
        setState(() {
          final idx = _docs.indexWhere((d) => d.$1 == type);
          final entry = (type, 'Uploaded — pending review', true, _types.firstWhere((t) => t.$1 == type, orElse: () => _types.last).$2);
          if (idx >= 0) {
            _docs[idx] = entry;
          } else {
            _docs.add(entry);
          }
        });
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$type ${tr(context, 'uploaded — pending review')}')));
      }),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'Documents')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        ..._docs.map((d) {
          final ok = d.$3;
          final pending = d.$2.contains('pending');
          final color = pending ? AppColors.info : (ok ? AppColors.primary : AppColors.accent);
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: SurfaceCard(
              padding: const EdgeInsets.all(14),
              child: Row(children: [
                Container(height: 44, width: 44, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)), child: Icon(d.$4, color: AppColors.primary)),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(tr(context, d.$1), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                  Text(tr(context, d.$2), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ])),
                Pill(pending ? tr(context, 'Pending') : (ok ? tr(context, 'Valid') : tr(context, 'Renew')),
                    color: color.withValues(alpha: 0.14),
                    textColor: color,
                    icon: pending ? Icons.hourglass_top_rounded : (ok ? Icons.check_circle_rounded : Icons.warning_amber_rounded),
                    fontSize: 10.5),
              ]),
            ),
          );
        }),
        const SizedBox(height: 4),
        PrimaryButton(tr(context, 'Upload a document'), icon: Icons.upload_file_rounded, onPressed: _openUpload),
      ]),
    );
  }
}

/// Bottom sheet: pick a document type + capture/choose file, then upload (mock).
class _UploadSheet extends StatefulWidget {
  final List<(String, IconData)> types;
  final ValueChanged<String> onUploaded;
  const _UploadSheet({required this.types, required this.onUploaded});
  @override
  State<_UploadSheet> createState() => _UploadSheetState();
}

class _UploadSheetState extends State<_UploadSheet> {
  int _type = 0;
  bool _fileChosen = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: AppColors.background, borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + MediaQuery.of(context).padding.bottom),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        Center(child: Container(width: 44, height: 5, decoration: BoxDecoration(color: AppColors.line, borderRadius: BorderRadius.circular(100)))),
        const SizedBox(height: 16),
        Text(tr(context, 'Upload a document'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18, fontFamily: 'PlusJakartaSans')),
        const SizedBox(height: 4),
        Text(tr(context, 'Choose the document type'), style: const TextStyle(color: AppColors.muted, fontSize: 13)),
        const SizedBox(height: 14),
        ...List.generate(widget.types.length, (i) {
          final sel = _type == i;
          return Padding(padding: const EdgeInsets.only(bottom: 8), child: GestureDetector(
            onTap: () => setState(() => _type = i),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(14), border: Border.all(color: sel ? AppColors.primary : AppColors.line, width: sel ? 1.8 : 1.2)),
              child: Row(children: [
                Icon(widget.types[i].$2, color: sel ? AppColors.primary : AppColors.muted, size: 20),
                const SizedBox(width: 12),
                Expanded(child: Text(tr(context, widget.types[i].$1), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5))),
                Icon(sel ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: sel ? AppColors.primary : AppColors.faint, size: 20),
              ]),
            ),
          ));
        }),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: () => setState(() => _fileChosen = true),
          child: Container(
            height: 96,
            decoration: BoxDecoration(
              gradient: _fileChosen ? AppColors.brandGradient : null,
              color: _fileChosen ? null : AppColors.surface,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _fileChosen ? Colors.transparent : AppColors.line),
            ),
            child: Center(child: _fileChosen
                ? Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.check_circle_rounded, color: Colors.white),
                    const SizedBox(width: 8),
                    Text(tr(context, 'File selected'), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                  ])
                : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                    const Icon(Icons.add_photo_alternate_rounded, color: AppColors.primary, size: 28),
                    const SizedBox(height: 6),
                    Text(tr(context, 'Tap to take a photo or choose a file'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5, fontWeight: FontWeight.w600)),
                  ])),
          ),
        ),
        const SizedBox(height: 16),
        PrimaryButton(tr(context, 'Upload'), icon: Icons.upload_rounded, onPressed: _fileChosen
            ? () {
                Navigator.pop(context);
                widget.onUploaded(widget.types[_type].$1);
              }
            : null),
      ]),
    );
  }
}

// ---------------- Vehicle ----------------
class RiderVehicleScreen extends StatelessWidget {
  const RiderVehicleScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'My vehicle')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(22)),
          child: Row(children: [
            Container(height: 54, width: 54, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.two_wheeler_rounded, color: Colors.white, size: 30)),
            const SizedBox(width: 14),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Yamaha NMAX', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17)),
              const SizedBox(height: 2),
              Text(tr(context, 'Scooter · 125cc'), style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
            ])),
            const Pill('KN 4821 A', color: Colors.white24, textColor: Colors.white, fontSize: 11),
          ]),
        ),
        const SizedBox(height: 16),
        SurfaceCard(child: Column(children: [
          _row(Icons.confirmation_number_rounded, tr(context, 'Plate number'), 'KN 4821 A'),
          const Divider(height: 20),
          _row(Icons.palette_rounded, tr(context, 'Colour'), tr(context, 'Matte black')),
          const Divider(height: 20),
          _row(Icons.speed_rounded, tr(context, 'Odometer'), '18,240 km'),
          const Divider(height: 20),
          _row(Icons.local_gas_station_rounded, tr(context, 'Fuel type'), tr(context, 'Petrol')),
        ])),
        const SizedBox(height: 16),
        Text(tr(context, 'Maintenance'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        SurfaceCard(child: Column(children: [
          _row(Icons.build_rounded, tr(context, 'Last service'), '12 May 2026'),
          const Divider(height: 20),
          _row(Icons.event_rounded, tr(context, 'Next service'), tr(context, 'Due in 640 km')),
        ])),
        const SizedBox(height: 16),
        PrimaryButton(tr(context, 'Report an issue'),
            icon: Icons.report_problem_rounded,
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Issue reported to the fleet team'))))),
      ]),
    );
  }

  Widget _row(IconData icon, String label, String value) => Row(children: [
        Icon(icon, color: AppColors.primary, size: 20),
        const SizedBox(width: 12),
        Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5, color: AppColors.inkSoft))),
        Text(value, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13.5)),
      ]);
}

// ---------------- Shift & attendance (functional, wired to duty state) ----------------
class RiderShiftScreen extends StatefulWidget {
  const RiderShiftScreen({super.key});
  @override
  State<RiderShiftScreen> createState() => _RiderShiftScreenState();
}

class _RiderShiftScreenState extends State<RiderShiftScreen> {
  final _rider = RiderState.instance;

  static const _week = [
    ('Mon', '08:02', '17:34', true),
    ('Tue', '07:58', '17:40', true),
    ('Wed', '08:10', '18:02', true),
    ('Thu', '08:00', '17:20', true),
    ('Fri', '—', '—', false),
  ];

  void _snack(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'Shift & attendance')),
      body: AnimatedBuilder(
        animation: Listenable.merge([_rider.shiftActive, _rider.onBreak]),
        builder: (context, _) {
          final active = _rider.shiftActive.value;
          final onBreak = _rider.onBreak.value;
          final status = !active ? tr(context, 'Off shift') : (onBreak ? tr(context, 'On break') : tr(context, 'Active'));
          final statusColor = !active ? AppColors.faint : (onBreak ? AppColors.accent : AppColors.primary);
          return ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(22)),
              child: Row(children: [
                _hstat('4', tr(context, 'Days')),
                _hdiv(),
                _hstat('34h', tr(context, 'This week')),
                _hdiv(),
                _hstat('98%', tr(context, 'On-time')),
              ]),
            ),
            const SizedBox(height: 16),
            SurfaceCard(child: Row(children: [
              Container(height: 44, width: 44, decoration: BoxDecoration(color: statusColor.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: Icon(active ? Icons.timer_rounded : Icons.timer_off_rounded, color: statusColor)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(tr(context, 'Current shift'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
                Text(active ? '${tr(context, 'Started today at')} ${_rider.shiftStartedAt}' : tr(context, 'Not clocked in'), style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
              ])),
              Pill(status, color: statusColor.withValues(alpha: 0.14), textColor: statusColor),
            ])),
            const SizedBox(height: 12),
            // Start / break / end controls — connected to the On-duty toggle.
            if (!active)
              PrimaryButton(tr(context, 'Start shift'), icon: Icons.play_arrow_rounded, onPressed: () {
                setState(() => _rider.startShift());
                _snack(tr(context, 'Shift started — you are now On duty'));
              })
            else
              Row(children: [
                Expanded(child: OutlinedButton.icon(
                  onPressed: () {
                    setState(() => _rider.toggleBreak());
                    _snack(_rider.onBreak.value ? tr(context, 'On break — new tasks paused') : tr(context, 'Back from break — On duty'));
                  },
                  icon: Icon(onBreak ? Icons.play_circle_outline_rounded : Icons.pause_circle_outline_rounded, size: 20),
                  label: Text(onBreak ? tr(context, 'Resume') : tr(context, 'Take a break')),
                )),
                const SizedBox(width: 12),
                Expanded(child: FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: AppColors.danger),
                  onPressed: () {
                    setState(() => _rider.endShift());
                    _snack(tr(context, 'Shift ended — have a good rest!'));
                  },
                  icon: const Icon(Icons.logout_rounded, size: 20),
                  label: Text(tr(context, 'End shift')),
                )),
              ]),
            const SizedBox(height: 20),
            Text(tr(context, 'This week'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            const SizedBox(height: 10),
            ..._week.map((d) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: SurfaceCard(
                    padding: const EdgeInsets.all(14),
                    child: Row(children: [
                      SizedBox(width: 40, child: Text(tr(context, d.$1), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
                      const SizedBox(width: 8),
                      Expanded(child: Text(d.$4 ? '${tr(context, 'In')} ${d.$2}  ·  ${tr(context, 'Out')} ${d.$3}' : tr(context, 'No shift'), style: TextStyle(color: d.$4 ? AppColors.inkSoft : AppColors.faint, fontSize: 13, fontWeight: FontWeight.w600))),
                      Icon(d.$4 ? Icons.check_circle_rounded : Icons.remove_circle_outline_rounded, color: d.$4 ? AppColors.primary : AppColors.faint, size: 20),
                    ]),
                  ),
                )),
          ]);
        },
      ),
    );
  }

  Widget _hstat(String v, String l) => Expanded(child: Column(children: [
        Text(v, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800)),
        Text(l, style: TextStyle(color: Colors.white.withValues(alpha: 0.85), fontSize: 11.5)),
      ]));
  Widget _hdiv() => Container(width: 1, height: 28, color: Colors.white.withValues(alpha: 0.25));
}

// ---------------- Edit profile ----------------
class RiderEditProfileScreen extends StatelessWidget {
  const RiderEditProfileScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'Edit profile')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [
        Center(
          child: Stack(children: [
            Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: AppColors.primary.withValues(alpha: 0.4), width: 2)),
              child: const CircleAvatar(radius: 44, backgroundColor: AppColors.primary, child: Text('JM', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 28))),
            ),
            Positioned(
              right: 0, bottom: 0,
              child: Container(
                height: 32, width: 32,
                decoration: BoxDecoration(color: AppColors.primary, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
                child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 16),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 24),
        RiderField(label: tr(context, 'Full name'), hint: 'Jean Mukendi', icon: Icons.person_outline_rounded),
        const SizedBox(height: 16),
        RiderField(label: tr(context, 'Phone'), hint: '+243 810 000 082', icon: Icons.phone_outlined),
        const SizedBox(height: 16),
        RiderField(label: tr(context, 'Email'), hint: 'jean.m@somba.cd', icon: Icons.email_outlined),
        const SizedBox(height: 16),
        RiderField(label: tr(context, 'Emergency contact'), hint: '+243 810 000 111', icon: Icons.contact_emergency_outlined),
        const SizedBox(height: 24),
        PrimaryButton(tr(context, 'Save changes'),
            icon: Icons.check_rounded,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(tr(context, 'Profile updated'))));
              Navigator.pop(context);
            }),
      ]),
    );
  }
}

// ---------------- About ----------------
class RiderAboutScreen extends StatelessWidget {
  const RiderAboutScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, tr(context, 'About')),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 20, 20, 24), children: [
        Center(child: Column(children: [
          const RiderBrandLogo(size: 84, radius: 24),
          const SizedBox(height: 16),
          Text(tr(context, 'Somba&Teka Rider'), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 20, fontFamily: 'PlusJakartaSans')),
          const SizedBox(height: 4),
          Text('${tr(context, 'Version')} 1.0.0', style: const TextStyle(color: AppColors.muted, fontSize: 13)),
        ])),
        const SizedBox(height: 24),
        SurfaceCard(child: Column(children: [
          _link(context, Icons.description_outlined, 'Terms of service'),
          const Divider(height: 20),
          _link(context, Icons.privacy_tip_outlined, 'Privacy policy'),
          const Divider(height: 20),
          _link(context, Icons.star_outline_rounded, 'Rate the app'),
        ])),
        const SizedBox(height: 20),
        Center(child: Text(tr(context, '© 2026 Somba&Teka. All rights reserved.'), style: const TextStyle(color: AppColors.faint, fontSize: 12))),
      ]),
    );
  }

  Widget _link(BuildContext context, IconData icon, String label) => Row(children: [
        Icon(icon, color: AppColors.primary, size: 20),
        const SizedBox(width: 12),
        Expanded(child: Text(tr(context, label), style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
        const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
      ]);
}
