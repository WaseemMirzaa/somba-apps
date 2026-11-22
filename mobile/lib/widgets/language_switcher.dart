import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Where the switcher sits: on a plain surface (Account) or on the red brand header (Home).
enum LanguageSwitcherTone { surface, onBrand }

/// The one EN | FR capsule: a segmented pill whose selected side is filled. It is the same widget on Home and on
/// Account, so the two cannot drift apart. [onChanged] receives the new locale; tapping the language already in use
/// does nothing. Labels are the language codes, which read the same in both languages.
class LanguageSwitcher extends StatelessWidget {
  final Locale locale;
  final ValueChanged<Locale> onChanged;
  final LanguageSwitcherTone tone;
  const LanguageSwitcher({super.key, required this.locale, required this.onChanged, this.tone = LanguageSwitcherTone.surface});

  static const _codes = ['en', 'fr'];
  static const _names = {'en': 'English', 'fr': 'Français'};
  // Touch target: at least 44 tall (the pill is 36 plus the 4 of padding above and below it).
  static const double _segHeight = 36;
  static const double _segMinWidth = 46;

  @override
  Widget build(BuildContext context) {
    final onBrand = tone == LanguageSwitcherTone.onBrand;
    final track = onBrand ? Colors.white.withValues(alpha: 0.18) : AppColors.surface;
    final border = onBrand ? Colors.white.withValues(alpha: 0.35) : AppColors.line;
    return Semantics(
      container: true,
      label: 'Language',
      child: Container(
        padding: const EdgeInsets.all(AppSpace.xs),
        decoration: BoxDecoration(color: track, borderRadius: AppRadius.pill, border: Border.all(color: border)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          for (final code in _codes) _segment(code, selected: locale.languageCode == code, onBrand: onBrand),
        ]),
      ),
    );
  }

  Widget _segment(String code, {required bool selected, required bool onBrand}) {
    final fill = selected ? (onBrand ? Colors.white : AppColors.primary) : Colors.transparent;
    final text = selected ? (onBrand ? AppColors.primary : Colors.white) : (onBrand ? Colors.white : AppColors.inkSoft);
    return Semantics(
      button: true,
      selected: selected,
      label: _names[code],
      excludeSemantics: true,
      child: Material(
        color: fill,
        shape: const StadiumBorder(),
        child: InkWell(
          key: ValueKey('lang-switch-$code'),
          customBorder: const StadiumBorder(),
          onTap: selected ? null : () => onChanged(Locale(code)),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: _segHeight, minWidth: _segMinWidth),
            child: Center(
              child: Text(code.toUpperCase(), style: TextStyle(color: text, fontWeight: FontWeight.w800, fontSize: 13, letterSpacing: 0.4)),
            ),
          ),
        ),
      ),
    );
  }
}

/// A small tricolour badge (blue, white, red) for the language row: a flag-style mark drawn from the palette, with no
/// image and no emoji. Its label is read as "French / English" because the row it sits on offers both.
class LanguageBadge extends StatelessWidget {
  final double width;
  final double height;
  const LanguageBadge({super.key, this.width = 24, this.height = 17});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Français / English',
      image: true,
      child: Container(
        width: width,
        height: height,
        decoration: BoxDecoration(borderRadius: BorderRadius.circular(4), border: Border.all(color: AppColors.line)),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: const Row(children: [
            Expanded(child: ColoredBox(color: AppColors.royalBlue, child: SizedBox.expand())),
            Expanded(child: ColoredBox(color: AppColors.surface, child: SizedBox.expand())),
            Expanded(child: ColoredBox(color: AppColors.primary, child: SizedBox.expand())),
          ]),
        ),
      ),
    );
  }
}
