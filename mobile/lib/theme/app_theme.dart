import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Somba & Tekka design tokens.
///
/// These mirror the web app's CSS custom properties in
/// `web/src/app/globals.css` so the customer mobile app shares one visual
/// language with the web portals — Tekka red as the primary action colour,
/// a royal-blue brand accent, soft blue-grey surfaces and layered shadows.
class AppColors {
  AppColors._();

  // Surfaces & text
  static const background = Color(0xFFF5F7FC);
  static const foreground = Color(0xFF0B1020);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFF7F9FD);
  static const border = Color(0x140F172A); // rgba(15,23,42,.08)
  static const borderStrong = Color(0x1F0F172A); // rgba(15,23,42,.12)

  // Brand — Tekka red (primary actions)
  static const primary = Color(0xFFE11428);
  static const primaryHover = Color(0xFFC00E20);
  static const primaryDark = Color(0xFF8A0A18);
  static const primaryLight = Color(0xFFFFF1F2);
  static const primaryTint = Color(0xFFFCDDE0);

  // Brand — royal blue (logo tile / secondary accent)
  static const royal = Color(0xFF1A3AA8);
  static const royalDark = Color(0xFF0E1F5C);
  static const royalBright = Color(0xFF2A52CF);
  static const royalTint = Color(0xFFE6EAFB);

  // Status
  static const success = Color(0xFF059669);
  static const successLight = Color(0xFFECFDF5);
  static const warning = Color(0xFFD97706);
  static const warningLight = Color(0xFFFFFBEB);
  static const danger = Color(0xFFDC2626);

  // Amber — ratings & flash deals
  static const amber = Color(0xFFF59E0B);
  static const amberStar = Color(0xFFFBBF24);
  static const amberText = Color(0xFFB45309);
  static const amberLight = Color(0xFFFEF3C7);

  // Slate neutral scale (secondary text / icons)
  static const slate400 = Color(0xFF94A3B8);
  static const slate500 = Color(0xFF64748B);
  static const slate600 = Color(0xFF475569);
  static const slate700 = Color(0xFF334155);
  static const slate800 = Color(0xFF1E293B);
  static const slate900 = Color(0xFF0F172A);

  // Dark ink (snackbars, deep surfaces)
  static const ink = Color(0xFF0A1130);
}

/// Corner radii — cards 14, controls 12, full pills.
class AppRadius {
  AppRadius._();
  static const card = 14.0;
  static const control = 12.0;
  static const lg = 18.0;
  static const xl = 22.0;
  static const pill = 999.0;
}

/// Layered shadows that mirror `--shadow-sm/md/lg` from the web tokens.
class AppShadows {
  AppShadows._();

  static const List<BoxShadow> sm = [
    BoxShadow(color: Color(0x0A0F172A), blurRadius: 2, offset: Offset(0, 1)),
    BoxShadow(color: Color(0x0D0E1F5C), blurRadius: 8, offset: Offset(0, 2)),
  ];

  static const List<BoxShadow> md = [
    BoxShadow(color: Color(0x1F0E1F5C), blurRadius: 16, spreadRadius: -6, offset: Offset(0, 6)),
    BoxShadow(color: Color(0x1A0F172A), blurRadius: 32, spreadRadius: -10, offset: Offset(0, 14)),
  ];

  static const List<BoxShadow> lg = [
    BoxShadow(color: Color(0x420E1F5C), blurRadius: 50, spreadRadius: -18, offset: Offset(0, 26)),
  ];
}

/// Brand gradients used for hero bands and the logo tile.
class AppGradients {
  AppGradients._();

  /// Tekka-red → royal-blue band (matches web `.landing-band`).
  static const band = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.primaryDark, AppColors.primary, AppColors.royalBright],
    stops: [0.0, 0.55, 1.0],
  );

  /// Royal-blue logo tile gradient.
  static const royalTile = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [AppColors.royal, AppColors.royalDark],
  );

  /// Blue → red flourish used under section titles.
  static const flourish = LinearGradient(colors: [AppColors.royal, AppColors.primary]);
}

/// Builds the global [ThemeData] for the Somba customer app.
ThemeData buildAppTheme() {
  final colorScheme = ColorScheme.fromSeed(
    seedColor: AppColors.primary,
    brightness: Brightness.light,
  ).copyWith(
    primary: AppColors.primary,
    onPrimary: Colors.white,
    primaryContainer: AppColors.primaryLight,
    onPrimaryContainer: AppColors.primaryDark,
    secondary: AppColors.royal,
    onSecondary: Colors.white,
    secondaryContainer: AppColors.royalTint,
    onSecondaryContainer: AppColors.royalDark,
    surface: AppColors.surface,
    onSurface: AppColors.foreground,
    error: AppColors.danger,
    onError: Colors.white,
    outline: AppColors.borderStrong,
    outlineVariant: AppColors.border,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: AppColors.background,
    textTheme: _textTheme(),
    splashFactory: InkRipple.splashFactory,
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.foreground,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      shadowColor: AppColors.royalDark.withValues(alpha: 0.1),
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: GoogleFonts.plusJakartaSans(
        fontSize: 18,
        fontWeight: FontWeight.w700,
        color: AppColors.foreground,
        letterSpacing: -0.3,
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        disabledBackgroundColor: AppColors.primary.withValues(alpha: 0.4),
        disabledForegroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
        textStyle: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        elevation: 0,
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
        textStyle: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        backgroundColor: Colors.transparent,
        side: const BorderSide(color: AppColors.primary, width: 1.5),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
        textStyle: GoogleFonts.plusJakartaSans(fontSize: 15, fontWeight: FontWeight.w700),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: AppColors.primary,
        textStyle: GoogleFonts.plusJakartaSans(fontSize: 14, fontWeight: FontWeight.w700),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      shadowColor: AppColors.royalDark.withValues(alpha: 0.12),
      indicatorColor: AppColors.primaryLight,
      elevation: 3,
      height: 70,
      labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(
          size: 24,
          color: states.contains(WidgetState.selected) ? AppColors.primary : AppColors.slate500,
        ),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => GoogleFonts.inter(
          fontSize: 12,
          fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
          color: states.contains(WidgetState.selected) ? AppColors.primary : AppColors.slate500,
        ),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surfaceMuted,
      hintStyle: GoogleFonts.inter(color: AppColors.slate400, fontSize: 14),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      prefixIconColor: AppColors.slate400,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.control),
        borderSide: const BorderSide(color: AppColors.primary, width: 1.5),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.surfaceMuted,
      selectedColor: AppColors.primaryLight,
      checkmarkColor: AppColors.primary,
      side: const BorderSide(color: AppColors.border),
      labelStyle: GoogleFonts.inter(fontWeight: FontWeight.w600, color: AppColors.slate700),
      secondaryLabelStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, color: AppColors.primary),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.pill)),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
    ),
    dividerTheme: const DividerThemeData(color: AppColors.border, thickness: 1, space: 1),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.primary),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.ink,
      contentTextStyle: GoogleFonts.inter(color: Colors.white, fontWeight: FontWeight.w500),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.control)),
      insetPadding: const EdgeInsets.all(16),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: AppColors.surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadius.xl)),
      ),
    ),
  );
}

TextTheme _textTheme() {
  final inter = GoogleFonts.interTextTheme();

  TextStyle display(double size, FontWeight weight, {double? height, double? spacing}) {
    return GoogleFonts.plusJakartaSans(
      fontSize: size,
      fontWeight: weight,
      height: height,
      letterSpacing: spacing ?? -0.02 * size,
      color: AppColors.foreground,
    );
  }

  return inter
      .copyWith(
        displayLarge: display(40, FontWeight.w800, height: 1.05),
        displayMedium: display(32, FontWeight.w800, height: 1.08),
        displaySmall: display(28, FontWeight.w800, height: 1.12),
        headlineMedium: display(24, FontWeight.w800, height: 1.15),
        headlineSmall: display(20, FontWeight.w700, height: 1.2),
        titleLarge: display(18, FontWeight.w700, height: 1.25),
        titleMedium: display(16, FontWeight.w700, spacing: -0.2),
      )
      .apply(bodyColor: AppColors.foreground, displayColor: AppColors.foreground);
}
