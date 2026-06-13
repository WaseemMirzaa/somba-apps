import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/services/session_service.dart';
import '../../core/theme/app_theme.dart';
import '../../routes/app_routes.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _slides = [
    (Icons.storefront, 'onb1_title', 'onb1_body'),
    (Icons.payments, 'onb2_title', 'onb2_body'),
    (Icons.local_shipping, 'onb3_title', 'onb3_body'),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = Get.find<SessionService>();
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Row(
                children: [
                  Text('choose_language'.tr,
                      style: const TextStyle(
                          fontWeight: FontWeight.w600, color: AppColors.muted)),
                  const Spacer(),
                  Obx(
                    () => SegmentedButton<String>(
                      segments: const [
                        ButtonSegment(value: 'fr', label: Text('FR')),
                        ButtonSegment(value: 'en', label: Text('EN')),
                      ],
                      selected: {session.languageCode.value},
                      onSelectionChanged: (sel) =>
                          session.setLanguage(sel.first),
                      showSelectedIcon: false,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _slides.length,
                onPageChanged: (i) => setState(() => _page = i),
                itemBuilder: (_, i) {
                  final (icon, title, body) = _slides[i];
                  return Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(40),
                          decoration: const BoxDecoration(
                            color: AppColors.primaryLight,
                            shape: BoxShape.circle,
                          ),
                          child:
                              Icon(icon, size: 80, color: AppColors.primary),
                        ),
                        const SizedBox(height: 40),
                        Text(
                          title.tr,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            color: AppColors.ink,
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          body.tr,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              fontSize: 15, color: AppColors.muted, height: 1.5),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(
                _slides.length,
                (i) => AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: _page == i ? 24 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color:
                        _page == i ? AppColors.primary : AppColors.border,
                    borderRadius: BorderRadius.circular(4),
                  ),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  FilledButton(
                    onPressed: () {
                      if (_page < _slides.length - 1) {
                        _controller.nextPage(
                          duration: const Duration(milliseconds: 250),
                          curve: Curves.easeOut,
                        );
                      } else {
                        Get.offAllNamed(AppRoutes.shell);
                      }
                    },
                    child: Text(_page < _slides.length - 1
                        ? 'continue'.tr
                        : 'get_started'.tr),
                  ),
                  TextButton(
                    onPressed: () => Get.offAllNamed(AppRoutes.shell),
                    child: Text('skip'.tr),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
