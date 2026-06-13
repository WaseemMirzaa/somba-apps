import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../models/app_notification.dart';
import '../models/batch.dart';
import '../models/parcel.dart';
import '../models/rider.dart';
import '../models/rider_task.dart';
import '../models/warehouse.dart';

/// Seeded mock data for the Somba&Teka rider app (no backend).
class MockData {
  MockData._();

  // --- Rider --------------------------------------------------------------

  static const Rider rider = Rider(
    id: 'RID-204',
    name: 'Patrice Mukendi',
    phone: '+243 812 345 678',
    city: 'Kinshasa',
    vehicle: 'Motorcycle',
    rating: 4.8,
    kycStatus: 'approved',
  );

  // --- Geography (Kinshasa) -----------------------------------------------

  static const LatLng riderPosition = LatLng(-4.3245, 15.3010);

  static const Warehouse warehouse = Warehouse(
    id: 'WH-KIN-01',
    name: 'Entrepôt Central Kinshasa',
    position: LatLng(-4.3179, 15.3136),
  );

  static const LatLng gombe = LatLng(-4.303, 15.298);
  static const LatLng limete = LatLng(-4.345, 15.350);
  static const LatLng masina = LatLng(-4.385, 15.405);
  static const LatLng lemba = LatLng(-4.388, 15.330);
  static const LatLng ngaliema = LatLng(-4.352, 15.252);
  static const LatLng kintambo = LatLng(-4.328, 15.273);

  // --- Active pickup tasks ------------------------------------------------

  static List<RiderTask> buildPickupTasks() => [
        RiderTask(
          id: 'TSK-8841',
          type: TaskType.pickup,
          status: TaskStatus.assigned,
          partyName: 'Boutique Mama Ntumba',
          addressText: '12, Avenue du Commerce',
          commune: 'Gombe',
          position: gombe,
          distanceKm: 3.2,
          parcels: [
            Parcel(
              id: 'PKG-001',
              barcode: 'SOMBA-001-8841',
              orderId: 'ORD-2026-0117',
              description: 'Pagne wax 6 yards',
            ),
            Parcel(
              id: 'PKG-002',
              barcode: 'SOMBA-002-8841',
              orderId: 'ORD-2026-0118',
              description: 'Sac à main en cuir',
            ),
          ],
        ),
        RiderTask(
          id: 'TSK-8842',
          type: TaskType.pickup,
          status: TaskStatus.assigned,
          partyName: 'Kin Électronique',
          addressText: '45, Avenue Kikwit',
          commune: 'Limete',
          position: limete,
          distanceKm: 6.5,
          parcels: [
            Parcel(
              id: 'PKG-003',
              barcode: 'SOMBA-003-8842',
              orderId: 'ORD-2026-0121',
              description: 'Casque Bluetooth',
            ),
          ],
        ),
        RiderTask(
          id: 'TSK-8843',
          type: TaskType.pickup,
          status: TaskStatus.assigned,
          partyName: 'Atelier Mode Lemba',
          addressText: '8, Avenue de l\'Université',
          commune: 'Lemba',
          position: lemba,
          distanceKm: 9.8,
          parcels: [
            Parcel(
              id: 'PKG-004',
              barcode: 'SOMBA-004-8843',
              orderId: 'ORD-2026-0125',
              description: 'Robe sur mesure',
            ),
            Parcel(
              id: 'PKG-005',
              barcode: 'SOMBA-005-8843',
              orderId: 'ORD-2026-0126',
              description: 'Chemise homme — lot de 2',
            ),
            Parcel(
              id: 'PKG-006',
              barcode: 'SOMBA-006-8843',
              orderId: 'ORD-2026-0127',
              description: 'Foulard en soie',
            ),
          ],
        ),
      ];

  // --- Active delivery batch ----------------------------------------------

  static Batch buildBatch() {
    final stops = [
      RiderTask(
        id: 'TSK-9101',
        type: TaskType.delivery,
        status: TaskStatus.assigned,
        partyName: 'Jean Kabasele',
        addressText: '22, Avenue Mont Fleury',
        commune: 'Ngaliema',
        position: ngaliema,
        distanceKm: 8.4,
        parcels: [
          Parcel(
            id: 'PKG-101',
            barcode: 'SOMBA-101-9101',
            orderId: 'ORD-2026-0098',
            description: 'Mixeur de cuisine',
          ),
        ],
      ),
      RiderTask(
        id: 'TSK-9102',
        type: TaskType.delivery,
        status: TaskStatus.assigned,
        partyName: 'Marie Tshilombo',
        addressText: '5, Avenue Lubudi',
        commune: 'Kintambo',
        position: kintambo,
        distanceKm: 5.9,
        parcels: [
          Parcel(
            id: 'PKG-102',
            barcode: 'SOMBA-102-9102',
            orderId: 'ORD-2026-0102',
            description: 'Paire de baskets T39',
          ),
        ],
      ),
      RiderTask(
        id: 'TSK-9103',
        type: TaskType.delivery,
        status: TaskStatus.assigned,
        partyName: 'Didier Ilunga',
        addressText: '120, Boulevard du 30 Juin',
        commune: 'Gombe',
        position: LatLng(-4.305, 15.292),
        distanceKm: 3.1,
        parcels: [
          Parcel(
            id: 'PKG-103',
            barcode: 'SOMBA-103-9103',
            orderId: 'ORD-2026-0105',
            description: 'Montre connectée',
          ),
        ],
      ),
      RiderTask(
        id: 'TSK-9104',
        type: TaskType.delivery,
        status: TaskStatus.assigned,
        partyName: 'Sarah Mwamba',
        addressText: '17e Rue, Quartier Industriel',
        commune: 'Limete',
        position: limete,
        distanceKm: 6.7,
        parcels: [
          Parcel(
            id: 'PKG-104',
            barcode: 'SOMBA-104-9104',
            orderId: 'ORD-2026-0110',
            description: 'Lot de produits cosmétiques',
          ),
        ],
      ),
    ];
    return Batch(
      id: 'BATCH-014',
      zone: 'Ngaliema — Kintambo — Gombe — Limete',
      status: BatchStatus.assigned,
      orderedStops: stops,
      plannedRoute: [
        warehouse.position,
        ...stops.map((s) => s.position),
      ],
    );
  }

  // --- History (last 3 days) ----------------------------------------------

  static List<RiderTask> buildHistory() {
    final now = DateTime.now();
    DateTime daysAgo(int d, int hour, int minute) {
      final day = now.subtract(Duration(days: d));
      return DateTime(day.year, day.month, day.day, hour, minute);
    }

    RiderTask done({
      required String id,
      required TaskType type,
      required String party,
      required String address,
      required String commune,
      required LatLng position,
      required double km,
      required DateTime at,
      TaskStatus status = TaskStatus.completed,
      String? failReasonKey,
      int parcelCount = 1,
    }) {
      return RiderTask(
        id: id,
        type: type,
        status: status,
        partyName: party,
        addressText: address,
        commune: commune,
        position: position,
        distanceKm: km,
        parcels: List.generate(
          parcelCount,
          (i) => Parcel(
            id: 'PKG-H$id-$i',
            barcode: 'SOMBA-H$i-${id.substring(4)}',
            orderId: 'ORD-2026-H$i',
            description: 'Colis',
            scanned: status == TaskStatus.completed,
          ),
        ),
        completedAt: at,
        failReasonKey: failReasonKey,
      );
    }

    return [
      done(
        id: 'TSK-8790',
        type: TaskType.delivery,
        party: 'Gloria Kanku',
        address: '3, Avenue Kasaï',
        commune: 'Gombe',
        position: gombe,
        km: 2.8,
        at: daysAgo(0, 9, 40),
      ),
      done(
        id: 'TSK-8788',
        type: TaskType.pickup,
        party: 'Marché Mode Kintambo',
        address: '9, Avenue Nguma',
        commune: 'Kintambo',
        position: kintambo,
        km: 4.1,
        at: daysAgo(0, 8, 15),
        parcelCount: 2,
      ),
      done(
        id: 'TSK-8754',
        type: TaskType.delivery,
        party: 'Patient Ngandu',
        address: '14, Avenue de la Paix',
        commune: 'Masina',
        position: masina,
        km: 13.6,
        at: daysAgo(1, 16, 50),
      ),
      done(
        id: 'TSK-8751',
        type: TaskType.delivery,
        party: 'Annie Mbuyi',
        address: '27, Avenue Kimbangu',
        commune: 'Lemba',
        position: lemba,
        km: 10.2,
        at: daysAgo(1, 15, 5),
        status: TaskStatus.failed,
        failReasonKey: 'fail_reason_absent',
      ),
      done(
        id: 'TSK-8747',
        type: TaskType.pickup,
        party: 'Librairie Mokili',
        address: '60, Avenue Colonel Ebeya',
        commune: 'Gombe',
        position: gombe,
        km: 3.0,
        at: daysAgo(1, 11, 30),
        parcelCount: 3,
      ),
      done(
        id: 'TSK-8712',
        type: TaskType.delivery,
        party: 'Christian Kalala',
        address: '8, Avenue Mfumu Lutunu',
        commune: 'Ngaliema',
        position: ngaliema,
        km: 8.9,
        at: daysAgo(2, 17, 20),
      ),
      done(
        id: 'TSK-8709',
        type: TaskType.pickup,
        party: 'Somba Phone House',
        address: '33, Avenue du Marché',
        commune: 'Limete',
        position: limete,
        km: 6.2,
        at: daysAgo(2, 13, 45),
        parcelCount: 2,
      ),
      done(
        id: 'TSK-8701',
        type: TaskType.delivery,
        party: 'Esther Kasongo',
        address: '11, Avenue Mateba',
        commune: 'Kintambo',
        position: kintambo,
        km: 5.4,
        at: daysAgo(2, 10, 10),
      ),
    ];
  }

  // --- Notifications --------------------------------------------------------

  static List<AppNotification> buildNotifications() {
    final now = DateTime.now();
    return [
      AppNotification(
        id: 'NTF-001',
        type: NotificationType.taskAssigned,
        titleKey: 'notif_task_assigned_title',
        bodyKey: 'notif_task_assigned_body',
        params: const {'id': 'TSK-8841', 'commune': 'Gombe'},
        time: now.subtract(const Duration(minutes: 25)),
      ),
      AppNotification(
        id: 'NTF-002',
        type: NotificationType.batchReady,
        titleKey: 'notif_batch_ready_title',
        bodyKey: 'notif_batch_ready_body',
        params: const {'id': 'BATCH-014', 'count': '4'},
        time: now.subtract(const Duration(hours: 1, minutes: 10)),
      ),
      AppNotification(
        id: 'NTF-003',
        type: NotificationType.taskAssigned,
        titleKey: 'notif_task_assigned_title',
        bodyKey: 'notif_task_assigned_body',
        params: const {'id': 'TSK-8843', 'commune': 'Lemba'},
        time: now.subtract(const Duration(hours: 3)),
      ),
      AppNotification(
        id: 'NTF-004',
        type: NotificationType.announcement,
        titleKey: 'notif_announce_hours_title',
        bodyKey: 'notif_announce_hours_body',
        time: now.subtract(const Duration(days: 1, hours: 2)),
        read: true,
      ),
      AppNotification(
        id: 'NTF-005',
        type: NotificationType.taskAssigned,
        titleKey: 'notif_task_assigned_title',
        bodyKey: 'notif_task_assigned_body',
        params: const {'id': 'TSK-8842', 'commune': 'Limete'},
        time: now.subtract(const Duration(days: 1, hours: 5)),
        read: true,
      ),
      AppNotification(
        id: 'NTF-006',
        type: NotificationType.announcement,
        titleKey: 'notif_announce_safety_title',
        bodyKey: 'notif_announce_safety_body',
        time: now.subtract(const Duration(days: 2, hours: 4)),
        read: true,
      ),
    ];
  }
}
