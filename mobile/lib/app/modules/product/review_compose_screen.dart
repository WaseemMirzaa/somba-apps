import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';
import '../../widgets/common.dart';

class ReviewComposeScreen extends StatefulWidget {
  const ReviewComposeScreen({super.key});

  @override
  State<ReviewComposeScreen> createState() => _ReviewComposeScreenState();
}

class _ReviewComposeScreenState extends State<ReviewComposeScreen> {
  final _text = TextEditingController();
  double _rating = 5;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final product = Get.arguments as Product;
    return Scaffold(
      appBar: AppBar(title: Text('write_review'.tr)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: ListTile(
              leading: NetImage(
                seed: product.imageSeeds.first,
                width: 48,
                height: 48,
                radius: BorderRadius.circular(10),
              ),
              title: Text(product.name,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w600)),
            ),
          ),
          const SizedBox(height: 20),
          Text('your_rating'.tr,
              style: const TextStyle(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Row(
            children: List.generate(5, (i) {
              return IconButton(
                icon: Icon(
                  _rating > i
                      ? Icons.star_rounded
                      : Icons.star_outline_rounded,
                  color: AppColors.warning,
                  size: 36,
                ),
                onPressed: () => setState(() => _rating = i + 1.0),
              );
            }),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _text,
            maxLines: 5,
            decoration: InputDecoration(hintText: 'your_review'.tr),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () {
              Get.back();
              Get.snackbar('reviews'.tr, 'review_submitted'.tr,
                  snackPosition: SnackPosition.BOTTOM);
            },
            child: Text('submit'.tr),
          ),
        ],
      ),
    );
  }
}
