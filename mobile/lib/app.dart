import 'package:flutter/material.dart';
import 'screens/home_screen.dart';
import 'screens/categories_screen.dart';
import 'screens/deals_screen.dart';
import 'screens/account_screen.dart';
import 'theme/app_theme.dart';
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
      extendBody: true,
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF1E293B).withValues(alpha: 0.08),
              blurRadius: 20,
              offset: const Offset(0, -4),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          child: NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (i) => setState(() => _index = i),
            destinations: [
              NavigationDestination(
                  icon: const Icon(Icons.home_outlined),
                  selectedIcon: const Icon(Icons.home_rounded),
                  label: s.home),
              NavigationDestination(
                  icon: const Icon(Icons.grid_view_outlined),
                  selectedIcon: const Icon(Icons.grid_view_rounded),
                  label: s.categories),
              NavigationDestination(
                  icon: const Icon(Icons.local_fire_department_outlined),
                  selectedIcon: const Icon(Icons.local_fire_department_rounded),
                  label: s.deals),
              NavigationDestination(
                  icon: const Icon(Icons.person_outline_rounded),
                  selectedIcon: const Icon(Icons.person_rounded),
                  label: s.account),
            ],
          ),
        ),
      ),
    );
  }
}
