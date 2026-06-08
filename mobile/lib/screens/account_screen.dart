import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import 'orders_screen.dart';
import 'cart_screen.dart';

class AccountScreen extends StatelessWidget {
  final Locale locale;
  final void Function(Locale) onLocaleChanged;

  const AccountScreen({super.key, required this.locale, required this.onLocaleChanged});

  @override
  Widget build(BuildContext context) {
    final s = Strings(locale.languageCode);

    return Scaffold(
      appBar: AppBar(title: Text(s.account)),
      body: ListView(
        children: [
          Container(
            padding: const EdgeInsets.all(24),
            color: Theme.of(context).colorScheme.primary,
            child: const Row(
              children: [
                CircleAvatar(radius: 32, backgroundColor: Colors.white, child: Icon(Icons.person, size: 32)),
                SizedBox(width: 16),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Marie Dubois', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                    Text('marie@email.com', style: TextStyle(color: Colors.white70)),
                  ],
                ),
              ],
            ),
          ),
          _tile(Icons.shopping_bag_outlined, s.orders, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => OrdersScreen(locale: locale)))),
          _tile(Icons.favorite_border, s.wishlist, onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => CartScreen(locale: locale)))),
          _tile(Icons.account_balance_wallet_outlined, s.wallet, onTap: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Somba Wallet (mock)')))),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.language),
            title: Text(s.language),
            trailing: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'en', label: Text('EN')),
                ButtonSegment(value: 'fr', label: Text('FR')),
              ],
              selected: {locale.languageCode},
              onSelectionChanged: (v) => onLocaleChanged(Locale(v.first)),
            ),
          ),
          _tile(Icons.settings_outlined, s.settings),
          _tile(Icons.help_outline, 'Support'),
          const Divider(),
          ListTile(
            leading: Icon(Icons.info_outline, color: Colors.amber[700]),
            title: Text(s.prototype),
            subtitle: Text(locale.languageCode == 'fr' ? 'Données simulées' : 'Mock data — no backend'),
          ),
        ],
      ),
    );
  }

  Widget _tile(IconData icon, String title, {VoidCallback? onTap}) {
    return ListTile(leading: Icon(icon), title: Text(title), trailing: const Icon(Icons.chevron_right), onTap: onTap);
  }
}
