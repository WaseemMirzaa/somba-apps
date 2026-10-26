// Layout matrix for the delivery-model screens: the cart and checkout with the server's delivery quote (no address,
// unpinned address, failed quote, store coupons, a transfer between warehouses), the tracking journey in several
// states, and the address form without its zone line. 360 / 402 pt, EN / FR, text scale 1.0 / 1.3.
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/order_screens.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/hub_directory.dart';
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/format.dart';

import 'gap_helpers.dart';
import 'matrix_helpers.dart';

ProductDto _product(String id, String seller, String store) => ProductDto.fromJson({
      'id': id,
      'name': 'Wireless earbuds with charging case $id',
      'nameFr': 'Écouteurs sans fil avec boîtier de recharge $id',
      'price': 129.5,
      'originalPrice': 159,
      'category': 'Electronics',
      'categoryFr': 'Électronique',
      'image': '',
      'stock': 12,
      'sellerId': seller,
      'sellerName': store,
      'deliveryDays': 3,
      'totalDeliveryDays': 5,
    });

AddressDto _address({bool pinned = true}) => AddressDto(
    id: 'a1',
    label: 'Maison',
    line1: '12, avenue du Commerce, près du marché central de la Gombe',
    city: 'Kinshasa',
    commune: 'Gombe',
    phone: '+243812345678',
    isDefault: true,
    geo: pinned ? (lat: -4.31, lng: 15.31, placeId: null, formatted: null) : null);

Map<String, dynamic> _line(String id, String seller, String store, String fulfilment, {String? receivedAt}) => {
      'productId': id,
      'productName': 'Wireless earbuds with charging case',
      'productNameFr': 'Écouteurs sans fil avec boîtier de recharge',
      'qty': 1,
      'priceUsd': 129.5,
      'sellerId': seller,
      'sellerName': store,
      'fulfilment': fulfilment,
      if (receivedAt != null) 'receivedAt': receivedAt,
    };

OrderDto _order(String id, String status, {List<String> origins = const ['hub-limete'], bool legs = false, bool open = false}) => OrderDto.fromJson({
      'id': id,
      'reference': 'SOM-2077',
      'status': status,
      'paymentMethod': 'wallet',
      'totalUsd': 134.5,
      'updatedAt': '2026-10-25T09:30:00Z',
      'createdAt': '2026-10-24T08:00:00Z',
      'destinationHubId': 'hub-kin',
      'originHubIds': origins,
      'shippingAddress': '{"label":"Maison","line1":"12, avenue du Commerce","city":"Kinshasa"}',
      if (status == 'out_for_delivery') 'rider': {'name': 'Jean-Pierre Mukendi', 'phone': '+243 810 000 000'},
      if (legs)
        'tracking': {
          'legs': [
            {'kind': 'pickup', 'status': 'delivered', 'pickedUpAt': '2026-10-24T09:00:00Z', 'receivedAt': '2026-10-24T10:30:00Z'},
            {'kind': 'transfer', 'status': 'delivered', 'pickedUpAt': '2026-10-24T14:00:00Z', 'receivedAt': '2026-10-24T16:45:00Z'},
            {'kind': 'delivery', 'status': 'in_transit', 'pickedUpAt': '2026-10-25T08:10:00Z'},
          ],
        },
      'items': [_line('p1', 's1', 'Kinshasa Traders', open ? 'open' : 'received', receivedAt: open ? null : '2026-10-24T10:30:00Z')],
    });

Future<void> _seed(String lang) async {
  await gapReset(products: [_product('p1', 's1', 'Kinshasa Traders'), _product('p2', 's2', 'Mama Tech Électronique Centre')], lang: lang);
  marketNotifier.value = MarketProfileId.drc; // franc amounts: the longest prices
  final store = RealtimeStore.instance;
  store.user = gapUser(phone: '+243812345678');
  store.walletBalance = 1250.5;
  store.requirePinnedAddress = false;
  store.addresses
    ..clear()
    ..add(_address());
  store.orders
    ..clear()
    ..addAll([
      _order('o-processing', 'processing', open: true),
      _order('o-shipped', 'shipped', origins: ['hub-limete', 'hub-lubum']),
      _order('o-legs', 'out_for_delivery', legs: true),
      _order('o-delivered', 'delivered', origins: ['hub-kin']),
      _order('o-confirmed', 'confirmed'),
    ]);
  HubDirectory.instance.debugSet(const [
    HubInfo(id: 'hub-kin', name: 'Entrepôt de Kinshasa – Gombe'),
    HubInfo(id: 'hub-limete', name: 'Entrepôt de Limete'),
    HubInfo(id: 'hub-lubum', name: 'Entrepôt de Lubumbashi'),
  ]);
  store.debugCallRequest = gapCalls(
    quote: (_) => gapQuoteJson(fee: 6.5, transfer: 1.5, hub: 'Entrepôt de Kinshasa – Gombe'),
    extra: {
      'coupons:store': (body) => body?['sellerId'] == 's1'
          ? [
              {'code': 'KINSHASA10', 'type': 'percent', 'value': 10, 'sellerId': 's1'},
              {'code': 'LIVRAISON5', 'type': 'fixed', 'value': 5, 'description': '5 \$ de réduction dès 30 \$', 'sellerId': 's1'},
            ]
          : <dynamic>[],
    },
  );
  ShopState.instance
    ..addToCart(productByUuid('p1')!, qty: 2)
    ..addToCart(productByUuid('p2')!);
}

void main() {
  registerLayoutMatrix(
    {
      'cart with the quoted fee': (l) => CartScreen(locale: l),
      'cart without an address': (l) {
        RealtimeStore.instance.addresses.clear();
        return CartScreen(locale: l);
      },
      'cart with an unpinned address': (l) {
        RealtimeStore.instance
          ..addresses.clear()
          ..addresses.add(_address(pinned: false));
        RealtimeStore.instance.debugCallRequest = gapCalls(quote: (_) => gapQuoteJson(fee: 6.5, pinned: false, fallback: 'city'));
        return CartScreen(locale: l);
      },
      'checkout with quote, transfer and store coupons': (l) => CheckoutScreen(locale: l),
      'checkout with an unpinned address': (l) {
        RealtimeStore.instance
          ..requirePinnedAddress = true
          ..addresses.clear()
          ..addresses.add(_address(pinned: false));
        return CheckoutScreen(locale: l);
      },
      'checkout with a failed quote': (l) {
        RealtimeStore.instance.debugCallRequest = (event, [body]) async {
          if (event == 'delivery:quote') throw ApiException('Delivery is not available right now: no warehouse is open.');
          return const <dynamic>[];
        };
        return CheckoutScreen(locale: l);
      },
      'tracking: seller still packing': (l) => OrderTrackingScreen(locale: l, orderId: 'o-processing'),
      'tracking: in transfer between warehouses': (l) => OrderTrackingScreen(locale: l, orderId: 'o-shipped'),
      'tracking: out for delivery with leg times': (l) => OrderTrackingScreen(locale: l, orderId: 'o-legs'),
      'tracking: delivered through one warehouse': (l) => OrderTrackingScreen(locale: l, orderId: 'o-delivered'),
      'tracking: before the pickup': (l) => OrderTrackingScreen(locale: l, orderId: 'o-confirmed'),
      'address form': (l) => AddressFormScreen(locale: l, existing: _address()),
    },
    seed: _seed,
    tearDownFakes: () {
      HubDirectory.instance.debugSet(const []);
      RealtimeStore.instance
        ..orders.clear()
        ..requirePinnedAddress = false;
    },
  );
}
