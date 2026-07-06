import 'package:flutter/material.dart';
import '../l10n/strings.dart';
import '../theme/app_theme.dart';
import 'tasks_screen.dart';
import 'map_screen.dart';
import 'profile_screen.dart';

class RiderShell extends StatefulWidget {
  final Locale locale;
  final ValueChanged<Locale> onLocaleChanged;
  final VoidCallback? onLogout;
  final int initialIndex;

  const RiderShell({super.key, required this.locale, required this.onLocaleChanged, this.onLogout, this.initialIndex = 0});

  @override
  State<RiderShell> createState() => _RiderShellState();
}

class _RiderShellState extends State<RiderShell> {
  late int _index = widget.initialIndex;

  @override
  Widget build(BuildContext context) {
    final screens = [
      TasksScreen(locale: widget.locale),
      MapScreen(locale: widget.locale),
      ProfileScreen(locale: widget.locale, onLocaleChanged: widget.onLocaleChanged, onLogout: widget.onLogout),
    ];
    final items = <_NavItem>[
      _NavItem(Icons.assignment_rounded, tr(context, 'Tasks')),
      _NavItem(Icons.navigation_rounded, tr(context, 'Navigate')),
      _NavItem(Icons.person_rounded, tr(context, 'Profile')),
    ];

    return Scaffold(
      extendBody: true,
      body: IndexedStack(index: _index, children: screens),
      bottomNavigationBar: _FloatingNav(items: items, index: _index, onTap: (i) => setState(() => _index = i)),
    );
  }
}

class _NavItem {
  final IconData icon;
  final String label;
  _NavItem(this.icon, this.label);
}

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
                  padding: EdgeInsets.symmetric(horizontal: selected ? 16 : 0),
                  decoration: BoxDecoration(
                    gradient: selected ? AppColors.brandGradient : null,
                    borderRadius: BorderRadius.circular(100),
                    boxShadow: selected ? AppShadow.lifted : null,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(items[i].icon, size: 22, color: selected ? Colors.white : AppColors.faint),
                      AnimatedSize(
                        duration: const Duration(milliseconds: 240),
                        curve: Curves.easeOutCubic,
                        child: selected
                            ? Padding(
                                padding: const EdgeInsets.only(left: 8),
                                child: Text(items[i].label,
                                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13, letterSpacing: -0.2)),
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
