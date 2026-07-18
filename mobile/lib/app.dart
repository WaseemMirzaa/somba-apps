import 'package:flutter/material.dart';
import 'screens/home_screen.dart';
import 'screens/categories_screen.dart';
import 'screens/deals_screen.dart';
import 'screens/account_screen.dart';
import 'screens/live_console_screen.dart';
import 'theme/app_theme.dart';
import 'l10n/strings.dart';

class AppShell extends StatefulWidget {
  final void Function(Locale) onLocaleChanged;
  final Locale locale;
  final VoidCallback? onLogout;

  const AppShell({super.key, required this.onLocaleChanged, required this.locale, this.onLogout});

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
      const LiveConsoleScreen(),
      AccountScreen(locale: widget.locale, onLocaleChanged: widget.onLocaleChanged, onLogout: widget.onLogout),
    ];

    final items = <_NavItem>[
      _NavItem(Icons.home_rounded, s.home),
      _NavItem(Icons.grid_view_rounded, s.categories),
      _NavItem(Icons.local_fire_department_rounded, s.deals),
      _NavItem(Icons.bolt_rounded, 'Live'),
      _NavItem(Icons.person_rounded, s.account),
    ];

    return Scaffold(
      extendBody: true,
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: _FloatingNav(
        items: items,
        index: _index,
        onTap: (i) => setState(() => _index = i),
      ),
    );
  }
}

class _NavItem {
  final IconData icon;
  final String label;
  _NavItem(this.icon, this.label);
}

/// A modern floating capsule navigation bar with an animated selection pill
/// that expands to reveal the active label.
class _FloatingNav extends StatelessWidget {
  final List<_NavItem> items;
  final int index;
  final ValueChanged<int> onTap;

  const _FloatingNav({required this.items, required this.index, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).padding.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(18, 0, 18, 12 + (bottom > 0 ? bottom - 6 : 6)),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(100),
          boxShadow: AppShadow.floating,
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(items.length, (i) {
            final selected = i == index;
            return Expanded(
              flex: selected ? 0 : 1,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () => onTap(i),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 280),
                  curve: Curves.easeOutCubic,
                  height: 48,
                  padding: EdgeInsets.symmetric(horizontal: selected ? 18 : 0),
                  decoration: BoxDecoration(
                    gradient: selected ? AppColors.brandGradient : null,
                    borderRadius: BorderRadius.circular(100),
                    boxShadow: selected ? AppShadow.lifted : null,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(items[i].icon,
                          size: 23,
                          color: selected ? Colors.white : AppColors.faint),
                      AnimatedSize(
                        duration: const Duration(milliseconds: 240),
                        curve: Curves.easeOutCubic,
                        child: selected
                            ? Padding(
                                padding: const EdgeInsets.only(left: 8),
                                child: Text(
                                  items[i].label,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w700,
                                    fontSize: 13.5,
                                    letterSpacing: -0.2,
                                  ),
                                ),
                              )
                            : const SizedBox.shrink(),
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }
}
