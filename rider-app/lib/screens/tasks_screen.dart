import 'package:flutter/material.dart';
import '../data/mock_tasks.dart';

class TasksScreen extends StatelessWidget {
  final Locale locale;
  const TasksScreen({super.key, required this.locale});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          color: Colors.green.shade50,
          child: const ListTile(
            leading: Icon(Icons.bike_scooter, color: Colors.green),
            title: Text('On Duty — Jean Mukendi'),
            subtitle: Text('Paris 2e · 3 active tasks'),
          ),
        ),
        const SizedBox(height: 12),
        ...mockTasks.map((t) => Card(
          margin: const EdgeInsets.only(bottom: 8),
          child: ListTile(
            leading: CircleAvatar(child: Text(t.type[0].toUpperCase())),
            title: Text(t.customer),
            subtitle: Text('${t.address}\nCOD: \$${t.codAmount ?? 0} · Open Box: ${t.openBox ? "Yes" : "No"}'),
            isThreeLine: true,
            trailing: const Icon(Icons.chevron_right),
            onTap: () => _showTaskDetail(context, t),
          ),
        )),
      ],
    );
  }

  void _showTaskDetail(BuildContext context, RiderTask t) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(t.id, style: Theme.of(context).textTheme.titleLarge),
            Text(t.customer),
            const SizedBox(height: 8),
            Text(t.address),
            if (t.codAmount != null) Text('Collect COD: \$${t.codAmount}', style: const TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            if (t.openBox) const Chip(label: Text('Open Box — verify before handover')),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () { Navigator.pop(ctx); ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Opening map (mock)'))); },
              icon: const Icon(Icons.navigation),
              label: const Text('Navigate (Mock Map)'),
            ),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () { Navigator.pop(ctx); ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('POD complete${t.codAmount != null ? " — COD \$${t.codAmount} collected" : ""}'))); },
              icon: const Icon(Icons.check_circle),
              label: const Text('Proof of Delivery'),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () { Navigator.pop(ctx); ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Failed delivery logged'))); },
              child: const Text('Failed Delivery'),
            ),
          ],
        ),
      ),
    );
  }
}
