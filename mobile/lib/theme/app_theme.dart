import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Central design system for the Somba customer app.
///
/// A single source of truth for colour, type, radius, spacing and elevation so
/// every screen shares the same polished, top-tier look.
class AppColors {
  AppColors._();

  static const Color primary = Color(0xFF4F46E5); // indigo 600
  static const Color primaryDark = Color(0xFF4338CA); // indigo 700
  static const Color primaryDeep = Color(0xFF312E81); // indigo 900
  static const Color accent = Color(0xFFF43F5E); // rose 500 — deals / sale
  static const Color accentDark = Color(0xFFE11D48);
  static const Color amber = Color(0xFFF59E0B); // ratings
  static const Color success = Color(0xFF10B981); // emerald
  static const Color mint = Color(0xFF14B8A6);

  static const Color ink = Color(0xFF0F172A); // slate 900
  static const Color inkSoft = Color(0xFF334155); // slate 700
  static const Color muted = Color(0xFF64748B); // slate 500
  static const Color faint = Color(0xFF94A3B8); // slate 400
  static const Color line = Color(0xFFE9ECF4);
  static const Color background = Color(0xFFF6F7FB);
  static const Color surface = Color(0xFFFFFFFF);

  /// Distinct soft gradients used to render product / category tiles natively
  /// so the UI is beautiful and fully self-contained even offline.
  static const List<List<Color>> tileGradients = [
    [Color(0xFFEEF2FF), Color(0xFFDBE3FF)],
    [Color(0xFFFFF1F2), Color(0xFFFFE0E6)],
    [Color(0xFFECFEFF), Color(0xFFCFFAFE)],
    [Color(0xFFF0FDF4), Color(0xFFDCFCE7)],
    [Color(0xFFFEF3C7), Color(0xFFFDE9B8)],
    [Color(0xFFF5F3FF), Color(0xFFEDE9FE)],
    [Color(0xFFFFF7ED), Color(0xFFFFEAD5)],
    [Color(0xFFFDF2F8), Color(0xFFFCE7F3)],
  ];

  static const LinearGradient brandGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF6D5DF6), Color(0xFF4F46E5), Color(0xFF4338CA)],
  );

  static const LinearGradient dealGradient = LinearGradient(
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
    colors: [Color(0xFFFB7185), Color(0xFFF43F5E), Color(0xFFE11D48)],
  );
}

class AppRadius {
  AppRadius._();
  static const double sm = 10;
  static const double md = 16;
  static const double lg = 22;
  static const double xl = 28;
  static const BorderRadius card = BorderRadius.all(Radius.circular(20));
  static const BorderRadius pill = BorderRadius.all(Radius.circular(100));
}

class AppShadow {
  AppShadow._();
  static List<BoxShadow> soft = [
    BoxShadow(
      color: const Color(0xFF1E293B).withValues(alpha: 0.06),
      blurRadius: 18,
      offset: const Offset(0, 8),
    ),
  ];
  static List<BoxShadow> card = [
    BoxShadow(
      color: const Color(0xFF1E293B).withValues(alpha: 0.05),
      blurRadius: 14,
      offset: const Offset(0, 6),
    ),
  ];
  static List<BoxShadow> lifted = [
    BoxShadow(
      color: AppColors.primary.withValues(alpha: 0.28),
      blurRadius: 20,
      offset: const Offset(0, 10),
    ),
  ];
}

class AppTheme {
  AppTheme._();

  static const String _font = 'Inter';

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.light,
    ).copyWith(
      primary: AppColors.primary,
      surface: AppColors.surface,
      surfaceContainerHighest: AppColors.background,
      error: AppColors.accentDark,
    );

    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: AppColors.background,
      fontFamily: _font,
      splashFactory: InkSparkle.splashFactory,
    );

    TextStyle t(double size, FontWeight w, {double? h, double? ls, Color? c}) =>
        TextStyle(
          fontFamily: _font,
          fontSize: size,
          fontWeight: w,
          height: h,
          letterSpacing: ls,
          color: c ?? AppColors.ink,
        );

    return base.copyWith(
      textTheme: base.textTheme
          .copyWith(
            displaySmall: t(30, FontWeight.w800, h: 1.1, ls: -0.5),
            headlineSmall: t(22, FontWeight.w800, h: 1.15, ls: -0.3),
            titleLarge: t(19, FontWeight.w700, h: 1.2, ls: -0.2),
            titleMedium: t(16, FontWeight.w700, h: 1.25),
            titleSmall: t(14, FontWeight.w600, h: 1.3),
            bodyLarge: t(15, FontWeight.w500, h: 1.4, c: AppColors.inkSoft),
            bodyMedium: t(14, FontWeight.w500, h: 1.4, c: AppColors.inkSoft),
            bodySmall: t(12.5, FontWeight.w500, h: 1.35, c: AppColors.muted),
            labelLarge: t(14, FontWeight.w700, ls: 0.1),
            labelMedium: t(12, FontWeight.w600, c: AppColors.muted),
          )
          .apply(bodyColor: AppColors.ink, displayColor: AppColors.ink),
      appBarTheme: const AppBarTheme(
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: _font,
          fontSize: 19,
          fontWeight: FontWeight.w700,
          color: AppColors.ink,
          letterSpacing: -0.2,
        ),
        systemOverlayStyle: SystemUiOverlayStyle.dark,
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.card),
      ),
      dividerTheme: const DividerThemeData(
        color: AppColors.line,
        thickness: 1,
        space: 1,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: AppColors.surface,
        side: const BorderSide(color: AppColors.line),
        labelStyle: t(13, FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: AppRadius.pill),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        hintStyle: t(14.5, FontWeight.w500, c: AppColors.faint),
        prefixIconColor: AppColors.muted,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadius.pill,
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadius.pill,
          borderSide: const BorderSide(color: AppColors.primary, width: 1.6),
        ),
        border: OutlineInputBorder(
          borderRadius: AppRadius.pill,
          borderSide: const BorderSide(color: AppColors.line),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size(0, 54),
          textStyle: t(15.5, FontWeight.w700, ls: 0.1, c: Colors.white),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          minimumSize: const Size(0, 54),
          side: const BorderSide(color: AppColors.primary, width: 1.5),
          textStyle: t(15.5, FontWeight.w700, ls: 0.1, c: AppColors.primary),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.md),
          ),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.primary.withValues(alpha: 0.12),
        elevation: 0,
        height: 68,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return IconThemeData(
            color: selected ? AppColors.primary : AppColors.faint,
            size: 24,
          );
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          final selected = states.contains(WidgetState.selected);
          return t(11.5, selected ? FontWeight.w700 : FontWeight.w500,
              c: selected ? AppColors.primary : AppColors.muted);
        }),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.ink,
        contentTextStyle: t(13.5, FontWeight.w600, c: Colors.white),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadius.sm),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
      ),
    );
  }
}
