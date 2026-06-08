import 'package:flutter/material.dart';

class MapScreen extends StatelessWidget {
  final Locale locale;
  const MapScreen({super.key, required this.locale});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [Colors.blue.shade100, Colors.green.shade50],
            ),
          ),
          child: const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.map, size: 80, color: Colors.blue),
                SizedBox(height: 16),
                Text('Mock Google Maps Navigation'),
                Text('Route optimized · 3 stops · 12.4 km', style: TextStyle(color: Colors.grey)),
              ],
            ),
          ),
        ),
        Positioned(
          bottom: 24,
          left: 16,
          right: 16,
          child: Card(
            child: ListTile(
              leading: const Icon(Icons.location_on, color: Colors.red),
              title: const Text('Next stop: Marie Dubois'),
              subtitle: const Text('8 Rue de la Paix · ETA 14 min'),
              trailing: FilledButton(child: Text('Start'), onPressed: null),
            ),
          ),
        ),
      ],
    );
  }
}
