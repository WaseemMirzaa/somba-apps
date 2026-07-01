import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Design system for the Somba rider app — an energetic emerald/teal identity
/// that reads as "on the move / on duty".
class AppColors {
  AppColors._();

  static const Color primary = Color(0xFF059669); // emerald 600
  static const Color primaryDark = Color(0xFF047857); // emerald 700
  static const Color teal = Color(0xFF0D9488);
  static const Color cyan = Color(0xFF06B6D4);
  static const Color accent = Color(0xFFF59E0B); // COD / cash amber
  static const Color info = Color(0xFF3B82F6); // navigate
  static const Color danger = Color(0xFFEF4444); // failed / return
  static const Color violet = Color(0xFF7C3AED); // pickup

  // Neutrals aligned with the Somba&Teka web app.
  static const Color ink = Color(0xFF0B1020); // web foreground
  static const Color inkSoft = Color(0xFF334155);
  static const Color muted = Color(0xFF64748B);
  static const Color faint = Color(0xFF94A3B8);
  static const Color line = Color(0xFFE7EAF3);
  static const Color background = Color(0xFFF5F7FC); // web background
  static const Color surface = Color(0xFFFFFFFF);

  // Emerald→teal, matching the web rider portal (emerald-400 → teal-600).
  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF34D399), Color(0xFF059669), Color(0xFF0D9488)],
  );
  static const LinearGradient cashGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFFF59E0B), Color(0xFFEA580C)],
  );
}

class AppShadow {
  AppShadow._();
  static List<BoxShadow> card = [
    BoxShadow(color: const Color(0xFF0B1220).withValues(alpha: 0.05), blurRadius: 14, offset: const Offset(0, 6)),
  ];
  static List<BoxShadow> soft = [
    BoxShadow(color: const Color(0xFF0B1220).withValues(alpha: 0.06), blurRadius: 18, offset: const Offset(0, 8)),
  ];
  static List<BoxShadow> lifted = [
    BoxShadow(color: AppColors.primary.withValues(alpha: 0.30), blurRadius: 20, offset: const Offset(0, 10)),
  ];
  static List<BoxShadow> floating = [
    BoxShadow(color: const Color(0xFF0B1220).withValues(alpha: 0.14), blurRadius: 28, offset: const Offset(0, 12)),
  ];
}

class AppTheme {
  AppTheme._();
  static const String _font = 'Inter';
  static const String display = 'PlusJakartaSans';

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(seedColor: AppColors.primary, brightness: Brightness.light)
        .copyWith(primary: AppColors.primary, surface: AppColors.surface);
    final base = ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: AppColors.background, fontFamily: _font);

    TextStyle t(double s, FontWeight w, {double? h, double? ls, Color? c, String? f}) =>
        TextStyle(fontFamily: f ?? _font, fontSize: s, fontWeight: w, height: h, letterSpacing: ls, color: c ?? AppColors.ink);

    return base.copyWith(
      textTheme: base.textTheme.copyWith(
        displaySmall: t(30, FontWeight.w800, h: 1.05, ls: -0.8, f: display),
        headlineSmall: t(23, FontWeight.w800, h: 1.12, ls: -0.5, f: display),
        titleLarge: t(19, FontWeight.w700, h: 1.18, ls: -0.4, f: display),
        titleMedium: t(16, FontWeight.w700, h: 1.25, ls: -0.2),
        titleSmall: t(14, FontWeight.w600, h: 1.3),
        bodyLarge: t(15, FontWeight.w500, h: 1.4, c: AppColors.inkSoft),
        bodyMedium: t(14, FontWeight.w500, h: 1.4, c: AppColors.inkSoft),
        bodySmall: t(12.5, FontWeight.w500, h: 1.35, c: AppColors.muted),
        labelLarge: t(14, FontWeight.w700, ls: 0.1),
      ).apply(bodyColor: AppColors.ink, displayColor: AppColors.ink),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
        titleTextStyle: TextStyle(fontFamily: display, fontSize: 20, fontWeight: FontWeight.w800, color: AppColors.ink, letterSpacing: -0.5),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.line, thickness: 1, space: 1),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 54),
          textStyle: t(15.5, FontWeight.w700, ls: 0.1, c: Colors.white),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size(0, 54),
          side: const BorderSide(color: AppColors.primary, width: 1.5),
          textStyle: t(15.5, FontWeight.w700, ls: 0.1, c: AppColors.primary),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.ink,
        contentTextStyle: t(13.5, FontWeight.w600, c: Colors.white),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(28))),
      ),
    );
  }
}
