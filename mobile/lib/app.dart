import 'package:flutter/material.dart';
import 'screens/home_screen.dart';
import 'screens/categories_screen.dart';
import 'screens/deals_screen.dart';
import 'screens/account_screen.dart';
import 'l10n/strings.dart';

class AppShell extends StatefulWidget {
  final void Function(Locale) onLocaleChanged;
  final Locale locale;

  const AppShell({super.key, required this.onLocaleChanged, required this.locale});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final s = Strings(widget.locale.languageCode);
    final screens = [
      HomeScreen(locale: widget.locale, onLocaleChanged: widget.onLocaleChanged),
      CategoriesScreen(locale: widget.locale),
      DealsScreen(locale: widget.locale),
      AccountScreen(locale: widget.locale, onLocaleChanged: widget.onLocaleChanged),
    ];

    return Scaffold(
      body: screens[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home), label: s.home),
          NavigationDestination(icon: const Icon(Icons.grid_view_outlined), selectedIcon: const Icon(Icons.grid_view), label: s.categories),
          NavigationDestination(icon: const Icon(Icons.bolt_outlined), selectedIcon: const Icon(Icons.bolt), label: s.deals),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: s.account),
        ],
      ),
    );
  }
}
