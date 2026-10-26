// Layout matrix for the delivery-area screens: the address form with its pickers (filled from the pin, unserved,
// not matched, old address), the picker sheets, the address book badge, and the cart and checkout not-served notice.
// 360 / 402 pt, EN / FR, text scale 1.0 / 1.3.
import 'package:flutter/material.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/account_more.dart';
import 'package:lipcart/screens/more/area_picker.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/services/hub_directory.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/geo_models.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/format.dart';

import 'areas_helpers.dart';
import 'gap_helpers.dart';
import 'matrix_helpers.dart';

AddressDto _address(List<String>? ids, {String id = 'a1', bool? served, String commune = 'Gombe', String city = 'Kinshasa', bool isDefault = true}) => AddressDto.fromJson({
      'id': id,
      'label': 'Maison',
      'line1': '12, avenue du Commerce, près du marché central de la Gombe',
      'commune': commune,
      'city': city,
      'phone': '+243812345678',
      'isDefault': isDefault,
      'geo': {'lat': -4.31, 'lng': 15.31},
      if (ids != null) 'areaId': ids.last,
      if (ids != null) 'areaChain': chainOf(ids),
      if (served != null) 'served': served,
    });

const _gombe = ['p-kin', 'c-kin', 'd-luk', 'm-gombe'];

Map<String, dynamic> _leg(String kind, String status, {String? pickedUp, String? received, int? hop, int? hops, String? to}) => {
      'kind': kind,
      'status': status,
      if (pickedUp != null) 'pickedUpAt': pickedUp,
      if (received != null) 'receivedAt': received,
      if (hop != null) 'hop': hop,
      if (hops != null) 'hops': hops,
      if (to != null) 'toHubName': to,
    };

const _pickupLeg = {'kind': 'pickup', 'status': 'delivered', 'pickedUpAt': '2026-10-24T08:00:00Z', 'receivedAt': '2026-10-24T09:00:00Z'};

/// A shipped order relayed through two hops (Limete > Kinshasa > Kikwit), with the given legs.
OrderDto _relayed(String id, List<Map<String, dynamic>> legs, {Object? routes}) => OrderDto.fromJson({
      'id': id,
      'reference': 'SOM-2077',
      'status': 'shipped',
      'paymentMethod': 'wallet',
      'totalUsd': 134.5,
      'updatedAt': '2026-10-25T09:30:00Z',
      'createdAt': '2026-10-24T08:00:00Z',
      'destinationHubId': 'hub-kikwit',
      'originHubIds': ['hub-limete'],
      if (routes != null) 'routeBySeller': routes,
      'tracking': {'legs': legs},
      'items': [
        {'productId': 'p1', 'productName': 'Wireless earbuds', 'qty': 1, 'priceUsd': 129.5, 'sellerId': 's1', 'fulfilment': 'received', 'receivedAt': '2026-10-24T09:00:00Z'}
      ],
    });

Map<String, dynamic> _hopsQuote() => {
      ...gapQuoteJson(fee: 7, transfer: 2),
      'transitHours': 52,
      'origins': [
        {
          'sellerId': 's1',
          'hubId': 'hub-limete',
          'hops': [
            {'fromHubName': 'Entrepôt de Limete', 'toHubName': 'Entrepôt de Kinshasa – Gombe'},
            {'fromHubName': 'Entrepôt de Kinshasa – Gombe', 'toHubName': 'Entrepôt de Kikwit – Centre-ville'},
          ],
        },
      ],
    };
const _goma = ['p-nk', 'c-goma'];

/// The refusal of the final contract, with long names (the notice must wrap, never overflow).
ApiException _refusal() => ApiException.fromAck({
      'ok': false,
      'error': 'We don\'t deliver to Nord-Kivu yet.',
      'code': 'not_served',
      'areaId': 'p-nk',
      'areaName': 'Nord-Kivu',
      'areaNameEn': 'North Kivu',
      'servedCities': [
        {'id': 'c1', 'name': 'Kinshasa', 'nameEn': 'Kinshasa'},
        {'id': 'c2', 'name': 'Lubumbashi', 'nameEn': 'Lubumbashi'},
        {'id': 'c3', 'name': 'Mbuji-Mayi', 'nameEn': 'Mbuji-Mayi'},
        {'id': 'c4', 'name': 'Kolwezi', 'nameEn': 'Kolwezi'},
        {'id': 'c5', 'name': 'Kananga', 'nameEn': 'Kananga'},
        {'id': 'c6', 'name': 'Kisangani', 'nameEn': 'Kisangani'},
        {'id': 'c7', 'name': 'Bukavu', 'nameEn': 'Bukavu'},
      ],
    });

/// A quote whose covering warehouse has no rider, relayed over two lanes with a transit time and a cost on each hop.
Map<String, dynamic> _fallbackQuote() => {
      ...gapQuoteJson(fee: 9, transfer: 5, hub: 'Entrepôt de Kikwit – Centre-ville'),
      'fallback': 'nearest',
      'coveringHubName': 'Entrepôt de Limete – Mont-Amba',
      'transitHours': 52,
      'extraDays': 3,
      'interCity': true,
      'interCityDays': 3,
      'origins': [
        {
          'sellerId': 's1',
          'hubId': 'hub-kin',
          'hubName': 'Entrepôt de Kinshasa – Gombe',
          'areaName': 'Mont-Ngafula',
          'areaNameEn': 'Mont-Ngafula',
          'fallback': 'city',
          'coveringHubName': 'Entrepôt de Limete – Mont-Amba',
          'hops': [
            {'fromHubName': 'Entrepôt de Kinshasa – Gombe', 'toHubName': 'Entrepôt de Limete – Mont-Amba', 'transitHours': 4, 'costUsd': 3.5},
            {'fromHubName': 'Entrepôt de Limete – Mont-Amba', 'toHubName': 'Entrepôt de Kikwit – Centre-ville', 'transitHours': 48, 'costUsd': null},
          ],
        },
      ],
    };

/// A partly served province, as an address saved before the lower levels were chosen carries it.
AddressDto _partlyServedAddress() => AddressDto.fromJson({
      'id': 'a1',
      'label': 'Maison',
      'line1': '12, avenue du Commerce',
      'city': 'Lubumbashi',
      'areaId': 'p-hk',
      'areaChain': [area('p-hk', 'province', 'Haut-Katanga', nameEn: 'Upper Katanga', served: false, partiallyServed: true, childCount: 2)],
      'served': false,
    });

Future<void> _seed(String lang) async {
  await gapReset(lang: lang);
  resetGeo();
  marketNotifier.value = MarketProfileId.drc;
  final store = RealtimeStore.instance;
  store.user = gapUser(phone: '+243812345678');
  store.requirePinnedAddress = false;
  store.addresses.clear();
  store.debugCallRequest = areaCalls();
  store.orders
    ..clear()
    ..addAll([
      _relayed('o-hop1', [
        _pickupLeg,
        _leg('transfer', 'in_transit', pickedUp: '2026-10-24T11:00:00Z', hop: 1, hops: 2, to: 'Entrepôt de Kinshasa – Gombe'),
      ]),
      _relayed('o-relay', [
        _pickupLeg,
        _leg('transfer', 'delivered', pickedUp: '2026-10-24T11:00:00Z', received: '2026-10-24T15:00:00Z', hop: 1, hops: 2, to: 'Entrepôt de Kinshasa – Gombe'),
        _leg('transfer', 'in_transit', pickedUp: '2026-10-25T07:00:00Z', hop: 2, hops: 2, to: 'Entrepôt de Kikwit – Centre-ville'),
      ]),
      _relayed('o-planned', [_pickupLeg], routes: {
        's1': ['hub-limete', 'hub-kin', 'hub-kikwit']
      }),
      _relayed('o-run', [
        _pickupLeg,
        {..._leg('transfer', 'delivered', pickedUp: '2026-10-24T11:00:00Z', received: '2026-10-24T15:00:00Z', hop: 1, hops: 2, to: 'Entrepôt de Kinshasa – Gombe'), 'fromHubName': 'Entrepôt de Limete', 'runReference': 'TR-0042', 'riderFirstName': 'Jean-Pierre'},
        {..._leg('transfer', 'in_transit', pickedUp: '2026-10-25T07:00:00Z', hop: 2, hops: 2, to: 'Entrepôt de Kikwit – Centre-ville'), 'fromHubName': 'Entrepôt de Kinshasa – Gombe', 'runReference': 'TR-0050', 'riderFirstName': 'Marie-Antoinette'},
      ]),
    ]);
  HubDirectory.instance.debugSet(const [
    HubInfo(id: 'hub-limete', name: 'Entrepôt de Limete'),
    HubInfo(id: 'hub-kin', name: 'Entrepôt de Kinshasa – Gombe'),
    HubInfo(id: 'hub-kikwit', name: 'Entrepôt de Kikwit – Centre-ville'),
  ]);
  ShopState.instance.addToCart(productByUuid('p1')!, qty: 2);
}

void main() {
  registerLayoutMatrix(
    {
      'address form: areas filled in, with quartiers': (l) => AddressFormScreen(locale: l, existing: _address(_gombe, served: true)),
      'address form: area nobody serves': (l) => AddressFormScreen(locale: l, existing: _address(_goma, served: false, commune: '', city: 'Goma')),
      'address form: new, nothing chosen': (l) => AddressFormScreen(locale: l),
      'address form: address saved before areas (typed fields)': (l) => AddressFormScreen(locale: l, existing: _address(null)),
      'address form: old server (typed fields)': (l) {
        RealtimeStore.instance.debugCallRequest = gapCalls();
        return AddressFormScreen(locale: l);
      },
      'province sheet (long list, search, coming soon)': (l) => Scaffold(
          body: Align(
              alignment: Alignment.bottomCenter,
              child: AreaSheet(
                  level: AreaLevel.province,
                  selected: areaOf('p-kin'),
                  options: [for (final a in kGeo['']!) (area: AreaDto.fromJson(a), group: null)]))),
      'commune sheet (grouped by district)': (l) => Scaffold(
          body: Align(
              alignment: Alignment.bottomCenter,
              child: AreaSheet(level: AreaLevel.commune, selected: areaOf('m-gombe'), options: [
                for (final d in ['d-luk', 'd-mon'])
                  for (final a in kGeo[d]!) (area: AreaDto.fromJson(a), group: areaOf(d)),
              ]))),
      'address book: not-served badge and served addresses': (l) {
        RealtimeStore.instance.addresses.addAll([
          _address(_goma, id: 'a1', served: false, commune: '', city: 'Goma'),
          _address(_gombe, id: 'a2', served: true, isDefault: false),
          _address(null, id: 'a3', isDefault: false),
        ]);
        return AddressBookScreen(locale: l);
      },
      'checkout: not served': (l) {
        RealtimeStore.instance.addresses.add(_address(_goma, served: false, commune: '', city: 'Goma'));
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => throw ApiException('We don\'t deliver to Nord-Kivu yet.'));
        return CheckoutScreen(locale: l);
      },
      'tracking: two hops, first hop on the road': (l) => OrderTrackingScreen(locale: l, orderId: 'o-hop1'),
      'tracking: two hops, second hop on the road': (l) => OrderTrackingScreen(locale: l, orderId: 'o-relay'),
      'tracking: two hops, planned route only': (l) => OrderTrackingScreen(locale: l, orderId: 'o-planned'),
      'checkout: relayed route and transit time': (l) {
        RealtimeStore.instance.addresses.add(_address(null, city: 'Kikwit', commune: ''));
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => _hopsQuote());
        return CheckoutScreen(locale: l);
      },
      'checkout: not served, structured, with the cities we deliver in': (l) {
        RealtimeStore.instance.addresses.add(_address(_goma, served: false, commune: '', city: 'Goma'));
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => throw _refusal());
        return CheckoutScreen(locale: l);
      },
      'cart: not served, structured, with the cities we deliver in': (l) {
        RealtimeStore.instance.addresses.add(_address(_goma, served: false, commune: '', city: 'Goma'));
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => throw _refusal());
        return CartScreen(locale: l);
      },
      'checkout: warehouse without riders, hops with transit and cost, between cities': (l) {
        RealtimeStore.instance.addresses.add(_address(null, city: 'Kikwit', commune: ''));
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => _fallbackQuote());
        return CheckoutScreen(locale: l);
      },
      'tracking: transfer runs and drivers on two hops': (l) => OrderTrackingScreen(locale: l, orderId: 'o-run'),
      'address form: partly served province (hint, not a refusal)': (l) => AddressFormScreen(locale: l, existing: _partlyServedAddress()),
      'cart: not served': (l) {
        RealtimeStore.instance.addresses.add(_address(_goma, served: false, commune: '', city: 'Goma'));
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => throw ApiException('We don\'t deliver to Nord-Kivu yet.'));
        return CartScreen(locale: l);
      },
    },
    seed: _seed,
    tearDownFakes: () {
      resetGeo();
      HubDirectory.instance.debugSet(const []);
      RealtimeStore.instance.orders.clear();
      RealtimeStore.instance.requirePinnedAddress = false;
    },
  );
}
