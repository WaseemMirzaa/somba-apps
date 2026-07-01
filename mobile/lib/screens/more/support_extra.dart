import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../theme/app_theme.dart';
import '../../widgets/kit.dart';
import '../../widgets/common.dart';

class AddressFormScreen extends StatelessWidget {
  final Locale locale;
  const AddressFormScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: backAppBar(context, 'Add address'),
      body: ListView(padding: const EdgeInsets.fromLTRB(20, 12, 20, 24), children: [
        const AppField(label: 'Label', hint: 'Home, Work…', icon: Icons.bookmark_outline_rounded),
        const SizedBox(height: 16),
        const AppField(label: 'Full name', hint: 'Marie Dubois', icon: Icons.person_outline_rounded),
        const SizedBox(height: 16),
        const AppField(label: 'Phone', hint: '+243 970 000 000', icon: Icons.phone_outlined, keyboard: TextInputType.phone),
        const SizedBox(height: 16),
        const AppField(label: 'Address', hint: '12 Commerce Ave', icon: Icons.location_on_outlined),
        const SizedBox(height: 16),
        const Row(children: [
          Expanded(child: AppField(label: 'City', hint: 'Kinshasa')),
          SizedBox(width: 12),
          Expanded(child: AppField(label: 'Zone', hint: 'Gombe')),
        ]),
        const SizedBox(height: 16),
        const Row(children: [
          Icon(Icons.check_box_rounded, color: AppColors.primary, size: 22),
          SizedBox(width: 8),
          Text('Set as default address', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
        ]),
        const SizedBox(height: 20),
        PrimaryButton('Save address',
            icon: Icons.save_rounded,
            onPressed: () {
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Address saved')));
              Navigator.maybePop(context);
            }),
      ]),
    );
  }
}

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

class SupportListScreen extends StatelessWidget {
  final Locale locale;
  const SupportListScreen({super.key, this.locale = const Locale('en')});
  @override
  Widget build(BuildContext context) {
    const tickets = [
      ('TKT-3391', 'Refund not received', 'Open', AppColors.amber),
      ('TKT-3382', 'Wrong item delivered', 'In progress', AppColors.primary),
      ('TKT-3360', 'Change delivery address', 'Resolved', AppColors.success),
    ];
    return Scaffold(
      appBar: backAppBar(context, 'Support'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        ...tickets.map((t) => Padding(padding: const EdgeInsets.only(bottom: 12), child: Panel(
          child: Row(children: [
            Container(height: 44, width: 44, decoration: BoxDecoration(color: t.$4.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)), child: Icon(Icons.confirmation_number_outlined, color: t.$4)),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t.$2, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
              Text(t.$1, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
            ])),
            Pill(t.$3, color: t.$4.withValues(alpha: 0.14), textColor: t.$4, fontSize: 10.5),
          ]),
        ))),
        const SizedBox(height: 4),
        PrimaryButton('New ticket',
            icon: Icons.add_rounded,
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Opening a new support ticket…')))),
      ]),
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
      appBar: backAppBar(context, 'Help & support'),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 24), children: [
        Row(children: [
          Expanded(child: _contact(Icons.chat_bubble_rounded, 'Live chat', AppColors.primary)),
          const SizedBox(width: 12),
          Expanded(child: _contact(Icons.call_rounded, 'Call us', AppColors.success)),
          const SizedBox(width: 12),
          Expanded(child: _contact(Icons.mail_rounded, 'Email', AppColors.royalBlue)),
        ]),
        const SectionHeader('FAQs', padding: EdgeInsets.fromLTRB(4, 22, 4, 10)),
        Panel(padding: EdgeInsets.zero, child: Column(children: [
          for (int i = 0; i < faqs.length; i++) ...[
            ListTile(
              contentPadding: const EdgeInsets.symmetric(horizontal: 16),
              title: Text(faqs[i], style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5)),
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
          label: const Text('Delete my account'),
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
