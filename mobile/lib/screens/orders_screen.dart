import 'package:flutter/material.dart';

class OrdersScreen extends StatelessWidget {
  final Locale locale;

  const OrdersScreen({super.key, required this.locale});

  @override
  Widget build(BuildContext context) {
    final fr = locale.languageCode == 'fr';
    const orders = [
      {'id': 'ORD-2024-001', 'status': 'delivered', 'amount': 1498},
      {'id': 'ORD-2024-003', 'status': 'shipped', 'amount': 349},
    ];

    return Scaffold(
      appBar: AppBar(title: Text(fr ? 'Mes commandes' : 'My Orders')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: orders.map((o) => Card(
          child: ListTile(
            title: Text(o['id'] as String),
            subtitle: Text('${o['status']} · \$${o['amount']}'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(fr ? 'Suivi ${o['id']} (mock)' : 'Tracking ${o['id']} (mock)')),
            ),
          ),
        )).toList(),
      ),
    );
  }
}
