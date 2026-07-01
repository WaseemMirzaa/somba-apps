import 'package:flutter/material.dart';
import '../../theme/app_theme.dart';
import '../../widgets/ui.dart';
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
      appBar: backAppBar(context, 'Settings'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        _group('Notifications', [
          _toggle(Icons.notifications_active_rounded, 'Push notifications', 'New tasks & route alerts', _push, (v) => setState(() => _push = v)),
          _toggle(Icons.volume_up_rounded, 'Sound alerts', 'Play a sound on new task', _sound, (v) => setState(() => _sound = v)),
        ]),
        const SizedBox(height: 14),
        _group('Delivery', [
          _toggle(Icons.flash_on_rounded, 'Auto-accept tasks', 'Automatically accept nearby tasks', _autoAccept, (v) => setState(() => _autoAccept = v)),
          _toggle(Icons.record_voice_over_rounded, 'Voice navigation', 'Spoken turn-by-turn guidance', _navVoice, (v) => setState(() => _navVoice = v)),
        ]),
        const SizedBox(height: 14),
        _group('Account', [
          _nav(Icons.lock_reset_rounded, 'Change password', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ForgotPasswordScreen()))),
          _nav(Icons.info_outline_rounded, 'About Somba&Teka', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const RiderAboutScreen()))),
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
    const faqs = [
      ('A customer is not answering', 'Wait 5 minutes, call twice, then report the task as failed with the right reason.'),
      ('The app shows a wrong address', 'Open the task, tap the address to re-locate, or call the customer to confirm.'),
      ('I can\'t start my shift', 'Make sure you are On duty in your profile and inside your assigned zone.'),
      ('How do I report a damaged item?', 'Use “Failed / report a problem” on the task and select “Damaged package”.'),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Support'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(22)),
          child: Row(children: [
            Container(height: 46, width: 46, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(14)), child: const Icon(Icons.headset_mic_rounded, color: Colors.white)),
            const SizedBox(width: 14),
            const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('24/7 rider help', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 16)),
              SizedBox(height: 2),
              Text('Fleet support answers in ~2 min', style: TextStyle(color: Colors.white70, fontSize: 12.5)),
            ])),
          ]),
        ),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(child: _action(context, Icons.call_rounded, 'Call fleet', 'Hotline')),
          const SizedBox(width: 12),
          Expanded(child: _action(context, Icons.chat_bubble_rounded, 'Live chat', 'Message us')),
        ]),
        const SizedBox(height: 20),
        const Text('Common questions', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
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
                  title: Text(f.$1, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
                  iconColor: AppColors.primary,
                  collapsedIconColor: AppColors.faint,
                  children: [Align(alignment: Alignment.centerLeft, child: Text(f.$2, style: const TextStyle(color: AppColors.muted, fontSize: 13, height: 1.4)))],
                ),
              ),
            )),
      ]),
    );
  }

  Widget _action(BuildContext context, IconData icon, String title, String sub) => SurfaceCard(
        onTap: () {
          if (title == 'Live chat') {
            Navigator.push(context, MaterialPageRoute(builder: (_) => const ChatScreen(name: 'Fleet support')));
          } else {
            ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Calling fleet hotline…')));
          }
        },
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(height: 42, width: 42, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: AppColors.primary)),
          const SizedBox(height: 10),
          Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          Text(sub, style: const TextStyle(color: AppColors.muted, fontSize: 12)),
        ]),
      );
}

// ---------------- Chat (customer / support) ----------------
class ChatScreen extends StatefulWidget {
  final String name;
  const ChatScreen({super.key, required this.name});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _ctrl = TextEditingController();
  final List<(String, bool)> _msgs = [
    ('Hi! I\'m on my way with your order.', true),
    ('Great, thank you! I\'m at the main gate.', false),
    ('Perfect, I\'ll be there in about 5 minutes.', true),
  ];

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _send() {
    final t = _ctrl.text.trim();
    if (t.isEmpty) return;
    setState(() {
      _msgs.add((t, true));
      _ctrl.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, widget.name),
      body: Column(children: [
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            itemCount: _msgs.length,
            itemBuilder: (_, i) {
              final m = _msgs[i];
              final mine = m.$2;
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
                  child: Text(m.$1, style: TextStyle(color: mine ? Colors.white : AppColors.ink, fontSize: 13.5, height: 1.35)),
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
                    hintText: 'Message…',
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

// ---------------- Documents ----------------
class RiderDocumentsScreen extends StatelessWidget {
  const RiderDocumentsScreen({super.key});
  @override
  Widget build(BuildContext context) {
    const docs = [
      ('Driver licence', 'Valid until Mar 2028', true, Icons.badge_rounded),
      ('National ID', 'Verified', true, Icons.credit_card_rounded),
      ('Vehicle insurance', 'Valid until Sep 2026', true, Icons.verified_user_rounded),
      ('Roadworthiness', 'Renewal due in 21 days', false, Icons.build_circle_rounded),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Documents'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        ...docs.map((d) {
          final ok = d.$3;
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: SurfaceCard(
              padding: const EdgeInsets.all(14),
              child: Row(children: [
                Container(height: 44, width: 44, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)), child: Icon(d.$4, color: AppColors.primary)),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(d.$1, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
                  Text(d.$2, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                ])),
                Pill(ok ? 'Valid' : 'Renew',
                    color: (ok ? AppColors.primary : AppColors.accent).withValues(alpha: 0.14),
                    textColor: ok ? AppColors.primary : AppColors.accent,
                    icon: ok ? Icons.check_circle_rounded : Icons.warning_amber_rounded,
                    fontSize: 10.5),
              ]),
            ),
          );
        }),
        const SizedBox(height: 4),
        PrimaryButton('Upload a document',
            icon: Icons.upload_file_rounded,
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Opening document upload…')))),
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
      appBar: backAppBar(context, 'My vehicle'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(22)),
          child: Row(children: [
            Container(height: 54, width: 54, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(16)), child: const Icon(Icons.two_wheeler_rounded, color: Colors.white, size: 30)),
            const SizedBox(width: 14),
            const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('Yamaha NMAX', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17)),
              SizedBox(height: 2),
              Text('Scooter · 125cc', style: TextStyle(color: Colors.white70, fontSize: 12.5)),
            ])),
            const Pill('KN 4821 A', color: Colors.white24, textColor: Colors.white, fontSize: 11),
          ]),
        ),
        const SizedBox(height: 16),
        SurfaceCard(child: Column(children: [
          _row(Icons.confirmation_number_rounded, 'Plate number', 'KN 4821 A'),
          const Divider(height: 20),
          _row(Icons.palette_rounded, 'Colour', 'Matte black'),
          const Divider(height: 20),
          _row(Icons.speed_rounded, 'Odometer', '18,240 km'),
          const Divider(height: 20),
          _row(Icons.local_gas_station_rounded, 'Fuel type', 'Petrol'),
        ])),
        const SizedBox(height: 16),
        const Text('Maintenance', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        SurfaceCard(child: Column(children: [
          _row(Icons.build_rounded, 'Last service', '12 May 2026'),
          const Divider(height: 20),
          _row(Icons.event_rounded, 'Next service', 'Due in 640 km'),
        ])),
        const SizedBox(height: 16),
        PrimaryButton('Report an issue',
            icon: Icons.report_problem_rounded,
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Issue reported to the fleet team')))),
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

// ---------------- Shift & attendance ----------------
class RiderShiftScreen extends StatelessWidget {
  const RiderShiftScreen({super.key});
  @override
  Widget build(BuildContext context) {
    const week = [
      ('Mon', '08:02', '17:34', true),
      ('Tue', '07:58', '17:40', true),
      ('Wed', '08:10', '18:02', true),
      ('Thu', '08:00', '17:20', true),
      ('Fri', '—', '—', false),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Shift & attendance'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(22)),
          child: Column(children: [
            Row(children: [
              _hstat('4', 'Days'),
              _hdiv(),
              _hstat('34h', 'This week'),
              _hdiv(),
              _hstat('98%', 'On-time'),
            ]),
          ]),
        ),
        const SizedBox(height: 16),
        SurfaceCard(child: Row(children: [
          Container(height: 44, width: 44, decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.timer_rounded, color: AppColors.primary)),
          const SizedBox(width: 12),
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Current shift', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5)),
            Text('Started today at 08:00', style: TextStyle(color: AppColors.muted, fontSize: 12.5)),
          ])),
          Pill('Active', color: AppColors.primary.withValues(alpha: 0.14), textColor: AppColors.primary),
        ])),
        const SizedBox(height: 16),
        const Text('This week', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
        const SizedBox(height: 10),
        ...week.map((d) => Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SurfaceCard(
                padding: const EdgeInsets.all(14),
                child: Row(children: [
                  SizedBox(width: 40, child: Text(d.$1, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14))),
                  const SizedBox(width: 8),
                  Expanded(child: Text(d.$4 ? 'In ${d.$2}  ·  Out ${d.$3}' : 'No shift', style: TextStyle(color: d.$4 ? AppColors.inkSoft : AppColors.faint, fontSize: 13, fontWeight: FontWeight.w600))),
                  Icon(d.$4 ? Icons.check_circle_rounded : Icons.remove_circle_outline_rounded, color: d.$4 ? AppColors.primary : AppColors.faint, size: 20),
                ]),
              ),
            )),
        const SizedBox(height: 4),
        PrimaryButton('End shift',
            icon: Icons.logout_rounded,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Shift ended — have a good rest!')));
              Navigator.maybePop(context);
            }),
      ]),
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
      appBar: backAppBar(context, 'Edit profile'),
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
        const RiderField(label: 'Full name', hint: 'Jean Mukendi', icon: Icons.person_outline_rounded),
        const SizedBox(height: 16),
        const RiderField(label: 'Phone', hint: '+243 810 000 082', icon: Icons.phone_outlined),
        const SizedBox(height: 16),
        const RiderField(label: 'Email', hint: 'jean.m@somba.cd', icon: Icons.email_outlined),
        const SizedBox(height: 16),
        const RiderField(label: 'Emergency contact', hint: '+243 810 000 111', icon: Icons.contact_emergency_outlined),
        const SizedBox(height: 24),
        PrimaryButton('Save changes',
            icon: Icons.check_rounded,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile updated')));
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
      appBar: backAppBar(context, 'About'),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 20, 20, 24), children: [
        Center(child: Column(children: [
          Container(height: 84, width: 84, decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(24)), child: const Icon(Icons.two_wheeler_rounded, color: Colors.white, size: 46)),
          const SizedBox(height: 16),
          const Text('Somba&Teka Rider', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 20, fontFamily: 'PlusJakartaSans')),
          const SizedBox(height: 4),
          const Text('Version 1.0.0', style: TextStyle(color: AppColors.muted, fontSize: 13)),
        ])),
        const SizedBox(height: 24),
        SurfaceCard(child: Column(children: [
          _link(Icons.description_outlined, 'Terms of service'),
          const Divider(height: 20),
          _link(Icons.privacy_tip_outlined, 'Privacy policy'),
          const Divider(height: 20),
          _link(Icons.star_outline_rounded, 'Rate the app'),
        ])),
        const SizedBox(height: 20),
        const Center(child: Text('© 2026 Somba&Teka. All rights reserved.', style: TextStyle(color: AppColors.faint, fontSize: 12))),
      ]),
    );
  }

  Widget _link(IconData icon, String label) => Row(children: [
        Icon(icon, color: AppColors.primary, size: 20),
        const SizedBox(width: 12),
        Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5))),
        const Icon(Icons.chevron_right_rounded, color: AppColors.faint),
      ]);
}
