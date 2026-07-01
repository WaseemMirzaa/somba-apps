// Dev-only entry point to screenshot individual screens deterministically.
// Build: flutter build web -t lib/gallery.dart   →  open ?s=<key>
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'theme/app_theme.dart';
import 'data/mock_tasks.dart';
import 'screens/more/rider_more.dart';
import 'screens/more/rider_more2.dart';

void main() => runApp(const _GalleryApp());

Map<String, WidgetBuilder> get _screens => {
      'login': (_) => const RiderLoginScreen(),
      'task-detail': (_) => TaskDetailScreen(task: mockTasks.first),
      'pod': (_) => PodScreen(task: mockTasks.first),
      'failed': (_) => const FailedDeliveryScreen(),
      'history': (_) => const RiderHistoryScreen(),
      'notifications': (_) => const RiderNotificationsScreen(),
      'batch': (_) => const BatchOverviewScreen(),
      'zone': (_) => const ZoneScreen(),
    };

class _GalleryApp extends StatelessWidget {
  const _GalleryApp();
  @override
  Widget build(BuildContext context) {
    final key = Uri.base.queryParameters['s'] ?? 'login';
    final builder = _screens[key] ?? (_) => Scaffold(body: Center(child: Text('Unknown screen: $key')));
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      home: Builder(builder: builder),
    );
  }
}
