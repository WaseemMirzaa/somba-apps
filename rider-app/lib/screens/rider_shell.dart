import 'package:flutter/material.dart';
import 'tasks_screen.dart';
import 'earnings_screen.dart';
import 'map_screen.dart';
import 'profile_screen.dart';

class RiderShell extends StatefulWidget {
  final Locale locale;
  final ValueChanged<Locale> onLocaleChanged;
  final VoidCallback onThemeToggle;

  const RiderShell({
    super.key,
    required this.locale,
    required this.onLocaleChanged,
    required this.onThemeToggle,
  });

  @override
  State<RiderShell> createState() => _RiderShellState();
}

class _RiderShellState extends State<RiderShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final screens = [
      TasksScreen(locale: widget.locale),
      MapScreen(locale: widget.locale),
      EarningsScreen(locale: widget.locale),
      ProfileScreen(locale: widget.locale, onLocaleChanged: widget.onLocaleChanged, onThemeToggle: widget.onThemeToggle),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('Somba Rider'),
        actions: [
          Chip(label: Text(widget.locale.languageCode.toUpperCase()), backgroundColor: Colors.green.shade50),
          const SizedBox(width: 8),
        ],
      ),
      body: screens[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.list_alt), label: 'Tasks'),
          NavigationDestination(icon: Icon(Icons.map), label: 'Navigate'),
          NavigationDestination(icon: Icon(Icons.payments), label: 'Earnings'),
          NavigationDestination(icon: Icon(Icons.person), label: 'Profile'),
        ],
      ),
    );
  }
}
