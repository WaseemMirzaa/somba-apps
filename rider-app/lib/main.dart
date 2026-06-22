import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:google_fonts/google_fonts.dart';
import 'screens/rider_shell.dart';

void main() => runApp(const SombaRiderApp());

class SombaRiderApp extends StatefulWidget {
  const SombaRiderApp({super.key});

  @override
  State<SombaRiderApp> createState() => _SombaRiderAppState();
}

class _SombaRiderAppState extends State<SombaRiderApp> {
  Locale _locale = const Locale('en');
  ThemeMode _theme = ThemeMode.system;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Somba & Teka Rider',
      debugShowCheckedModeBanner: false,
      locale: _locale,
      themeMode: _theme,
      supportedLocales: const [Locale('en'), Locale('fr')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF059669), brightness: Brightness.light),
        textTheme: GoogleFonts.interTextTheme(),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF059669), brightness: Brightness.dark),
        textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
        useMaterial3: true,
      ),
      home: RiderShell(
        locale: _locale,
        onLocaleChanged: (l) => setState(() => _locale = l),
        onThemeToggle: () => setState(() => _theme = _theme == ThemeMode.light ? ThemeMode.dark : ThemeMode.light),
      ),
    );
  }
}
