import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class RiderTask {
  final String id;
  final String type; // delivery | pickup | zone | return
  final String customer;
  final String address;
  final bool openBox;
  final double distanceKm;
  final int etaMin;
  final int items;

  /// Number of parcels in the batch (deliveries and zone transfers can carry
  /// several parcels for one or many sellers).
  final int batch;

  /// Where the goods come from / go to — drives the "nature" banner.
  final String origin;
  final String destination;

  /// Distinct sellers represented in this batch (for mixed-seller batches).
  final int sellers;

  const RiderTask({
    required this.id,
    required this.type,
    required this.customer,
    required this.address,
    this.openBox = false,
    this.distanceKm = 2.0,
    this.etaMin = 10,
    this.items = 1,
    this.batch = 1,
    this.origin = 'Kinshasa warehouse',
    this.destination = 'Customer',
    this.sellers = 1,
  });

  Color get color {
    switch (type) {
      case 'pickup':
        return AppColors.violet;
      case 'zone':
        return AppColors.info;
      case 'return':
        return AppColors.danger;
      default:
        return AppColors.primary;
    }
  }

  IconData get icon {
    switch (type) {
      case 'pickup':
        return Icons.warehouse_rounded;
      case 'zone':
        return Icons.swap_horiz_rounded;
      case 'return':
        return Icons.keyboard_return_rounded;
      default:
        return Icons.local_shipping_rounded;
    }
  }

  String get typeLabel => type[0].toUpperCase() + type.substring(1);

  /// The task nature, made explicit for the rider.
  String get natureLabel {
    switch (type) {
      case 'pickup':
        return 'Pickup from warehouse';
      case 'zone':
        return 'Zone-to-zone transfer';
      case 'return':
        return 'Return to warehouse';
      default:
        return 'Delivery from warehouse';
    }
  }

  String get natureDetail {
    switch (type) {
      case 'pickup':
        return 'Collect $batch parcel${batch > 1 ? 's' : ''} at $origin';
      case 'zone':
        return '$origin  →  $destination · batch of $batch parcels';
      case 'return':
        return 'Return $items item${items > 1 ? 's' : ''} to $origin';
      default:
        final s = sellers > 1 ? ' · $sellers sellers' : '';
        return '$origin  →  $destination · $batch parcel${batch > 1 ? 's' : ''}$s';
    }
  }

  bool get isBatch => batch > 1;
}

const mockTasks = [
  RiderTask(id: 'TSK-8841', type: 'delivery', customer: 'Marie Dubois', address: '8 Rue de la Paix, Paris 2e', openBox: true, distanceKm: 1.2, etaMin: 8, items: 2, batch: 3, sellers: 2, destination: 'Gombe · Marie Dubois'),
  RiderTask(id: 'TSK-8842', type: 'pickup', customer: 'Somba&Teka Warehouse', address: 'Zone Industrielle, Lyon', distanceKm: 3.6, etaMin: 15, items: 6, batch: 6, origin: 'Kinshasa warehouse'),
  RiderTask(id: 'TSK-8843', type: 'zone', customer: 'Limete hub', address: 'Limete relay point, Kinshasa', distanceKm: 6.2, etaMin: 24, items: 12, batch: 12, origin: 'Gombe warehouse', destination: 'Limete hub'),
  RiderTask(id: 'TSK-8839', type: 'delivery', customer: 'Jean Petit', address: '45 Champs-Élysées, Paris 8e', openBox: true, distanceKm: 2.4, etaMin: 12, items: 1, batch: 1, destination: 'Gombe · Jean Petit'),
  RiderTask(id: 'TSK-8835', type: 'return', customer: 'Sophie Laurent', address: 'Neuilly-sur-Seine', distanceKm: 5.1, etaMin: 22, items: 1),
];
