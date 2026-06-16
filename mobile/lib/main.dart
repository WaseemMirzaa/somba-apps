import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'app.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const SombaApp());
}

class SombaApp extends StatefulWidget {
  const SombaApp({super.key});

  @override
  State<SombaApp> createState() => _SombaAppState();
}

class _SombaAppState extends State<SombaApp> {
  Locale _locale = const Locale('en');

  void _setLocale(Locale locale) {
    setState(() => _locale = locale);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Somba',
      debugShowCheckedModeBanner: false,
      locale: _locale,
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: buildAppTheme(),
      home: AppShell(onLocaleChanged: _setLocale, locale: _locale),
    );
  }
}
