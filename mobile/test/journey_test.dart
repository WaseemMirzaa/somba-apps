// The parcel's journey on the tracking screen: worked out from the order's status and lines, or from the legs the
// server sends; and the order / address payloads of before the warehouse routing still parse.
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/util/journey.dart';

Map<String, dynamic> _line(String fulfilment, {String? receivedAt, String seller = 's1'}) => {
      'productId': 'p-$seller',
      'productName': 'Item',
      'qty': 1,
      'priceUsd': 10,
      'sellerId': seller,
      'fulfilment': fulfilment,
      if (receivedAt != null) 'receivedAt': receivedAt,
    };

OrderDto _order(String status,
        {List<Map<String, dynamic>>? items, List<String> origins = const ['hub-a'], String? dest = 'hub-a', Object? tracking, String? updatedAt}) =>
    OrderDto.fromJson({
      'id': 'o1',
      'reference': 'SOM-1',
      'status': status,
      'paymentMethod': 'wallet',
      'totalUsd': 10,
      'items': items ?? [_line('received', receivedAt: '2026-10-24T10:00:00Z')],
      'destinationHubId': dest,
      'originHubIds': origins,
      if (tracking != null) 'tracking': tracking,
      if (updatedAt != null) 'updatedAt': updatedAt,
    });

Map<String, JourneyStep> _by(List<JourneyStep> steps) => {for (final s in steps) s.key: s};

void main() {
  group('journey without legs (worked out from the order)', () {
    test('no journey before the pickup starts, nor for cancelled and returned orders', () {
      for (final st in ['pending', 'confirmed', 'cancelled', 'returned']) {
        expect(orderJourney(_order(st)), isEmpty, reason: st);
      }
    });

    test('same warehouse: no transfer step; five steps', () {
      final steps = orderJourney(_order('shipped'));
      expect(steps.map((s) => s.key), ['picked_up', 'at_origin', 'at_destination', 'out_for_delivery', 'delivered']);
      final m = _by(steps);
      expect(m['picked_up']!.done, isTrue);
      expect(m['at_origin']!.done, isTrue);
      expect(m['at_origin']!.at, isNotNull, reason: 'the scan-in time of the lines');
      expect(m['at_destination']!.done, isTrue, reason: 'origin = destination: at your warehouse as soon as it is scanned in');
      expect(m['out_for_delivery']!.current, isTrue);
      expect(m['delivered']!.done, isFalse);
    });

    test('different warehouses: a transfer step, in progress while shipped', () {
      final steps = orderJourney(_order('shipped', origins: ['hub-a'], dest: 'hub-b'));
      expect(steps.map((s) => s.key), ['picked_up', 'at_origin', 'in_transfer', 'at_destination', 'out_for_delivery', 'delivered']);
      final m = _by(steps);
      expect(m['at_origin']!.done, isTrue);
      expect(m['at_origin']!.hubId, 'hub-a');
      expect(m['in_transfer']!.done, isFalse);
      expect(m['in_transfer']!.current, isTrue, reason: 'the first step not done is the current one');
      expect(m['in_transfer']!.hubId, 'hub-b', reason: 'names the warehouse it travels to');
      expect(m['at_destination']!.done, isFalse);
    });

    test('two sellers from two warehouses list both origins', () {
      final steps = orderJourney(_order('shipped', origins: ['hub-a', 'hub-c'], dest: 'hub-b'));
      expect(_by(steps)['picked_up']!.hubIds, ['hub-a', 'hub-c']);
      expect(_by(steps)['at_origin']!.hubId, isNull, reason: 'several warehouses: no single name');
    });

    test('processing with the seller still packing: the pickup is the current step', () {
      final steps = orderJourney(_order('processing', items: [_line('open')]));
      expect(steps.first.key, 'picked_up');
      expect(steps.first.done, isFalse);
      expect(steps.first.current, isTrue);
      expect(steps.where((s) => s.done), isEmpty);
    });

    test('one parcel at the warehouse and another not: not at the origin yet', () {
      final steps = orderJourney(_order('processing', items: [_line('received', receivedAt: '2026-10-24T10:00:00Z'), _line('ready', seller: 's2')]));
      expect(_by(steps)['at_origin']!.done, isFalse);
      expect(_by(steps)['picked_up']!.current, isTrue);
    });

    test('a cancelled line does not hold the journey back', () {
      final steps = orderJourney(_order('shipped', items: [_line('received', receivedAt: '2026-10-24T10:00:00Z'), _line('cancelled', seller: 's2')]));
      expect(_by(steps)['at_origin']!.done, isTrue);
    });

    test('out for delivery: everything before is done, the time is the order\'s last change', () {
      final m = _by(orderJourney(_order('out_for_delivery', origins: ['hub-a'], dest: 'hub-b', updatedAt: '2026-10-25T09:30:00Z')));
      for (final k in ['picked_up', 'at_origin', 'in_transfer', 'at_destination']) {
        expect(m[k]!.done, isTrue, reason: k);
      }
      expect(m['out_for_delivery']!.done, isTrue);
      expect(m['out_for_delivery']!.at, isNotNull);
      expect(m['delivered']!.done, isFalse);
      expect(m['delivered']!.current, isTrue);
    });

    test('delivered: all done, with the delivery time', () {
      final steps = orderJourney(_order('delivered', updatedAt: '2026-10-25T09:30:00Z'));
      expect(steps.every((s) => s.done), isTrue);
      expect(_by(steps)['delivered']!.at, isNotNull);
    });

    test('an order from before the routing (no warehouses) has no transfer step and still works', () {
      final steps = orderJourney(_order('shipped', origins: const [], dest: null));
      expect(steps.map((s) => s.key), isNot(contains('in_transfer')));
    });
  });

  group('journey with legs from the server (times)', () {
    test('each leg time lands on its step', () {
      final tracking = {
        'legs': [
          {'kind': 'pickup', 'status': 'delivered', 'pickedUpAt': '2026-10-24T08:00:00Z', 'receivedAt': '2026-10-24T09:00:00Z'},
          {'kind': 'transfer', 'status': 'delivered', 'pickedUpAt': '2026-10-24T11:00:00Z', 'receivedAt': '2026-10-24T13:00:00Z'},
          {'kind': 'delivery', 'status': 'in_transit', 'pickedUpAt': '2026-10-25T08:00:00Z'},
        ],
      };
      final m = _by(orderJourney(_order('out_for_delivery', origins: ['hub-a'], dest: 'hub-b', tracking: tracking)));
      expect(m['picked_up']!.at, DateTime.parse('2026-10-24T08:00:00Z').toLocal());
      expect(m['at_origin']!.at, DateTime.parse('2026-10-24T09:00:00Z').toLocal());
      expect(m['in_transfer']!.at, DateTime.parse('2026-10-24T11:00:00Z').toLocal());
      expect(m['at_destination']!.at, DateTime.parse('2026-10-24T13:00:00Z').toLocal());
      expect(m['out_for_delivery']!.at, DateTime.parse('2026-10-25T08:00:00Z').toLocal());
      expect(m['delivered']!.done, isFalse);
    });

    test('a transfer leg still on the road keeps the transfer step current', () {
      final tracking = {
        'legs': [
          {'kind': 'pickup', 'status': 'delivered', 'pickedUpAt': '2026-10-24T08:00:00Z', 'receivedAt': '2026-10-24T09:00:00Z'},
          {'kind': 'transfer', 'status': 'in_transit', 'pickedUpAt': '2026-10-24T11:00:00Z'},
        ],
      };
      final m = _by(orderJourney(_order('shipped', origins: ['hub-a'], dest: 'hub-b', tracking: tracking)));
      expect(m['at_origin']!.done, isTrue);
      expect(m['in_transfer']!.current, isTrue);
      expect(m['in_transfer']!.at, isNotNull);
      expect(m['at_destination']!.done, isFalse);
    });

    test('malformed tracking is ignored', () {
      expect(OrderLeg.listFrom('nope'), isEmpty);
      expect(OrderLeg.listFrom({'legs': 'x'}), isEmpty);
      expect(OrderLeg.listFrom({'legs': [1, 'a', null]}), isEmpty);
      expect(OrderLeg.listFrom({'legs': [{'kind': 'pickup'}]}).single.kind, 'pickup');
    });
  });

  group('payload compatibility', () {
    test('an order from before the warehouse routing parses with no hubs and no legs', () {
      final o = OrderDto.fromJson({'id': 'o', 'reference': 'SOM-9', 'status': 'delivered', 'paymentMethod': 'cod', 'totalUsd': 5, 'zoneId': 'gombe'});
      expect(o.destinationHubId, isNull);
      expect(o.originHubIds, isEmpty);
      expect(o.legs, isEmpty);
    });

    test('the new order fields parse', () {
      final o = _order('shipped', origins: ['a', 'b'], dest: 'c');
      expect(o.destinationHubId, 'c');
      expect(o.originHubIds, ['a', 'b']);
    });

    test('an address from an old server keeps working: the zone id is ignored', () {
      final a = AddressDto.fromJson({'id': 'a1', 'label': 'Home', 'line1': '1 Rue', 'city': 'Kinshasa', 'zoneId': 'gombe'});
      expect(a.hasPin, isFalse);
      final pinned = AddressDto.fromJson({
        'id': 'a2',
        'label': 'Home',
        'line1': '1 Rue',
        'city': 'Kinshasa',
        'geo': {'lat': -4.3, 'lng': 15.3}
      });
      expect(pinned.hasPin, isTrue);
    });
  });
}
