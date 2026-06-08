import 'package:flutter/material.dart';

class OrderSuccessScreen extends StatelessWidget {
  final Locale locale;
  final String orderId;

  const OrderSuccessScreen({super.key, required this.locale, required this.orderId});

  @override
  Widget build(BuildContext context) {
    final fr = locale.languageCode == 'fr';
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle, color: Colors.green, size: 64),
            const SizedBox(height: 16),
            Text(fr ? 'Commande confirmée!' : 'Order Confirmed!', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
            Text(orderId),
            const SizedBox(height: 24),
            FilledButton(onPressed: () => Navigator.popUntil(context, (r) => r.isFirst), child: Text(fr ? 'Continuer' : 'Continue')),
          ],
        ),
      ),
    );
  }
}
