import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Somba&Teka design tokens, mirrored 1:1 from the web portals
/// (web/src/app/globals.css).
class AppColors {
  AppColors._();

  // Brand — Somba royal blue
  static const primary = Color(0xFF1A3AA8); // --primary
  static const primaryHover = Color(0xFF142C82); // --primary-hover
  static const primaryDark = Color(0xFF0E1F5C); // --primary-dark
  static const primaryLight = Color(0xFFEEF1FE); // --primary-light
  static const primaryTint = Color(0xFFDDE4FB); // --primary-tint

  // Brand — Tekka red accent
  static const brandRed = Color(0xFFE11428); // --brand-red
  static const brandRedHover = Color(0xFFC00E20); // --brand-red-hover
  static const brandRedLight = Color(0xFFFFF1F2); // --brand-red-light

  // Surfaces & text
  static const background = Color(0xFFF5F7FC); // --background
  static const surface = Colors.white; // --surface
  static const ink = Color(0xFF0B1020); // --foreground
  static const muted = Color(0xFF64748B); // slate-500, web secondary text
  static const border = Color(0x140F172A); // --border rgba(15,23,42,.08)
  static const borderStrong = Color(0x1F0F172A); // --border-strong

  // Status
  static const success = Color(0xFF059669); // --success
  static const warning = Color(0xFFD97706); // --warning
  static const danger = Color(0xFFDC2626); // --danger

  // Shadows
  static const accentGlow = Color(0x471A3AA8); // rgba(26,58,168,.28)
  static const redGlow = Color(0x4DE11428); // rgba(225,20,40,.30)

  // Gradient endpoint used by web .gradient-text / hero cards
  static const gradientBlueEnd = Color(0xFF3258D8);
}

class AppTheme {
  AppTheme._();

  /// Web radii: 14px cards (--radius), 12px buttons & inputs.
  static const cardRadius = 14.0;
  static const controlRadius = 12.0;

  static ThemeData get light {
    final scheme = ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      primary: AppColors.primary,
      secondary: AppColors.brandRed,
      surface: AppColors.surface,
      error: AppColors.danger,
    );
    final base = ThemeData(useMaterial3: true, colorScheme: scheme);

    // Web typography: Inter for body (--font-sans),
    // Plus Jakarta Sans for display headings (--font-display).
    final body = GoogleFonts.interTextTheme(base.textTheme)
        .apply(bodyColor: AppColors.ink, displayColor: AppColors.ink);
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
        foregroundColor: AppColors.ink,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        centerTitle: false,
        titleTextStyle: GoogleFonts.plusJakartaSans(
          color: AppColors.ink,
          fontSize: 18,
          fontWeight: FontWeight.w700,
        ),
      ),
      cardTheme: CardThemeData(
        color: AppColors.surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(cardRadius),
          side: const BorderSide(color: AppColors.border),
        ),
        margin: EdgeInsets.zero,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          elevation: 4,
          shadowColor: AppColors.accentGlow,
          textStyle: GoogleFonts.inter(
              fontSize: 15, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(controlRadius),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primary,
          side: const BorderSide(color: AppColors.primary, width: 1.5),
          minimumSize: const Size.fromHeight(48),
          textStyle: GoogleFonts.inter(
              fontSize: 14, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(controlRadius),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: AppColors.primary,
          textStyle: GoogleFonts.inter(
              fontSize: 14, fontWeight: FontWeight.w600),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surface,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          borderSide: const BorderSide(color: AppColors.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(controlRadius),
          borderSide: const BorderSide(color: AppColors.primary, width: 1.6),
        ),
        hintStyle: GoogleFonts.inter(color: AppColors.muted),
        labelStyle: GoogleFonts.inter(color: AppColors.muted),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: AppColors.primaryLight,
        side: BorderSide.none,
        labelStyle: GoogleFonts.inter(
          color: AppColors.primary,
          fontWeight: FontWeight.w600,
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surface,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.muted,
        type: BottomNavigationBarType.fixed,
      ),
      dividerTheme: const DividerThemeData(color: AppColors.border, space: 1),
      snackBarTheme:
          const SnackBarThemeData(behavior: SnackBarBehavior.floating),
    );
  }
}
