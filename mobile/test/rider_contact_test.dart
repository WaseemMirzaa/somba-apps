// "Call the rider": the order carries the rider's name and phone only while the server says so.
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/l10n/messages.dart';
import 'package:lipcart/services/models.dart';

Map<String, dynamic> _order({Object? rider}) => {
      'id': 'o1',
      'reference': 'SOM-1',
      'status': 'out_for_delivery',
      if (rider != null) 'rider': rider,
    };

void main() {
  test('the order parses the rider contact', () {
    final o = OrderDto.fromJson(_order(rider: {'name': ' Jean Kabongo ', 'phone': '+243 900-100-002'}));
    expect(o.rider?.name, 'Jean Kabongo');
    expect(o.rider?.phone, '+243 900-100-002');
    expect(o.rider?.dialNumber, '+243900100002');
  });

  test('no rider field means no contact (other statuses, other users)', () {
    expect(OrderDto.fromJson(_order()).rider, isNull);
    expect(OrderDto.fromJson(_order(rider: 'x')).rider, isNull);
    expect(OrderDto.fromJson(_order(rider: {'phone': '+243900100002'})).rider, isNull);
  });

  test('a rider without a phone has nothing to dial', () {
    final o = OrderDto.fromJson(_order(rider: {'name': 'Jean', 'phone': null}));
    expect(o.rider?.phone, isNull);
    expect(o.rider?.dialNumber, '');
  });

  test('the call button text exists in both languages and differs', () {
    final v = kMessages['track_call_rider']!;
    expect(v.$1, contains('{name}'));
    expect(v.$2, contains('{name}'));
    expect(v.$1, isNot(v.$2));
  });
}
