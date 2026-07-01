import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Small rounded pill/badge.
class Pill extends StatelessWidget {
  final String text;
  final Color color;
  final Color textColor;
  final IconData? icon;
  final double fontSize;
  const Pill(this.text,
      {super.key,
      this.color = AppColors.primary,
      this.textColor = Colors.white,
      this.icon,
      this.fontSize = 11.5});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(100)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[Icon(icon, size: fontSize + 2, color: textColor), const SizedBox(width: 4)],
          Text(text, style: TextStyle(color: textColor, fontSize: fontSize, fontWeight: FontWeight.w700, letterSpacing: 0.1)),
        ],
      ),
    );
  }
}

/// Circular icon button (app-bar / cards).
class CircleIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final Color background;
  final Color color;
  const CircleIconButton({super.key, required this.icon, this.onTap, this.background = AppColors.surface, this.color = AppColors.ink});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(padding: const EdgeInsets.all(9), child: Icon(icon, size: 21, color: color)),
      ),
    );
  }
}

/// Section header with optional trailing action.
class SectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  final EdgeInsets padding;
  const SectionHeader(this.title, {super.key, this.actionLabel, this.onAction, this.padding = const EdgeInsets.fromLTRB(20, 20, 12, 10)});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding,
      child: Row(children: [
        Expanded(child: Text(title, style: Theme.of(context).textTheme.titleLarge)),
        if (actionLabel != null)
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(foregroundColor: AppColors.primary, textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13.5)),
            child: Text(actionLabel!),
          ),
      ]),
    );
  }
}

/// AppBar with a circular back button.
PreferredSizeWidget backAppBar(BuildContext context, String title, {List<Widget>? actions}) {
  return AppBar(
    titleSpacing: 4,
    leading: Padding(
      padding: const EdgeInsets.all(8),
      child: CircleIconButton(icon: Icons.arrow_back_rounded, onTap: () => Navigator.of(context).maybePop()),
    ),
    title: Text(title),
    actions: actions,
  );
}

/// Full-width primary button.
class PrimaryButton extends StatelessWidget {
  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  const PrimaryButton(this.label, {super.key, this.icon, this.onPressed});
  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: onPressed ?? () {},
          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
            Text(label),
          ]),
        ),
      );
}

/// Rounded white card container.
class SurfaceCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  final VoidCallback? onTap;
  const SurfaceCard({super.key, required this.child, this.padding = const EdgeInsets.all(16), this.onTap});

  @override
  Widget build(BuildContext context) {
    final content = Container(
      padding: padding,
      decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
      child: child,
    );
    if (onTap == null) return content;
    return Material(
      color: Colors.transparent,
      child: InkWell(borderRadius: BorderRadius.circular(20), onTap: onTap, child: content),
    );
  }
}
