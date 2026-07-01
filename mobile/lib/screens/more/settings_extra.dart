import 'package:flutter/material.dart';
import '../../data/market_profiles.dart';
import '../../theme/app_theme.dart';
import '../../util/format.dart';
import '../../widgets/kit.dart';
import 'support_extra.dart';

// CF-19 — Account settings.
class CustomerSettingsScreen extends StatefulWidget {
  final Locale locale;
  const CustomerSettingsScreen({super.key, this.locale = const Locale('en')});
  @override
  State<CustomerSettingsScreen> createState() => _CustomerSettingsScreenState();
}

class _CustomerSettingsScreenState extends State<CustomerSettingsScreen> {
  bool _push = true, _email = true, _sms = false, _personalized = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Settings'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        _group('Notifications', [
          _toggle(Icons.notifications_active_rounded, 'Push notifications', 'Order updates & offers', _push, (v) => setState(() => _push = v)),
          _toggle(Icons.mail_outline_rounded, 'Email', 'Receipts & newsletters', _email, (v) => setState(() => _email = v)),
          _toggle(Icons.sms_outlined, 'SMS', 'Delivery alerts by text', _sms, (v) => setState(() => _sms = v)),
        ]),
        const SizedBox(height: 14),
        _group('Market & currency', [
          _market('France (Demo)', 'Prices in USD', MarketProfileId.france),
          _market('DR Congo', 'Prices in Congolese Franc (FC)', MarketProfileId.drc),
        ]),
        const SizedBox(height: 14),
        _group('Privacy', [
          _toggle(Icons.auto_awesome_rounded, 'Personalized recommendations', 'Use my activity to improve results', _personalized, (v) => setState(() => _personalized = v)),
        ]),
        const SizedBox(height: 14),
        _group('Account', [
          _nav(Icons.lock_reset_rounded, 'Change password', () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Password reset link sent')))),
          _nav(Icons.info_outline_rounded, 'About Somba&Teka', () => showAboutDialog(
                context: context,
                applicationName: 'Somba&Teka',
                applicationVersion: '1.0.0',
                applicationLegalese: '© 2026 Somba&Teka',
              )),
          _nav(Icons.delete_outline_rounded, 'Delete account', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const AccountDeleteScreen()))),
        ]),
      ]),
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

  Widget _market(String title, String sub, MarketProfileId id) {
    final sel = marketNotifier.value == id;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 2),
      leading: _icon(id == MarketProfileId.france ? Icons.euro_rounded : Icons.paid_rounded),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
      subtitle: Text(sub, style: const TextStyle(fontSize: 12.5)),
      trailing: Icon(sel ? Icons.radio_button_checked_rounded : Icons.radio_button_unchecked_rounded,
          color: sel ? AppColors.primary : AppColors.faint),
      onTap: () {
        marketNotifier.value = id;
        setState(() {});
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Market set to $title')));
      },
    );
  }

  Widget _icon(IconData icon) => Container(
        height: 40, width: 40,
        decoration: BoxDecoration(color: AppColors.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)),
        child: Icon(icon, color: AppColors.primary, size: 21),
      );
}

// CF-19 — Edit profile.
class CustomerEditProfileScreen extends StatelessWidget {
  final Locale locale;
  const CustomerEditProfileScreen({super.key, this.locale = const Locale('en')});
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
              child: const CircleAvatar(radius: 44, backgroundColor: AppColors.primary, child: Text('MD', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 28))),
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
        const AppField(label: 'Full name', hint: 'Marie Dubois', icon: Icons.person_outline_rounded, initial: 'Marie Dubois'),
        const SizedBox(height: 16),
        const AppField(label: 'Phone', hint: '+243 970 000 000', icon: Icons.phone_outlined, keyboard: TextInputType.phone, initial: '+243 970 000 000'),
        const SizedBox(height: 16),
        const AppField(label: 'Email', hint: 'marie@email.com', icon: Icons.mail_outline_rounded, keyboard: TextInputType.emailAddress, initial: 'marie@email.com'),
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
