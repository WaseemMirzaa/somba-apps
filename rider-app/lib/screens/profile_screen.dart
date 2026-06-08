import 'package:flutter/material.dart';

class ProfileScreen extends StatelessWidget {
  final Locale locale;
  final ValueChanged<Locale> onLocaleChanged;
  final VoidCallback onThemeToggle;

  const ProfileScreen({
    super.key,
    required this.locale,
    required this.onLocaleChanged,
    required this.onThemeToggle,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const CircleAvatar(radius: 40, child: Text('JM', style: TextStyle(fontSize: 24))),
        const SizedBox(height: 12),
        const Center(child: Text('Jean Mukendi', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold))),
        const Center(child: Text('RDR-001 · ⭐ 4.9')),
        const SizedBox(height: 24),
        SwitchListTile(
          title: const Text('On Duty'),
          value: true,
          onChanged: (_) {},
        ),
        ListTile(
          leading: const Icon(Icons.language),
          title: const Text('Language'),
          trailing: DropdownButton<Locale>(
            value: locale,
            items: const [
              DropdownMenuItem(value: Locale('en'), child: Text('EN')),
              DropdownMenuItem(value: Locale('fr'), child: Text('FR')),
            ],
            onChanged: (l) => l != null ? onLocaleChanged(l) : null,
          ),
        ),
        ListTile(
          leading: const Icon(Icons.dark_mode),
          title: const Text('Dark Mode'),
          onTap: onThemeToggle,
        ),
        const ListTile(leading: Icon(Icons.two_wheeler), title: Text('Honda CB150'), subtitle: Text('Motorcycle')),
        const ListTile(leading: Icon(Icons.location_city), title: Text('Zone'), subtitle: Text('Paris — 2e arrondissement')),
      ],
    );
  }
}
