// Round-2 customer screens at two phone widths (360 and 402 pt), in English and French, at text scale 1.0 and 1.3, with
// the app's real fonts and long names: Account -> Following (rows, empty), the store page with its Follow button, Help
// with the contact options, the review form with four photos, the reviews screen and the product page with photo reviews.
// Fails on any overflow, a button label that wraps or is cut, text over text, an icon on a label button, or two filled buttons.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/data/market_profiles.dart';
import 'package:lipcart/screens/more/catalog_extra.dart';
import 'package:lipcart/screens/more/following_screen.dart';
import 'package:lipcart/screens/more/shop_extra.dart';
import 'package:lipcart/screens/more/support_extra.dart';
import 'package:lipcart/screens/product_detail_screen.dart';
import 'package:lipcart/services/follow_store.dart';
import 'package:lipcart/services/realtime_store.dart';
import 'package:lipcart/services/upload_service.dart';
import 'package:lipcart/util/format.dart';
import 'package:lipcart/widgets/photo_picker.dart';

import 'engage_helpers.dart';
import 'gap_helpers.dart';
import 'matrix_helpers.dart';
import 'social_helpers.dart';

const _longStore = 'Grande Boutique Électronique et Maison de Goma Centre-ville';
const _longProduct = 'Chaussures de course Air Comfort Pro édition limitée pointure 42';

var _followed = <String>{'s1', 's2', 's3'};

Future<dynamic> _server(String event, [Map<String, dynamic>? body]) async {
  switch (event) {
    case 'follows:list':
      return [
        for (final (i, id) in _followed.indexed) {'id': id, 'name': i == 0 ? _longStore : 'Boutique $id', 'rating': 4.5, 'productCount': i == 1 ? 1 : 128, 'logoUrl': null, 'followedAt': '2026-11-0${i + 1}T10:00:00.000Z'},
      ];
    case 'follows:state':
      return {'sellerId': body!['sellerId'], 'following': _followed.contains(body['sellerId']), 'followers': 1284};
    case 'sellers:storefront':
      return {'seller': {'id': 's1', 'name': _longStore, 'rating': 4.6, 'badge': 'somba_assured', 'description': 'Chaussures et plus, directement des ateliers de Kinshasa.', 'descriptionFr': 'Chaussures et plus, directement des ateliers de Kinshasa.'}};
    case 'reviews:list':
      return [
        {'id': 'r1', 'author': 'Bénédicte Kalala Mukendi', 'rating': 5, 'text': 'Très confortable, conforme à la taille. Livré en deux jours à Limete, comme promis par la boutique.', 'photos': ['/uploads/a.jpg', '/uploads/b.jpg', '/uploads/c.jpg', '/uploads/d.jpg'], 'sellerReply': 'Merci beaucoup, bonne route !'},
        {'id': 'r2', 'author': 'Paul', 'rating': 4, 'text': 'Bien.'},
      ];
    default:
      return const <dynamic>[];
  }
}

Future<void> _seed(String lang) async {
  await engageReset(products: [engageDto('p1', extra: {'name': _longProduct, 'nameFr': _longProduct, 'sellerName': _longStore})], lang: lang);
  FollowStore.instance.reset();
  marketNotifier.value = MarketProfileId.drc;
  _followed = {'s1', 's2', 's3'};
  var n = 0;
  UploadService.debugUpload = (b, f) async => '/uploads/photo-${++n}.jpg';
  debugPhotoSource = (source, remaining) async => [for (var i = 0; i < 4; i++) XFile.fromData(tinyPng, name: 'p$i.jpg')];
  final store = RealtimeStore.instance;
  store.user = gapUser(phone: '+243812345678');
  store.applySettings({'supportPhone': '+243 970 000 000', 'supportEmail': 'assistance.clients@somba-teka.example', 'supportWhatsapp': '+243 970 000 111'});
  store.debugCallRequest = _server;
}

void main() {
  tearDown(() {
    FollowStore.instance.reset();
    RealtimeStore.instance.applySettings({'supportPhone': '', 'supportEmail': '', 'supportWhatsapp': ''});
    UploadService.debugUpload = null;
    debugPhotoSource = null;
    engageTearDown();
  });

  registerLayoutMatrix(
    {
      'following: three stores, one with a very long name': (l) => FollowingScreen(locale: l),
      'following: nothing yet': (l) {
        _followed = {};
        return FollowingScreen(locale: l);
      },
      'store page: Follow button and follower count': (l) => StoreScreen(locale: l, sellerId: 's9', sellerName: _longStore),
      'store page: already following': (l) => StoreScreen(locale: l, sellerId: 's1', sellerName: _longStore),
      'help: ticket shortcut and the three contact options': (l) => HelpScreen(locale: l),
      'review form: four photos picked': (l) => ReviewComposeScreen(locale: l, product: productByUuid('p1')),
      'reviews screen: a review with four photos': (l) => ReviewsScreen(locale: l, product: productByUuid('p1')!),
      'product page: reviews with photos': (l) => ProductDetailScreen(product: productByUuid('p1')!, locale: l),
    },
    seed: (lang) async => _seed(lang),
    afterPump: (tester, screen) async {
      if (screen == 'review form: four photos picked') {
        await tester.ensureVisible(find.byKey(const ValueKey('photo-add')));
        await tester.tap(find.byKey(const ValueKey('photo-add')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('photo-library')));
        await tester.pumpAndSettle();
      }
      await tester.pump(const Duration(milliseconds: 400));
      // The layout is only worth checking on the real thing: no spinner, and what each screen is about is on it.
      expect(find.byType(CircularProgressIndicator), findsNothing, reason: '$screen is still loading');
      final proof = switch (screen) {
        'following: three stores, one with a very long name' => find.byKey(const ValueKey('following-s1')),
        'following: nothing yet' => find.byKey(const ValueKey('following-empty')),
        'store page: Follow button and follower count' => find.byKey(const ValueKey('follow-count')),
        'store page: already following' => find.byKey(const ValueKey('follow-count')),
        'help: ticket shortcut and the three contact options' => find.byKey(const ValueKey('help-contact-whatsapp')),
        'review form: four photos picked' => find.byType(Image),
        'reviews screen: a review with four photos' => find.byKey(const ValueKey('review-photos-r1')),
        _ => find.byKey(const ValueKey('review-photos-r1')),
      };
      if (screen == 'review form: four photos picked') {
        expect(proof, findsNWidgets(4));
      } else {
        expect(proof, findsOneWidget, reason: '$screen did not show what it is about');
      }
    },
  );
}
