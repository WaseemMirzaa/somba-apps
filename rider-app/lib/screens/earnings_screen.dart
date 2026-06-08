import 'package:flutter/material.dart';

class EarningsScreen extends StatelessWidget {
  final Locale locale;
  const EarningsScreen({super.key, required this.locale});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          color: Colors.green.shade600,
          child: const Padding(
            padding: EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Today\'s Earnings', style: TextStyle(color: Colors.white70)),
                Text('\$84.00', style: TextStyle(color: Colors.white, fontSize: 36, fontWeight: FontWeight.bold)),
                Text('12 deliveries · COD collected \$420', style: TextStyle(color: Colors.white70)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        const Text('Shift History', style: TextStyle(fontWeight: FontWeight.bold)),
        ...['Today', 'Yesterday', 'Jun 6'].map((d) => Card(
          child: ListTile(
            title: Text(d),
            subtitle: const Text('10-14 trips'),
            trailing: const Text('\$72', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
          ),
        )),
      ],
    );
  }
}
