import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class RiderTask {
  final String id;
  final String type; // delivery | pickup | return
  final String customer;
  final String address;
  final double? codAmount;
  final bool openBox;
  final double distanceKm;
  final int etaMin;
  final int items;

  const RiderTask({
    required this.id,
    required this.type,
    required this.customer,
    required this.address,
    this.codAmount,
    this.openBox = false,
    this.distanceKm = 2.0,
    this.etaMin = 10,
    this.items = 1,
  });

  Color get color {
    switch (type) {
      case 'pickup':
        return AppColors.violet;
      case 'return':
        return AppColors.danger;
      default:
        return AppColors.primary;
    }
  }

  IconData get icon {
    switch (type) {
      case 'pickup':
        return Icons.inventory_2_rounded;
      case 'return':
        return Icons.keyboard_return_rounded;
      default:
        return Icons.local_shipping_rounded;
    }
  }

  String get typeLabel => type[0].toUpperCase() + type.substring(1);
}

const mockTasks = [
  RiderTask(id: 'TSK-8841', type: 'delivery', customer: 'Marie Dubois', address: '8 Rue de la Paix, Paris 2e', codAmount: 149.90, openBox: true, distanceKm: 1.2, etaMin: 8, items: 2),
  RiderTask(id: 'TSK-8842', type: 'pickup', customer: 'Somba&Teka Warehouse', address: 'Zone Industrielle, Lyon', distanceKm: 3.6, etaMin: 15, items: 6),
  RiderTask(id: 'TSK-8839', type: 'delivery', customer: 'Jean Petit', address: '45 Champs-Élysées, Paris 8e', openBox: true, distanceKm: 2.4, etaMin: 12, items: 1),
  RiderTask(id: 'TSK-8835', type: 'return', customer: 'Sophie Laurent', address: 'Neuilly-sur-Seine', distanceKm: 5.1, etaMin: 22, items: 1),
];
