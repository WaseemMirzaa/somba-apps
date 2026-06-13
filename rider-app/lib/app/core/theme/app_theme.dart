import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Somba&Teka design tokens, mirrored 1:1 from the web portals
/// (web/src/app/globals.css).
class AppColors {
  AppColors._();

  static const Color primary = Color(0xFF1A3AA8); // --primary
  static const Color primaryHover = Color(0xFF142C82); // --primary-hover
  static const Color primaryDark = Color(0xFF0E1F5C); // --primary-dark
  static const Color primaryLight = Color(0xFFEEF1FE); // --primary-light
  static const Color accent = Color(0xFFE11428); // --brand-red
  static const Color accentLight = Color(0xFFFFF1F2); // --brand-red-light
  static const Color background = Color(0xFFF5F7FC); // --background
  static const Color surface = Colors.white; // --surface
  static const Color success = Color(0xFF059669); // --success
  static const Color warning = Color(0xFFD97706); // --warning
  static const Color danger = Color(0xFFDC2626); // --danger
  static const Color text = Color(0xFF0B1020); // --foreground
  static const Color textMuted = Color(0xFF64748B); // slate-500
  static const Color border = Color(0x140F172A); // --border rgba(15,23,42,.08)
  static const Color accentGlow = Color(0x471A3AA8); // rgba(26,58,168,.28)
}

class AppTheme {
  AppTheme._();

  /// Web radii: 14px cards (--radius), 12px buttons & inputs.
  static const cardRadius = 14.0;
  static const controlRadius = 12.0;

  static ThemeData get light {
    const scheme = ColorScheme(
      brightness: Brightness.light,
      primary: AppColors.primary,
      onPrimary: Colors.white,
      secondary: AppColors.accent,
      onSecondary: Colors.white,
      error: AppColors.danger,
      onError: Colors.white,
      surface: AppColors.surface,
      onSurface: AppColors.text,
    );

    final inputBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(controlRadius),
      borderSide: const BorderSide(color: AppColors.border),
    );

    final base = ThemeData(useMaterial3: true, colorScheme: scheme);

    // Web typography: Inter for body (--font-sans),
    // Plus Jakarta Sans for display headings (--font-display).
    final body = GoogleFonts.interTextTheme(base.textTheme)
        .apply(bodyColor: AppColors.text, displayColor: AppColors.text);
    final textTheme = body.copyWith(
      headlineLarge: GoogleFonts.plusJakartaSans(
          textStyle: body.headlineLarge, fontWeight: FontWeight.w800),
      headlineMedium: GoogleFonts.plusJakartaSans(
          textStyle: body.headlineMedium, fontWeight: FontWeight.w800),
      headlineSmall: GoogleFonts.plusJakartaSans(
          textStyle: body.headlineSmall, fontWeight: FontWeight.w800),
      titleLarge: GoogleFonts.plusJakartaSans(
          textStyle: body.titleLarge, fontWeight: FontWeight.w700),
    );

    return base.copyWith(
      textTheme: textTheme,
      scaffoldBackgroundColor: AppColors.background,
      appBarTheme: AppBarTheme(
        backgroundColor: AppColors.surface,
        foregroundColor: AppColors.text,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: GoogleFonts.plusJakartaSans(
          color: AppColors.text,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(cardRadius),
          side: const BorderSide(color: AppColors.border),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          elevation: 4,
          shadowColor: AppColors.accentGlow,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(controlRadius)),
          textStyle:
              GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.primary, width: 1.5),
          minimumSize: const Size(0, 44),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(controlRadius)),
          textStyle:
              GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          textStyle:
              GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: inputBorder,
        enabledBorder: inputBorder,
        focusedBorder: inputBorder.copyWith(
          borderSide: const BorderSide(color: AppColors.primary, width: 1.6),
        ),
        errorBorder: inputBorder.copyWith(
          borderSide: const BorderSide(color: AppColors.danger),
        ),
        focusedErrorBorder: inputBorder.copyWith(
          borderSide: const BorderSide(color: AppColors.danger, width: 1.6),
        ),
        hintStyle: GoogleFonts.inter(color: AppColors.textMuted),
        labelStyle: GoogleFonts.inter(color: AppColors.textMuted),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: AppColors.surface,
        indicatorColor: AppColors.primaryLight,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => GoogleFonts.inter(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: states.contains(WidgetState.selected)
                ? AppColors.primary
                : AppColors.textMuted,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? AppColors.primary
                : AppColors.textMuted,
          ),
        ),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.border, space: 1),
      snackBarTheme:
          const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    );
  }
}
