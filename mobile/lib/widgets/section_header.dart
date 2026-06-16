import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Section title with the signature blue→red flourish underline and an
/// optional trailing action (e.g. "See all").
///
/// Mirrors the web `.section-title` + `.title-flourish` treatment.
class SectionHeader extends StatelessWidget {
  final String title;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool flourish;

  const SectionHeader({
    super.key,
    required this.title,
    this.actionLabel,
    this.onAction,
    this.flourish = true,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleLarge),
              if (flourish) ...[
                const SizedBox(height: 7),
                Container(
                  width: 44,
                  height: 3.5,
                  decoration: BoxDecoration(
                    gradient: AppGradients.flourish,
                    borderRadius: BorderRadius.circular(AppRadius.pill),
                  ),
                ),
              ],
            ],
          ),
        ),
        if (actionLabel != null)
          TextButton(
            onPressed: onAction,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(actionLabel!),
                const Icon(Icons.chevron_right, size: 18, color: AppColors.primary),
              ],
            ),
          ),
      ],
    );
  }
}
