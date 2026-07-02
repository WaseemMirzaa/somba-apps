import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// AppBar with a circular back button, used across secondary screens.
PreferredSizeWidget backAppBar(BuildContext context, String title, {List<Widget>? actions}) {
  return AppBar(
    titleSpacing: 4,
    leading: Padding(
      padding: const EdgeInsets.all(8),
      child: _RoundBtn(icon: Icons.arrow_back_rounded, onTap: () => Navigator.of(context).maybePop()),
    ),
    title: Text(title),
    actions: actions,
  );
}

class _RoundBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _RoundBtn({required this.icon, required this.onTap});
  @override
  Widget build(BuildContext context) => Material(
        color: AppColors.surface,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(padding: const EdgeInsets.all(8), child: Icon(icon, size: 20, color: AppColors.ink)),
        ),
      );
}

/// A labelled, rounded text field.
class AppField extends StatelessWidget {
  final String label;
  final String hint;
  final IconData? icon;
  final bool obscure;
  final TextInputType? keyboard;
  final Widget? trailing;
  final String? initial;
  const AppField({
    super.key,
    required this.label,
    this.hint = '',
    this.icon,
    this.obscure = false,
    this.keyboard,
    this.trailing,
    this.initial,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: AppColors.inkSoft)),
        const SizedBox(height: 6),
        TextField(
          controller: initial != null ? TextEditingController(text: initial) : null,
          obscureText: obscure,
          keyboardType: keyboard,
          decoration: InputDecoration(
            hintText: hint,
            prefixIcon: icon != null ? Icon(icon, size: 20) : null,
            suffixIcon: trailing,
          ),
        ),
      ],
    );
  }
}

/// Camera + gallery attach buttons for a chat composer.
class ChatAttachButtons extends StatelessWidget {
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  const ChatAttachButtons({super.key, required this.onCamera, required this.onGallery});
  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        _round(Icons.photo_camera_rounded, onCamera),
        const SizedBox(width: 2),
        _round(Icons.photo_library_rounded, onGallery),
      ]);
  Widget _round(IconData icon, VoidCallback onTap) => Material(
        color: Colors.transparent,
        shape: const CircleBorder(),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: onTap,
          child: Padding(padding: const EdgeInsets.all(7), child: Icon(icon, color: AppColors.primary, size: 23)),
        ),
      );
}

/// A chat bubble showing an attached image placeholder (mock).
class ChatImageBubble extends StatelessWidget {
  final bool mine;
  final String? caption;
  const ChatImageBubble({super.key, required this.mine, this.caption});
  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            height: 132, width: 172,
            decoration: BoxDecoration(gradient: AppColors.brandGradient, borderRadius: BorderRadius.circular(12)),
            child: const Icon(Icons.image_rounded, color: Colors.white, size: 42),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 4, left: 2),
            child: Text(caption ?? 'Photo',
                style: TextStyle(color: mine ? Colors.white70 : AppColors.muted, fontSize: 11)),
          ),
        ],
      );
}

/// Full-width primary button.
class PrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  const PrimaryButton(this.label, {super.key, this.onPressed, this.icon});
  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: onPressed ?? () {},
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[Icon(icon, size: 20), const SizedBox(width: 8)],
            Text(label),
          ],
        ),
      ),
    );
  }
}

/// Rounded white card.
class Panel extends StatelessWidget {
  final Widget child;
  final EdgeInsets padding;
  const Panel({super.key, required this.child, this.padding = const EdgeInsets.all(16)});
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: padding,
        decoration: BoxDecoration(color: AppColors.surface, borderRadius: BorderRadius.circular(20), boxShadow: AppShadow.card),
        child: child,
      );
}

/// A vertical status timeline (used for tracking / returns).
class StatusTimeline extends StatelessWidget {
  final List<(String, String, bool)> steps; // title, subtitle, done
  const StatusTimeline(this.steps, {super.key});
  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(steps.length, (i) {
        final (title, sub, done) = steps[i];
        final last = i == steps.length - 1;
        final active = done || (i > 0 && steps[i - 1].$3 && !done);
        return IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Column(
                children: [
                  Container(
                    height: 26,
                    width: 26,
                    decoration: BoxDecoration(
                      color: done ? AppColors.primary : AppColors.surface,
                      shape: BoxShape.circle,
                      border: Border.all(color: done ? AppColors.primary : AppColors.line, width: 2),
                    ),
                    child: Icon(done ? Icons.check_rounded : Icons.circle,
                        size: done ? 15 : 8, color: done ? Colors.white : AppColors.faint),
                  ),
                  if (!last)
                    Expanded(child: Container(width: 2, color: done ? AppColors.primary : AppColors.line)),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Padding(
                  padding: EdgeInsets.only(bottom: last ? 0 : 22),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title,
                          style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 14.5,
                              color: active || done ? AppColors.ink : AppColors.muted)),
                      const SizedBox(height: 2),
                      Text(sub, style: const TextStyle(color: AppColors.muted, fontSize: 12.5)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        );
      }),
    );
  }
}
