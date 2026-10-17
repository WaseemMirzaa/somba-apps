import 'package:flutter/material.dart';
import '../../data/market_profiles.dart';
import '../../l10n/strings.dart';
import '../../services/realtime_store.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';
import 'auth_screens.dart' show OtpScreen, VerifyEmailScreen;
import 'support_extra.dart';

// Account settings — notification choices are saved on the account (me:setPrefs).
class CustomerSettingsScreen extends StatelessWidget {
  final Locale locale;
  final VoidCallback? onAccountDeleted;
  const CustomerSettingsScreen({super.key, this.locale = const Locale('en'), this.onAccountDeleted});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([RealtimeStore.instance, marketNotifier]),
      builder: (context, _) {
        final s = Strings.of(context);
        final store = RealtimeStore.instance;
        bool pref(String k) => store.prefs[k] == true;
        return Scaffold(
          appBar: backAppBar(context, s.settings),
          body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
            _group(s.settingsNotifications, [
              _toggle(Icons.notifications_active_rounded, s.settingsPush, s.settingsPushSub, pref('push'), (v) => store.setPref('push', v)),
              _toggle(Icons.mail_outline_rounded, s.settingsEmail, s.settingsEmailSub, pref('email'), (v) => store.setPref('email', v)),
              _toggle(Icons.sms_outlined, s.settingsSms, s.settingsSmsSub, pref('sms'), (v) => store.setPref('sms', v)),
            ]),
            const SizedBox(height: 14),
            _group(s.settingsPricesIn, [
              _market(context, s, MarketProfileId.drc, Icons.paid_rounded),
              _market(context, s, MarketProfileId.france, Icons.attach_money_rounded),
            ]),
            const SizedBox(height: 14),
            _group(s.settingsPrivacy, [
              _toggle(Icons.auto_awesome_rounded, s.settingsPersonalize, s.settingsPersonalizeSub, pref('personalize'), (v) => store.setPref('personalize', v)),
            ]),
            const SizedBox(height: 14),
            _group(s.account, [
              if (store.user != null && !store.user!.phoneVerified && (store.user!.phone ?? '').isNotEmpty)
                _nav(Icons.sms_outlined, s.settingsVerifyPhone, () => Navigator.push(context, MaterialPageRoute(builder: (_) => OtpScreen(phone: store.user!.phone)))),
              if (store.user != null && !store.user!.emailVerified)
                _nav(Icons.mark_email_unread_outlined, s.settingsVerifyEmail, () => Navigator.push(context, MaterialPageRoute(builder: (_) => const VerifyEmailScreen()))),
              _nav(Icons.lock_reset_rounded, s.settingsChangePw, () => _changePassword(context)),
              _nav(Icons.info_outline_rounded, s.settingsAbout, () => showAboutDialog(
                    context: context,
                    applicationName: 'Somba&Teka',
                    applicationLegalese: '© 2026 Somba&Teka',
                  )),
              _nav(Icons.delete_outline_rounded, s.delaccTitle,
                  () => Navigator.push(context, MaterialPageRoute(builder: (_) => AccountDeleteScreen(onDeleted: onAccountDeleted)))),
            ]),
          ]),
        );
      },
    );
  }

  Future<void> _changePassword(BuildContext context) async {
    final s = Strings.of(context);
    final cur = TextEditingController();
    final next = TextEditingController();
    String? err;
    bool busy = false;
    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          title: Text(s.settingsChangePw),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(key: const ValueKey('pw-current'), controller: cur, obscureText: true, decoration: InputDecoration(labelText: s.pwCurrent)),
            const SizedBox(height: 10),
            TextField(
                key: const ValueKey('pw-new'),
                controller: next,
                obscureText: true,
                decoration: InputDecoration(labelText: s.pwNew, errorText: err)),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: Text(s.cancel)),
            FilledButton(
              key: const ValueKey('pw-save'),
              onPressed: busy
                  ? null
                  : () async {
                      setState(() {
                        busy = true;
                        err = null;
                      });
                      try {
                        await RealtimeStore.instance.changePassword(cur.text, next.text);
                        if (!ctx.mounted) return;
                        Navigator.pop(ctx);
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s.pwChanged)));
                        }
                      } catch (e) {
                        setState(() {
                          busy = false;
                          err = Strings.current.errorText(e);
                        });
                      }
                    },
              child: Text(s.save),
            ),
          ],
        ),
      ),
    );
  }

  Widget _group(String title, List<Widget> rows) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.fromLTRB(4, 0, 4, 8), child: Text(title, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14.5))),
        Panel(padding: EdgeInsets.zero, child: Column(children: rows)),
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

  Widget _market(BuildContext context, Strings s, MarketProfileId id, IconData icon) {
    final sel = marketNotifier.value == id;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      leading: _icon(icon),
      title: Text(s.t('market_${id.name}'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
      trailing: Icon(sel ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded, color: sel ? AppColors.primary : AppColors.faint),
      onTap: () {
        marketNotifier.value = id;
        RealtimeStore.instance.setPref('market', id == MarketProfileId.drc ? 'DRC' : 'FR');
      },
    );
  }

  Widget _icon(IconData icon) => Container(
        height: 40,
        width: 40,
        decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
        child: Icon(icon, color: AppColors.primary, size: 21),
      );
}

// Edit profile — name and phone (the email is the login and can't be changed here).
class CustomerEditProfileScreen extends StatefulWidget {
  final Locale locale;
  const CustomerEditProfileScreen({super.key, this.locale = const Locale('en')});
  @override
  State<CustomerEditProfileScreen> createState() => _CustomerEditProfileScreenState();
}

class _CustomerEditProfileScreenState extends State<CustomerEditProfileScreen> {
  late final TextEditingController _name = TextEditingController(text: RealtimeStore.instance.user?.name ?? '');
  late final TextEditingController _phone = TextEditingController(text: RealtimeStore.instance.user?.phone ?? '');
  bool _busy = false;
  String? _err;

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _busy = true;
      _err = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      await RealtimeStore.instance.updateProfile(name: _name.text.trim(), phone: _phone.text.trim());
      if (!mounted) return;
      messenger.showSnackBar(SnackBar(content: Text(Strings.of(context).profileUpdated)));
      Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _err = Strings.current.errorText(e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = Strings.of(context);
    final u = RealtimeStore.instance.user;
    final initials = (u?.name ?? '?').trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).take(2).map((w) => w[0]).join().toUpperCase();
    return Scaffold(
      appBar: backAppBar(context, s.editProfile),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [
        Center(
          child: Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: AppColors.primary.withValues(alpha: 0.4), width: 2)),
            child: CircleAvatar(radius: 44, backgroundColor: AppColors.primary, child: Text(initials, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 28))),
          ),
        ),
        const SizedBox(height: 24),
        AppField(label: s.fullName, hint: s.yourName, icon: Icons.person_outline_rounded, controller: _name),
        const SizedBox(height: 16),
        AppField(label: s.phone, hint: '+243 81 234 5678', icon: Icons.phone_outlined, keyboard: TextInputType.phone, controller: _phone, error: _err),
        if (u != null && !u.phoneVerified && (u.phone ?? '').isNotEmpty)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              key: const ValueKey('verify-phone'),
              onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OtpScreen(phone: u.phone))),
              icon: const Icon(Icons.sms_outlined, size: 18),
              label: Text(s.verifyThisPhone),
            ),
          ),
        const SizedBox(height: 16),
        AppField(label: s.emailLogin, icon: Icons.mail_outline_rounded, initial: u?.email ?? ''),
        const SizedBox(height: 24),
        PrimaryButton(_busy ? '…' : s.saveChanges, icon: Icons.check_rounded, onPressed: _busy ? null : _save),
      ]),
    );
  }
}
