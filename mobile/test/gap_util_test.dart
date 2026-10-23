// Pure-logic tests for the gap features: delivery zone matching, product variants, delivery estimate and the cart.
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/util/delivery_estimate.dart';
import 'package:lipcart/util/variants.dart';
import 'package:lipcart/util/zone_match.dart';

import 'gap_helpers.dart';

void main() {
  group('zoneForAddress', () {
    const zones = [
      Zone(id: 'gombe', name: 'Gombe', nameFr: 'Gombe', city: 'Kinshasa', deliveryFeeUsd: 3),
      Zone(id: 'limete', name: 'Limete', nameFr: 'Limeté', city: 'Kinshasa', deliveryFeeUsd: 5),
      Zone(id: 'lubum', name: 'Lubumbashi Centre', nameFr: 'Lubumbashi Centre', city: 'Lubumbashi', deliveryFeeUsd: 7),
    ];

    test('matches the commune ignoring case, accents and spaces', () {
      expect(zoneForAddress(commune: 'gombe', zones: zones)?.id, 'gombe');
      expect(zoneForAddress(commune: '  GOMBE ', zones: zones)?.id, 'gombe');
      expect(zoneForAddress(commune: 'Limeté', zones: zones)?.id, 'limete');
      expect(zoneForAddress(commune: 'LIMETE', zones: zones)?.id, 'limete');
    });

    test('accepts the "Commune de …" / "Commune d\'…" prefix', () {
      expect(zoneForAddress(commune: 'Commune de Gombe', zones: zones)?.id, 'gombe');
      expect(zoneForAddress(commune: 'commune de Limeté', zones: zones)?.id, 'limete');
      expect(zoneForAddress(commune: "Commune d'Gombe", zones: zones)?.id, 'gombe');
    });

    test('matches the zone id or the French name too', () {
      expect(zoneForAddress(commune: 'limete', zones: const [Zone(id: 'z9', name: 'Zed', nameFr: 'Limeté', city: '', deliveryFeeUsd: 1)])?.id, 'z9');
      expect(zoneForAddress(commune: 'z9', zones: const [Zone(id: 'z9', name: 'Zed', nameFr: 'Zèd', city: '', deliveryFeeUsd: 1)])?.id, 'z9');
    });

    test('a different city does not match; an unknown city is not blocking', () {
      expect(zoneForAddress(commune: 'Gombe', city: 'Lubumbashi', zones: zones), isNull);
      expect(zoneForAddress(commune: 'Gombe', city: 'kinshasa', zones: zones)?.id, 'gombe');
      expect(zoneForAddress(commune: 'Gombe', city: '', zones: zones)?.id, 'gombe');
      expect(zoneForAddress(commune: 'Gombe', city: null, zones: zones)?.id, 'gombe');
    });

    test('the zone id the address carries wins over the commune', () {
      expect(zoneForAddress(commune: 'Gombe', zoneId: 'limete', zones: zones)?.id, 'limete');
      expect(zoneForAddress(commune: null, zoneId: 'lubum', zones: zones)?.id, 'lubum');
    });

    test('a zone id that no longer exists falls back to the commune', () {
      expect(zoneForAddress(commune: 'Gombe', zoneId: 'gone', zones: zones)?.id, 'gombe');
      expect(zoneForAddress(commune: 'Ngaliema', zoneId: 'gone', zones: zones), isNull);
    });

    test('no match → null (we do not deliver there yet)', () {
      expect(zoneForAddress(commune: 'Ngaliema', zones: zones), isNull);
      expect(zoneForAddress(commune: '', zones: zones), isNull);
      expect(zoneForAddress(commune: null, zones: zones), isNull);
      expect(zoneForAddress(commune: 'Gombe', zones: const []), isNull);
    });

    test('works on the fallback zones the app ships with', () {
      expect(zoneForAddress(commune: 'Limete', city: 'Kinshasa', zones: fallbackZones)?.id, 'limete');
    });
  });

  group('variants', () {
    test('readVariants reads a JSON string', () {
      final g = readVariants('[{"name":"Size","options":["40","41","42"]},{"name":"Colour","options":["Black","White"]}]');
      expect(g.map((e) => e.name), ['Size', 'Colour']);
      expect(g.first.options, ['40', '41', '42']);
      expect(g.last.options, ['Black', 'White']);
    });

    test('readVariants reads an already decoded list and trims', () {
      final g = readVariants([
        {'name': ' Size ', 'options': [' 40 ', 41, '']},
      ]);
      expect(g.single.name, 'Size');
      expect(g.single.options, ['40', '41']);
    });

    test('garbage means "no options"', () {
      expect(readVariants(null), isEmpty);
      expect(readVariants('not json {'), isEmpty);
      expect(readVariants(''), isEmpty);
      expect(readVariants(42), isEmpty);
      expect(readVariants('{"name":"Size"}'), isEmpty, reason: 'an object is not a list');
      expect(readVariants('"text"'), isEmpty);
    });

    test('malformed groups are skipped, valid ones kept', () {
      final g = readVariants([
        'oops',
        {'name': '', 'options': ['x']},
        {'name': 'NoOptions', 'options': []},
        {'name': 'BadOptions', 'options': 'x'},
        {'name': 'Size', 'options': ['S']},
      ]);
      expect(g.map((e) => e.name), ['Size']);
    });

    final groups = readVariants([
      {'name': 'Size', 'options': ['41', '42']},
      {'name': 'Colour', 'options': ['Black', 'White']},
    ]);

    test('variantLabel joins the picks, or "Default" without groups', () {
      expect(variantLabel(groups, {'Size': '42', 'Colour': 'Black'}), 'Size: 42 · Colour: Black');
      expect(variantLabel(const [], {}), defaultVariant);
      expect(variantLabel(const [], {'Size': '42'}), 'Default');
    });

    test('missingPick returns the first group not chosen yet', () {
      expect(missingPick(groups, {})?.name, 'Size');
      expect(missingPick(groups, {'Size': '42'})?.name, 'Colour');
      expect(missingPick(groups, {'Colour': 'Black'})?.name, 'Size');
      expect(missingPick(groups, {'Size': '42', 'Colour': 'Black'}), isNull);
      expect(missingPick(const [], {}), isNull);
    });

    test('an option that does not exist counts as not chosen', () {
      expect(missingPick(groups, {'Size': '99', 'Colour': 'Black'})?.name, 'Size');
    });

    test('the product DTO carries the parsed variants', () {
      final dto = gapDto('v', variants: '[{"name":"Size","options":["S","M"]}]');
      expect(dto.variants.single.options, ['S', 'M']);
      expect(productFromDto(dto).variants.single.name, 'Size');
      expect(gapDto('w').variants, isEmpty);
    });
  });

  group('delivery estimate', () {
    test('days are counted in Kinshasa time (UTC+1): 23:30Z is already the next day', () {
      expect(localDayPlus(0, DateTime.utc(2026, 10, 22, 23, 30)), '2026-10-23');
      expect(localDayPlus(2, DateTime.utc(2026, 10, 22, 22, 59)), '2026-10-24');
      expect(localDayPlus(3, DateTime.utc(2026, 12, 30, 12)), '2027-01-02');
    });

    test('the slowest line decides; no lines use the fallback', () {
      final now = DateTime.utc(2026, 10, 22, 10);
      expect(estimateFor([1, 4, 2], now), '2026-10-26');
      expect(estimateFor(<int>[], now), localDayPlus(deliveryDaysFallback, now));
    });

    test('missing or broken delivery times use the fallback; long ones are capped', () {
      expect(deliveryDaysOf(null), deliveryDaysFallback);
      expect(deliveryDaysOf(0), deliveryDaysFallback);
      expect(deliveryDaysOf('soon'), deliveryDaysFallback);
      expect(deliveryDaysOf('5'), 5);
      expect(deliveryDaysOf(99), deliveryDaysMax);
    });

    test('a local (non-UTC) DateTime is converted before counting', () {
      final utc = DateTime.utc(2026, 10, 22, 23, 30);
      expect(localDayPlus(1, utc.toLocal()), localDayPlus(1, utc));
    });

    test('dayLabel in English and French; malformed → null', () {
      // 2026-10-23 is a Friday, 2026-02-03 a Tuesday, 2026-08-09 a Sunday.
      expect(dayLabel('2026-10-23', 'en'), 'Fri 23 Oct');
      expect(dayLabel('2026-10-23', 'fr'), 'ven. 23 oct.');
      expect(dayLabel('2026-02-03', 'fr'), 'mar. 3 févr.');
      expect(dayLabel('2026-08-09', 'xx'), 'Sun 9 Aug', reason: 'unknown language → English');
      expect(dayLabel(null, 'en'), isNull);
      expect(dayLabel('2026-10-23 09:00-12:00', 'en'), isNull);
    });

    test('products carry the seller\'s delivery time (fallback when the server sends none)', () {
      expect(gapDto('a', deliveryDays: 6).deliveryDays, 6);
      expect(productFromDto(gapDto('a', deliveryDays: 6)).deliveryDays, 6);
      expect(gapDto('b').deliveryDays, deliveryDaysFallback);
    });
  });

  group('cart', () {
    setUp(() => gapReset(products: [
          gapDto('p1', stock: 10),
          gapDto('p2', stock: 10),
          gapDto('p3', stock: 10),
          gapDto('low', stock: 5),
        ]));
    tearDown(gapTearDown);

    List<String> ids() => ShopState.instance.cart.map((c) => c.product.uuid).toList();

    test('removeAt returns the line and restoreLine puts it back in the same position', () {
      final shop = ShopState.instance;
      for (final id in ['p1', 'p2', 'p3']) {
        shop.addToCart(productByUuid(id)!);
      }
      final removed = shop.removeAt(1);
      expect(removed.product.uuid, 'p2');
      expect(ids(), ['p1', 'p3']);
      shop.restoreLine(1, removed);
      expect(ids(), ['p1', 'p2', 'p3']);

      final first = shop.removeAt(0);
      shop.restoreLine(0, first);
      expect(ids(), ['p1', 'p2', 'p3']);

      final last = shop.removeAt(2);
      shop.restoreLine(2, last);
      expect(ids(), ['p1', 'p2', 'p3']);
    });

    test('restoreLine with an out-of-range index appends instead of throwing', () {
      final shop = ShopState.instance;
      shop.addToCart(productByUuid('p1')!);
      final removed = shop.removeAt(0);
      shop.addToCart(productByUuid('p2')!);
      shop.restoreLine(99, removed);
      expect(ids(), ['p2', 'p1']);
      shop.restoreLine(-3, shop.removeAt(1));
      expect(ids(), ['p1', 'p2']);
    });

    test('a removal and its undo keep quantity and variant', () {
      final shop = ShopState.instance;
      shop.addToCart(productByUuid('p1')!, variant: 'Size: 42', qty: 3);
      final removed = shop.removeAt(0);
      shop.restoreLine(0, removed);
      expect((shop.cart.single.qty, shop.cart.single.variant), (3, 'Size: 42'));
    });

    test('saveForLater moves the line out of the cart, newest first', () {
      final shop = ShopState.instance;
      shop.addToCart(productByUuid('p1')!, qty: 2);
      shop.addToCart(productByUuid('p2')!);
      shop.saveForLater(0);
      expect(ids(), ['p2']);
      expect(shop.savedForLater.map((c) => (c.product.uuid, c.qty)), [('p1', 2)]);
      shop.saveForLater(0);
      expect(shop.cart, isEmpty);
      expect(shop.savedForLater.map((c) => c.product.uuid), ['p2', 'p1']);
    });

    test('saving a line that is already saved replaces the old saved copy', () {
      final shop = ShopState.instance;
      shop.addToCart(productByUuid('p1')!, qty: 2);
      shop.saveForLater(0);
      shop.addToCart(productByUuid('p1')!, qty: 4);
      shop.saveForLater(0);
      expect(shop.savedForLater.map((c) => c.qty), [4]);
    });

    test('moveToCart brings the saved line back with its quantity', () {
      final shop = ShopState.instance;
      shop.addToCart(productByUuid('p1')!, variant: 'Size: 41', qty: 3);
      shop.saveForLater(0);
      expect(shop.moveToCart(0), 3);
      expect(shop.savedForLater, isEmpty);
      expect((shop.cart.single.qty, shop.cart.single.variant), (3, 'Size: 41'));
    });

    test('moveToCart is capped at the stock left (counting what the cart already holds)', () {
      final shop = ShopState.instance;
      final low = productByUuid('low')!; // stock 5
      shop.addToCart(low, variant: 'A', qty: 4);
      shop.saveForLater(0); // saved: 4 × A
      shop.addToCart(low, variant: 'B', qty: 3); // cart: 3 × B
      expect(shop.moveToCart(0), 2, reason: '5 in stock, 3 already in the cart');
      expect(shop.cart.fold(0, (n, c) => n + c.qty), 5);
    });

    test('moveToCart of a sold-out product adds nothing', () {
      final shop = ShopState.instance;
      shop.addToCart(productByUuid('p1')!, qty: 2);
      shop.saveForLater(0);
      RealtimeStore.instance.products
        ..clear()
        ..add(gapDto('p1', stock: 0));
      shop.savedForLater.first.product = productByUuid('p1')!;
      expect(shop.moveToCart(0), 0);
      expect(shop.cart, isEmpty);
    });

    test('CartItem.priceChange is price now minus price when added', () {
      final p = productByUuid('p1')!; // $20
      expect(CartItem(product: p).priceChange, 0, reason: 'defaults to the current price');
      expect(CartItem(product: p, priceWhenAdded: 25).priceChange, -5);
      expect(CartItem(product: p, priceWhenAdded: 15).priceChange, 5);
      expect(CartItem(product: p, priceWhenAdded: 20.004).priceChange, 0, reason: 'sub-cent noise is ignored');
      final item = CartItem(product: p, priceWhenAdded: 12);
      item.priceWhenAdded = null;
      expect(item.priceChange, 0);
    });

    test('a new cart line remembers the price it was added at; a later price change shows', () {
      final shop = ShopState.instance;
      shop.addToCart(productByUuid('p1')!);
      expect(shop.cart.single.priceWhenAdded, 20);
      RealtimeStore.instance.products
        ..clear()
        ..add(gapDto('p1', stock: 10, price: 17));
      shop.syncWithCatalog();
      expect(shop.cart.single.priceChange, -3);
    });

    test('addToCart never exceeds the stock, whatever the variants', () {
      final shop = ShopState.instance;
      final low = productByUuid('low')!; // stock 5
      expect(shop.addToCart(low, variant: 'Size: 41', qty: 3), 3);
      expect(shop.addToCart(low, variant: 'Size: 42', qty: 4), 2, reason: 'only 2 units left across all variants');
      expect(shop.addToCart(low, variant: 'Size: 41', qty: 1), 0);
      expect(shop.addToCart(low, variant: 'Size: 43'), 0);
      expect(shop.cart.fold(0, (n, c) => n + c.qty), 5);
      expect(shop.cart, hasLength(2));
    });

    test('addToCart of zero or negative quantities adds nothing', () {
      final shop = ShopState.instance;
      expect(shop.addToCart(productByUuid('p1')!, qty: 0), 0);
      expect(shop.cart, isEmpty);
    });

    test('cart and saved lines are persisted on the device', () async {
      final shop = ShopState.instance;
      shop.addToCart(productByUuid('p1')!, qty: 2);
      shop.addToCart(productByUuid('p2')!);
      shop.saveForLater(1);
      shop.restoreCart();
      shop.cart.clear();
      shop.savedForLater.clear();
      shop.syncWithCatalog();
      expect(shop.cart.map((c) => (c.product.uuid, c.qty)), [('p1', 2)]);
      expect(shop.savedForLater.map((c) => c.product.uuid), ['p2']);
    });

    test('the server cart (cart:updated) is merged in at first sight, keeping what was in the cart before sign-in', () async {
      final shop = ShopState.instance;
      final store = RealtimeStore.instance;
      addTearDown(shop.clearSession); // cancels the pending push timer and forgets the synced user
      shop.addToCart(productByUuid('p1')!, qty: 1); // added before signing in
      store.serverCart.value = {
        'lines': [
          {'productId': 'p2', 'variant': 'Default', 'qty': 2, 'priceWhenAdded': 20},
          {'productId': 'p1', 'variant': 'Default', 'qty': 3, 'priceWhenAdded': 18},
        ],
        'saved': [
          {'productId': 'p3', 'variant': 'Default', 'qty': 1},
        ],
      };
      final byId = {for (final c in shop.cart) c.product.uuid: c};
      expect(byId.keys.toSet(), {'p1', 'p2'});
      expect(byId['p1']!.qty, 3, reason: 'the larger quantity wins');
      expect(byId['p2']!.qty, 2);
      expect(shop.savedForLater.map((c) => c.product.uuid), ['p3']);
    });

    test('the server cart is ignored for non-customer accounts', () {
      final shop = ShopState.instance;
      final store = RealtimeStore.instance;
      addTearDown(shop.clearSession);
      store.user = gapUser(role: 'seller');
      store.serverCart.value = {
        'lines': [
          {'productId': 'p2', 'variant': 'Default', 'qty': 2}
        ],
        'saved': const [],
      };
      expect(shop.cart, isEmpty);
    });

    test('clearSession empties cart and saved lines', () {
      final shop = ShopState.instance;
      shop.addToCart(productByUuid('p1')!);
      shop.saveForLater(0);
      shop.addToCart(productByUuid('p2')!);
      shop.clearSession();
      expect(shop.cart, isEmpty);
      expect(shop.savedForLater, isEmpty);
    });
  });
}
