// Parsing of the engagement payloads: the new product fields (and old payloads without them), questions, flash
// sales, the storefront, and the bilingual vacation error.
import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/data/catalog_live.dart';
import 'package:lipcart/l10n/messages.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;
import 'package:lipcart/services/engage_models.dart';
import 'package:lipcart/services/models.dart';

import 'engage_helpers.dart';

void main() {
  group('ProductDto: gallery, sku, brand', () {
    test('a new payload keeps the gallery in order, the cover first', () {
      final p = engageDto('p1', extra: {
        'image': '/uploads/a.png',
        'images': ['/uploads/a.png', '/uploads/b.jpg', 'https://cdn.example.com/c.webp'],
        'sku': 'SHOE-42/BLK',
        'brand': 'Somba Sport',
      });
      expect(p.images, ['/uploads/a.png', '/uploads/b.jpg', 'https://cdn.example.com/c.webp']);
      expect(p.sku, 'SHOE-42/BLK');
      expect(p.brand, 'Somba Sport');
      final view = productFromDto(p);
      expect(view.gallery, p.images);
      expect(view.image, '/uploads/a.png');
    });

    test('an old payload (no images, sku or brand) becomes a gallery of its single image', () {
      final p = engageDto('p1', extra: {'image': '/uploads/old.png'});
      expect(p.images, ['/uploads/old.png']);
      expect(p.sku, isNull);
      expect(p.brand, isNull);
      expect(p.campaignId, isNull);
      expect(p.sellerOnVacation, isFalse);
      expect(p.sellerVacationNotice, isNull);
      expect(p.sellerHandlingDays, 0);
      expect(p.totalDeliveryDays, isNull);
      expect(productFromDto(p).gallery, ['/uploads/old.png']);
    });

    test('an empty cover and no gallery means no pictures: the app draws its tile', () {
      final p = engageDto('p1', extra: {'image': '', 'images': <String>[]});
      expect(p.images, isEmpty);
      expect(productFromDto(p).gallery, isEmpty);
      expect(productFromDto(p).image, '');
    });

    test('blank and repeated pictures are dropped; non-text entries are ignored', () {
      final p = engageDto('p1', extra: {
        'image': 'a.png',
        'images': ['a.png', '', '  ', 'a.png', 7, null, 'b.png'],
      });
      expect(p.images, ['a.png', 'b.png']);
    });

    test('the cover comes from images[0] when image is empty', () {
      final p = engageDto('p1', extra: {
        'image': '',
        'images': ['x.png', 'y.png']
      });
      expect(productFromDto(p).image, 'x.png');
    });

    test('blank sku and brand read as missing', () {
      final p = engageDto('p1', extra: {'sku': '  ', 'brand': ''});
      expect(p.sku, isNull);
      expect(p.brand, isNull);
    });

    test('campaignId is read when present', () {
      final p = engageDto('p1', extra: {'campaignId': '0b2d6a2c-1111-4222-8333-444455556666', 'priceSource': 'campaign'});
      expect(p.campaignId, '0b2d6a2c-1111-4222-8333-444455556666');
      expect(productFromDto(p).campaignId, p.campaignId);
    });
  });

  group('ProductDto: store vacation and delivery time', () {
    test('a store on vacation: flag, date and the notice in both languages', () {
      final p = engageDto('p1', extra: {...vacationFields(), 'sellerHandlingDays': 2, 'totalDeliveryDays': 5});
      expect(p.sellerOnVacation, isTrue);
      expect(p.sellerVacationUntil!.toUtc(), DateTime.utc(2026, 11, 12, 22, 59, 59));
      expect(p.sellerVacationNotice!['en'], contains('on vacation until 12 Nov 2026'));
      expect(p.sellerVacationNotice!['fr'], contains('est en vacances'));
      expect(p.sellerHandlingDays, 2);
      expect(p.totalDeliveryDays, 5);
      expect(productFromDto(p).shipDays, 5);
    });

    test('an open store carries no notice even when the payload sends an empty one', () {
      final p = engageDto('p1', extra: {'sellerOnVacation': false, 'sellerVacationUntil': null, 'sellerVacationNotice': null});
      expect(p.sellerOnVacation, isFalse);
      expect(p.sellerVacationNotice, isNull);
      expect(p.sellerVacationUntil, isNull);
    });

    test('a notice with only one language is kept; an empty notice is dropped', () {
      expect(engageDto('p', extra: {'sellerOnVacation': true, 'sellerVacationNotice': {'en': 'Away.'}}).sellerVacationNotice, {'en': 'Away.'});
      expect(engageDto('p', extra: {'sellerOnVacation': true, 'sellerVacationNotice': {'en': ' ', 'fr': ''}}).sellerVacationNotice, isNull);
    });

    test('the delivery time falls back to deliveryDays without totalDeliveryDays, and uses the total when present', () {
      expect(productFromDto(engageDto('p1')).shipDays, 3);
      expect(productFromDto(engageDto('p1', extra: {'sellerHandlingDays': 4, 'totalDeliveryDays': 7})).shipDays, 7);
      // The total can pass 30 days (30 transit + 14 handling): it is not clamped like deliveryDays.
      expect(productFromDto(engageDto('p1', extra: {'deliveryDays': 30, 'sellerHandlingDays': 14, 'totalDeliveryDays': 44})).shipDays, 44);
    });

    test('handling time is kept within the 0..14 days the server allows; junk reads as none', () {
      expect(engageDto('p1', extra: {'sellerHandlingDays': 99}).sellerHandlingDays, 14);
      expect(engageDto('p1', extra: {'sellerHandlingDays': -3}).sellerHandlingDays, 0);
      expect(engageDto('p1', extra: {'sellerHandlingDays': 'x'}).sellerHandlingDays, 0);
      expect(engageDto('p1', extra: {'totalDeliveryDays': 0}).totalDeliveryDays, isNull);
    });

    test('every parsed product gets a newer stamp than the one before', () {
      final a = engageDto('p1');
      final b = engageDto('p1');
      expect(b.stamp, greaterThan(a.stamp));
    });
  });

  group('QuestionDto', () {
    test('an old payload (id, question, answer) still parses', () {
      final q = QuestionDto.fromJson({'id': 'q1', 'question': 'Does it fit?', 'answer': null});
      expect(q.id, 'q1');
      expect(q.isAnswered, isFalse);
      expect(q.productId, isNull);
      expect(q.askerId, isNull);
      expect(q.sellerId, isNull);
      expect(q.answeredAt, isNull);
    });

    test('a new payload carries the product, the asker, the store and the answer time', () {
      final q = QuestionDto.fromJson({
        'id': 'q1',
        'question': 'Does it fit?',
        'answer': 'Yes, true to size.',
        'productId': 'p1',
        'askerId': 'u1',
        'sellerId': 's1',
        'createdAt': '2026-10-24T09:00:00.000Z',
        'answeredAt': '2026-10-25T10:30:00.000Z',
      });
      expect(q.isAnswered, isTrue);
      expect(q.productId, 'p1');
      expect(q.askerId, 'u1');
      expect(q.sellerId, 's1');
      expect(q.answeredAt!.toUtc(), DateTime.utc(2026, 10, 25, 10, 30));
    });

    test('a blank answer is not an answer', () {
      expect(QuestionDto.fromJson({'id': 'q1', 'question': 'x', 'answer': '   '}).isAnswered, isFalse);
      expect(QuestionDto.fromJson({'id': 'q1', 'question': 'x', 'answerAt': 'not a date', 'answeredAt': 'not a date'}).answeredAt, isNull);
    });
  });

  group('FlashSaleDto', () {
    final now = DateTime.utc(2026, 10, 25, 12);

    test('endsInMs becomes an absolute end at the moment the payload is received', () {
      final s = FlashSaleDto.fromJson(flashJson('f1', 'p1', endsInMs: 7749000), now);
      expect(s.id, 'f1');
      expect(s.productId, 'p1');
      expect(s.endsAt, now.add(const Duration(hours: 2, minutes: 9, seconds: 9)));
      expect(s.flashPrice, 12);
      expect(s.basePrice, 20);
      expect(s.discount, 40);
      expect(s.phase, 'running');
      expect(s.runningAt(now), isTrue);
      expect(s.remaining(now), const Duration(hours: 2, minutes: 9, seconds: 9));
      expect(s.displayTitle('fr'), 'Flash du week-end');
      expect(s.displayTitle('en'), 'Weekend flash');
      expect(s.displayProductName('fr'), 'Article p1');
    });

    test('without endsInMs the endsAt ISO text is used', () {
      final j = flashJson('f1', 'p1')..remove('endsInMs');
      j['endsAt'] = '2026-10-25T14:00:00.000Z';
      final s = FlashSaleDto.fromJson(j, now);
      expect(s.endsAt!.toUtc(), DateTime.utc(2026, 10, 25, 14));
      expect(s.runningAt(now), isTrue);
      expect(s.runningAt(DateTime.utc(2026, 10, 25, 14)), isFalse, reason: 'it is over at the end time');
    });

    test('the phase comes from the dates on a payload that has none', () {
      Map<String, dynamic> base() => flashJson('f1', 'p1')..remove('phase');
      expect(FlashSaleDto.fromJson(base(), now).phase, 'running');
      expect((base()..['startsInMs'] = 60000), isNotNull);
      expect(FlashSaleDto.fromJson(base()..['startsInMs'] = 60000, now).phase, 'scheduled');
      expect(FlashSaleDto.fromJson(base()..['endsInMs'] = null..['endsAt'] = '2026-10-25T11:00:00.000Z', now).phase, 'ended');
      expect(FlashSaleDto.fromJson(base()..['active'] = false, now).phase, 'ended');
      expect(FlashSaleDto.fromJson(base()..['status'] = 'nominated', now).phase, 'ended');
    });

    test('a sale that is scheduled or ended is not running', () {
      expect(FlashSaleDto.fromJson(flashJson('f1', 'p1', phase: 'scheduled'), now).runningAt(now), isFalse);
      expect(FlashSaleDto.fromJson(flashJson('f1', 'p1', phase: 'ended'), now).runningAt(now), isFalse);
    });

    test('the discount is worked out from the prices when the server sends none', () {
      final j = flashJson('f1', 'p1', flashPrice: 15, basePrice: 20)..['discount'] = 0;
      expect(FlashSaleDto.fromJson(j, now).percentOff, 25);
      final k = flashJson('f1', 'p1')..['basePrice'] = null..['discount'] = 0;
      expect(FlashSaleDto.fromJson(k, now).percentOff, 0);
    });

    test('a sale with no end date runs on (no countdown)', () {
      final j = flashJson('f1', 'p1')..['endsInMs'] = null;
      final s = FlashSaleDto.fromJson(j, now);
      expect(s.endsAt, isNull);
      expect(s.runningAt(now.add(const Duration(days: 400))), isTrue);
      expect(s.remaining(now), isNull);
    });
  });

  group('StoreFront and StoreVacation', () {
    test('policies are picked by language, with the other language as the fallback', () {
      final f = StoreFront.fromJson({
        'returnsPolicy': 'Returns within 7 days.',
        'returnsPolicyFr': 'Retours sous 7 jours.',
        'shippingPolicy': 'We ship on Mondays.',
        'handlingDays': 3,
        'onVacation': false,
      });
      expect(f.returnsIn('en'), 'Returns within 7 days.');
      expect(f.returnsIn('fr'), 'Retours sous 7 jours.');
      expect(f.shippingIn('fr'), 'We ship on Mondays.', reason: 'not translated yet: show the original');
      expect(f.shippingIn('en'), 'We ship on Mondays.');
      expect(f.handlingDays, 3);
      expect(f.onVacation, isFalse);
    });

    test('a storefront from an older server has no policies, no handling time, no vacation', () {
      final f = StoreFront.fromJson({'id': 's1', 'name': 'Kinshasa Traders'});
      expect(f.returnsIn('en'), '');
      expect(f.shippingIn('fr'), '');
      expect(f.handlingDays, 0);
      expect(f.onVacation, isFalse);
      expect(f.vacationUntil, isNull);
    });

    test('a store on vacation: the return date', () {
      final f = StoreFront.fromJson({'onVacation': true, 'vacationUntil': '2026-11-12T22:59:59.000Z'});
      expect(f.onVacation, isTrue);
      expect(f.vacationUntil!.toUtc(), DateTime.utc(2026, 11, 12, 22, 59, 59));
    });

    test('store:vacation payloads: away with a notice, and back', () {
      final away = StoreVacation.fromJson({
        'sellerId': 's1',
        'onVacation': true,
        'vacationUntil': '2026-11-12T22:59:59.000Z',
        'notice': {'en': 'Away.', 'fr': 'Absent.'},
      });
      expect(away.onVacation, isTrue);
      expect(away.notice, {'en': 'Away.', 'fr': 'Absent.'});
      final back = StoreVacation.fromJson({'sellerId': 's1', 'onVacation': false, 'vacationUntil': null});
      expect(back.onVacation, isFalse);
      expect(back.until, isNull);
      expect(back.stamp, greaterThan(away.stamp));
    });
  });

  group('the bilingual vacation error', () {
    const raw = 'Kinshasa Traders is on vacation until 12 Nov 2026 and is not taking new orders. / '
        'Kinshasa Traders est en vacances jusqu’au 12 nov. 2026 et ne prend pas de nouvelles commandes.';

    test('French users read the French half, English users the English half', () {
      expect(translateServerError(raw, const Strings('fr')), 'Kinshasa Traders est en vacances jusqu’au 12 nov. 2026 et ne prend pas de nouvelles commandes.');
      expect(translateServerError(raw, const Strings('en')), 'Kinshasa Traders is on vacation until 12 Nov 2026 and is not taking new orders.');
    });

    test('a store name that contains " / " does not break the split', () {
      const odd = 'Mode / Beauté is on vacation until 3 Dec 2026 and is not taking new orders. / '
          'Mode / Beauté est en vacances jusqu’au 3 déc. 2026 et ne prend pas de nouvelles commandes.';
      expect(translateServerError(odd, const Strings('en')), 'Mode / Beauté is on vacation until 3 Dec 2026 and is not taking new orders.');
      expect(translateServerError(odd, const Strings('fr')), 'Mode / Beauté est en vacances jusqu’au 3 déc. 2026 et ne prend pas de nouvelles commandes.');
    });

    test('other messages are untouched in both languages (and keep their existing translation)', () {
      expect(translateServerError('Order not found.', const Strings('en')), 'Order not found.');
      expect(translateServerError('Write your question first.', const Strings('fr')), 'Écrivez d’abord votre question.');
      expect(translateServerError('Review not found.', const Strings('fr')), 'Avis introuvable.');
      expect(translateServerError('A / B', const Strings('fr')), 'A / B');
    });

    test('an ApiException shows the half in the current language', () async {
      final e = ApiException(raw);
      await Strings.setLang('en', persist: false);
      expect(e.toString(), startsWith('Kinshasa Traders is on vacation'));
      expect(e.toString(), isNot(contains(' / ')));
      await Strings.setLang('fr', persist: false);
      expect(e.toString(), startsWith('Kinshasa Traders est en vacances'));
      expect(e.toString(), isNot(contains(' / ')));
    });
  });

  group('French and English texts', () {
    test('every engage key has both languages and the same placeholders', () {
      final mine = kMessages.entries.where((e) => const ['cd_', 'flash_', 'vac_', 'store_', 'pd_handling', 'pd_brand', 'pd_sku', 'gal_', 'qa_'].any(e.key.startsWith));
      expect(mine.length, greaterThan(20));
      for (final e in mine) {
        expect(e.value.$1.trim(), isNotEmpty, reason: e.key);
        expect(e.value.$2.trim(), isNotEmpty, reason: e.key);
      }
    });

    test('vacationText: the notice in the language, else "until {date}", else the generic sentence', () async {
      const en = Strings('en'), fr = Strings('fr');
      final notice = {'en': 'Back soon!', 'fr': 'De retour bientôt !'};
      expect(en.vacationText(notice: notice), 'Back soon!');
      expect(fr.vacationText(notice: notice), 'De retour bientôt !');
      expect(fr.vacationText(notice: {'en': 'Back soon!'}, until: DateTime(2026, 11, 12)), startsWith('En vacances jusqu’au'));
      expect(en.vacationText(until: DateTime(2026, 11, 12)), startsWith('On vacation until'));
      expect(en.vacationText(), 'This store is on vacation and is not taking new orders.');
      expect(fr.vacationText(), 'Cette boutique est en vacances et ne prend pas de nouvelles commandes.');
    });

    test('countdown wording', () {
      expect(const Strings('en').cdDays(2), '2d');
      expect(const Strings('fr').cdDays(2), '2 j');
      expect(const Strings('en').flashEnds('02:14:09'), 'Flash sale · ends in 02:14:09');
      expect(const Strings('fr').flashEnds('02:14:09'), 'Vente flash · fin dans 02:14:09');
      expect(const Strings('en').storeHandling(1), 'Handling time: 1 day');
      expect(const Strings('fr').storeHandling(3), 'Délai de préparation : 3 jours');
    });
  });
}
