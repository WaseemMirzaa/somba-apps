// An address no warehouse serves: the cart and checkout say so in the user's language, with a "Change address"
// action; the address book flags it; older servers (no area fields) behave exactly as before.
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/shop_state.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/screens/cart_screen.dart';
import 'package:lipcart/screens/checkout_screen.dart';
import 'package:lipcart/screens/more/account_more.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/models.dart';
import 'package:lipcart/services/realtime_store.dart';

import 'areas_helpers.dart';
import 'gap_helpers.dart';

/// Every `orders:create` the checkout sent.
final _sent = <Map<String, dynamic>>[];

/// A pinned address in [ids]'s areas; [served] is what the server says about it (null: an older server says nothing).
AddressDto _address(List<String>? ids, {String id = 'a1', bool? served, String commune = 'Gombe', String city = 'Kinshasa', bool isDefault = true}) =>
    AddressDto.fromJson({
      'id': id,
      'label': 'Home',
      'line1': '12 Avenue de la Paix',
      'commune': commune,
      'city': city,
      'isDefault': isDefault,
      'geo': {'lat': -4.31, 'lng': 15.31},
      if (ids != null) 'areaId': ids.last,
      if (ids != null) 'areaChain': chainOf(ids),
      if (served != null) 'served': served,
    });

const _gombe = ['p-kin', 'c-kin', 'd-luk', 'm-gombe'];
const _goma = ['p-nk', 'c-goma'];

Never _notServed(String area) => throw ApiException('We don\'t deliver to $area yet.');

void main() {
  setUpAll(() async {
    await initializeDateFormatting();
    await gapLoadFonts();
  });
  tearDown(gapTearDown);

  Finder snack(String text) => find.descendant(of: find.byType(SnackBar), matching: find.text(text));

  for (final lang in ['en', 'fr']) {
    final s = Strings(lang);
    final goma = s.areaNotServed('Goma');
    final nordKivu = s.areaNotServed(lang == 'en' ? 'North Kivu' : 'Nord-Kivu');

    group('checkout ($lang)', () {
      setUp(() async {
        await gapReset();
        _sent.clear();
        final store = RealtimeStore.instance;
        store.walletBalance = 1000;
        store.debugPlaceOrderRequest = (event, [body]) async {
          _sent.add(body!);
          return {'id': 'o1', 'reference': 'SOM-1', 'status': 'confirmed', 'paymentMethod': 'wallet', 'items': const []};
        };
        ShopState.instance.addToCart(productByUuid('p1')!);
      });

      Future<void> open(WidgetTester t) async {
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(CheckoutScreen(locale: Locale(lang)), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
      }

      Future<void> placeOrder(WidgetTester t) async {
        await t.tap(find.byKey(const ValueKey('pay-wallet')));
        await t.pump();
        await t.tap(find.byKey(const ValueKey('place-order')));
        await t.pump();
        await t.pump(const Duration(milliseconds: 400));
      }

      testWidgets('the server refuses the quote: the notice names the area in the user\'s language and offers to change the address', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.add(_address(_goma, served: false, commune: '', city: 'Goma'));
        // the server named the province in French; an English reader gets its English name
        store.debugCallRequest = gapCalls(quote: (_) => _notServed('Nord-Kivu'));
        await open(t);
        expect(find.byKey(const ValueKey('not-served')), findsOneWidget);
        expect(t.widget<Text>(find.byKey(const ValueKey('not-served-text'))).data, nordKivu);
        expect(find.byKey(const ValueKey('change-address')), findsOneWidget);
        expect(find.descendant(of: find.byKey(const ValueKey('change-address')), matching: find.text(s.areaChangeAddress)), findsOneWidget);
        expect(find.text(s.checkoutQuoteFailed), findsNothing, reason: 'not "could not work out the fee": the real reason');
        expect(find.byKey(const ValueKey('fix-address')), findsNothing);
      });

      testWidgets('Place order is refused with the message and a Change address action; nothing is sent', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.add(_address(_goma, served: false, commune: '', city: 'Goma'));
        store.debugCallRequest = gapCalls(quote: (_) => _notServed('Goma'));
        await open(t);
        await placeOrder(t);
        expect(_sent, isEmpty);
        expect(snack(goma), findsOneWidget);
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.areaChangeAddress)), findsOneWidget);
      });

      testWidgets('Change address opens the address book to pick another one', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.addAll([_address(_goma, served: false, commune: '', city: 'Goma'), _address(_gombe, id: 'a2', served: true, isDefault: false)]);
        store.debugCallRequest = gapCalls(quote: (body) => body?['addressId'] == 'a2' ? gapQuoteJson() : _notServed('Goma'));
        await open(t);
        expect(find.byKey(const ValueKey('not-served')), findsOneWidget);
        await t.tap(find.byKey(const ValueKey('change-address')));
        await t.pumpAndSettle();
        expect(find.byType(AddressBookScreen), findsOneWidget);
        // pick the Gombe address: the quote is asked again and the notice goes
        await t.tap(find.text('12 Avenue de la Paix, Gombe, Kinshasa'));
        await t.pumpAndSettle();
        expect(find.byType(CheckoutScreen), findsOneWidget);
        expect(find.byKey(const ValueKey('not-served')), findsNothing);
        expect(find.text(s.checkoutFromHub('Kinshasa Hub')), findsOneWidget);
        await placeOrder(t);
        expect(_sent, hasLength(1));
        expect(_sent.single['shippingAddress'], contains('"areaId":"m-gombe"'), reason: 'the delivery area travels with the order');
      });

      testWidgets('a quote that says served:false (not an error) shows the notice too', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.add(_address(_goma, served: false, commune: '', city: 'Goma'));
        store.debugCallRequest = gapCalls(quote: (_) => {...gapQuoteJson(), 'served': false});
        await open(t);
        expect(find.byKey(const ValueKey('not-served')), findsOneWidget);
        expect(find.text(goma), findsOneWidget);
        await placeOrder(t);
        expect(_sent, isEmpty);
      });

      testWidgets('the address\'s own flag shows the notice until the quote answers, and a stale flag does not outlive an answered quote', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.add(_address(_gombe, served: false));
        final answer = Completer<Map<String, dynamic>>();
        store.debugCallRequest = (event, [body]) async => event == 'delivery:quote' ? answer.future : const <dynamic>[];
        await open(t);
        expect(find.byKey(const ValueKey('not-served')), findsOneWidget, reason: 'the address says it is not served');
        answer.complete(gapQuoteJson()); // coverage was added since the list was read
        await t.pump();
        await t.pump(const Duration(milliseconds: 100));
        expect(find.byKey(const ValueKey('not-served')), findsNothing);
        await placeOrder(t);
        expect(_sent, hasLength(1), reason: 'the quote is the authority');
      });

      testWidgets('orders:create refusing the area (coverage changed): the message in the user\'s language, the quote is asked again', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.add(_address(_gombe, served: true));
        var quotes = 0;
        store.debugCallRequest = gapCalls(quote: (_) {
          quotes++;
          return quotes == 1 ? gapQuoteJson() : _notServed('Gombe');
        });
        store.debugPlaceOrderRequest = (event, [body]) async => _notServed('Gombe');
        await open(t);
        expect(find.byKey(const ValueKey('not-served')), findsNothing);
        await placeOrder(t);
        expect(snack(s.areaNotServed('Gombe')), findsOneWidget);
        expect(find.descendant(of: find.byType(SnackBar), matching: find.text(s.areaChangeAddress)), findsOneWidget);
        await t.pump(const Duration(milliseconds: 200));
        expect(quotes, 2, reason: 'asked again');
        expect(find.byKey(const ValueKey('not-served')), findsOneWidget);
        expect(find.byType(CheckoutScreen), findsOneWidget, reason: 'the shopper stays, nothing is lost');
      });

      testWidgets('older servers: an address and a quote without area fields behave as before', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.add(_address(null));
        store.debugCallRequest = gapCalls();
        await open(t);
        expect(find.byKey(const ValueKey('not-served')), findsNothing);
        expect(find.text('12 Avenue de la Paix, Gombe, Kinshasa'), findsOneWidget);
        await placeOrder(t);
        expect(_sent, hasLength(1));
        expect(_sent.single['shippingAddress'], isNot(contains('areaId')));
      });

      testWidgets('the address card names the areas in the language of the app', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.add(_address(_goma, served: false, commune: '', city: 'Goma'));
        store.debugCallRequest = gapCalls(quote: (_) => _notServed('Goma'));
        await open(t);
        expect(find.text('12 Avenue de la Paix, Goma'), findsOneWidget);
      });
    });

    group('cart ($lang)', () {
      setUp(() async {
        await gapReset();
        ShopState.instance.addToCart(productByUuid('p1')!);
      });

      Future<void> open(WidgetTester t) async {
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(CartScreen(locale: Locale(lang)), lang: lang));
        await t.pump(const Duration(milliseconds: 300));
      }

      testWidgets('shows the not-served notice with Change address', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.add(_address(_goma, served: false, commune: '', city: 'Goma'));
        store.debugCallRequest = gapCalls(quote: (_) => _notServed('Goma'));
        await open(t);
        expect(find.byKey(const ValueKey('not-served')), findsOneWidget);
        expect(find.text(goma), findsOneWidget);
        await t.tap(find.byKey(const ValueKey('change-address')));
        await t.pumpAndSettle();
        expect(find.byType(AddressBookScreen), findsOneWidget);
      });

      testWidgets('shows nothing for a served address', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.add(_address(_gombe, served: true));
        store.debugCallRequest = gapCalls();
        await open(t);
        expect(find.byKey(const ValueKey('not-served')), findsNothing);
      });

      testWidgets('shows nothing on an older server', (t) async {
        final store = RealtimeStore.instance;
        store.addresses.add(_address(null));
        store.debugCallRequest = gapCalls();
        await open(t);
        expect(find.byKey(const ValueKey('not-served')), findsNothing);
      });
    });

    group('address book ($lang)', () {
      setUp(() async {
        await gapReset();
      });

      Future<void> open(WidgetTester t) async {
        gapTallViewport(t);
        await Strings.setLang(lang, persist: false);
        await t.pumpWidget(gapApp(AddressBookScreen(locale: Locale(lang)), lang: lang));
        await t.pump();
      }

      testWidgets('an address nobody serves wears a "Not served yet" badge; served and older addresses do not', (t) async {
        RealtimeStore.instance.addresses.addAll([
          _address(_goma, id: 'a1', served: false, commune: '', city: 'Goma'),
          _address(_gombe, id: 'a2', served: true, isDefault: false),
          _address(null, id: 'a3', isDefault: false),
        ]);
        await open(t);
        expect(find.byKey(const ValueKey('address-not-served-a1')), findsOneWidget);
        expect(find.byKey(const ValueKey('address-not-served-a2')), findsNothing);
        expect(find.byKey(const ValueKey('address-not-served-a3')), findsNothing);
        expect(find.text(s.areaNotServedBadge), findsOneWidget);
        expect(find.text(lang == 'en' ? 'Not served yet' : 'Pas encore desservie'), findsOneWidget);
      });

      testWidgets('the line names the areas as the server returned them, in the language of the app', (t) async {
        RealtimeStore.instance.addresses.addAll([
          _address(_goma, id: 'a1', served: false, commune: '', city: 'Goma'),
          _address(_gombe, id: 'a2', served: true, isDefault: false),
        ]);
        await open(t);
        expect(find.text('12 Avenue de la Paix, Goma'), findsOneWidget);
        expect(find.text('12 Avenue de la Paix, Gombe, Kinshasa'), findsOneWidget);
      });
    });
  }

  test('both languages for the same unserved province', () {
    final a = _address(_goma, served: false, commune: '', city: 'Goma');
    expect(a.areaAt('province')!.nameFor('en'), 'North Kivu');
    expect(a.areaAt('province')!.nameFor('fr'), 'Nord-Kivu');
  });
}
