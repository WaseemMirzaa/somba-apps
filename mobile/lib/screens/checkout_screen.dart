import 'package:flutter/material.dart';
import '../data/shop_state.dart';
import '../l10n/strings.dart';
import 'order_success_screen.dart';

class CheckoutScreen extends StatefulWidget {
  final Locale locale;

  const CheckoutScreen({super.key, required this.locale});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final shop = ShopState.instance;
  String payment = 'cod';

  @override
  Widget build(BuildContext context) {
    final fr = widget.locale.languageCode == 'fr';
    final total = shop.subtotal + 5;

    return Scaffold(
      appBar: AppBar(title: Text(fr ? 'Caisse' : 'Checkout')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(fr ? 'Adresse: Kinshasa, Gombe' : 'Address: Kinshasa, Gombe'),
            const SizedBox(height: 8),
            Text('${fr ? "Frais zone" : "Zone fee"}: \$5'),
            const SizedBox(height: 16),
            ...['stripe_card', 'cod', 'airtel_money', 'wallet'].map((m) => RadioListTile(
                  title: Text(m),
                  value: m,
                  groupValue: payment,
                  onChanged: (v) => setState(() => payment = v!),
                )),
            const Spacer(),
            Text('${fr ? "Total" : "Total"}: \$${total.toStringAsFixed(0)}', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => OrderSuccessScreen(locale: widget.locale, orderId: 'ORD-2024-001'))),
              child: Text(payment == 'cod' ? (fr ? 'Confirmer COD' : 'Confirm COD') : (fr ? 'Payer' : 'Pay')),
            ),
          ],
        ),
      ),
    );
  }
}
