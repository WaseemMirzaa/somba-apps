// The new server errors of docs/contracts/admin-controls.md section 8 are in the app's French error maps, word for word, and
// the app's wording of them follows the contract.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lipcart/l10n/server_errors.dart';
import 'package:lipcart/l10n/strings.dart';
import 'package:lipcart/services/auth_service.dart' show ApiException;

/// English -> French, exactly as the contract's section 8 table has them.
const _contract = <String, String>{
  'Messaging sellers is closed. Contact support from your account.': 'La messagerie avec les vendeurs est fermée. Contactez le support depuis votre compte.',
  'Returns are decided by KOMORIKO support.': 'Les retours sont décidés par le support KOMORIKO.',
  'Your request is already with KOMORIKO support.': 'Votre demande est déjà entre les mains du support KOMORIKO.',
  'Not enough stock to send a replacement. Ask the seller to restock the item, or reject the request.':
      'Stock insuffisant pour envoyer un remplacement. Demandez au vendeur de réapprovisionner l’article, ou refusez la demande.',
  'Not enough stock for this exchange. Ask the seller to restock the item, or reject the request.':
      'Stock insuffisant pour cet échange. Demandez au vendeur de réapprovisionner l’article, ou refusez la demande.',
  'This store has no pinned pickup location. Ask the seller to pin it in Store settings before turning on express delivery.':
      'Cette boutique n’a pas de lieu de collecte placé sur la carte. Demandez au vendeur de le placer dans les paramètres de la boutique avant d’activer la livraison express.',
  'Policy change not found.': 'Modification de politique introuvable.',
  'This policy change was already decided.': 'Cette modification de politique a déjà été traitée.',
  'Tell the seller why the policy was not approved.': 'Expliquez au vendeur pourquoi la politique n’a pas été approuvée.',
  'Nothing to publish: write at least one policy.': 'Rien à publier : rédigez au moins une politique.',
  'Status must be pending, approved, rejected or all.': 'Le statut doit être en attente, approuvé, refusé ou tous.',
};

void main() {
  const en = Strings('en');
  const fr = Strings('fr');

  group('contract section 8', () {
    for (final e in _contract.entries) {
      test('"${e.key}" is in French, exactly as the contract says', () async {
        expect(translateServerError(e.key, fr), e.value);
        expect(translateServerError(e.key, en), e.key, reason: 'English stays as the server wrote it');
        await Strings.setLang('fr', persist: false);
        expect(ApiException(e.key).toString(), e.value, reason: 'an ApiException shows the French text');
        await Strings.setLang('en', persist: false);
        expect(ApiException(e.key).toString(), e.key);
      });
    }

    test('the validator label "Support response time" is known too', () {
      expect(translateServerError('Support response time', fr), 'Le délai de réponse du support');
    });

    test('the table of the contract file (when it is checked out) says what the app has, row for row', () {
      final file = File('../docs/contracts/admin-controls.md');
      if (!file.existsSync()) return; // the app is built outside the monorepo
      final section = file.readAsStringSync().split('## 8.').last.split('\n## 9.').first;
      final rows = RegExp(r'^\| (.+?) \| (.+?) \|$', multiLine: true).allMatches(section).where((m) => m[1] != 'English' && !m[1]!.startsWith('---') && !m[1]!.startsWith('Support response time'));
      expect(rows.length, _contract.length, reason: 'a new row in the contract needs a French text in the app');
      for (final m in rows) {
        expect(_contract[m[1]], m[2], reason: m[1]);
        expect(translateServerError(m[1]!, fr), m[2], reason: m[1]);
      }
    });
  });

  group('retired errors old servers may still send stay in French', () {
    for (final e in const [
      'The response time has passed; KOMORIKO support decides now.',
      'Wait for the seller to answer, or for the response time to pass.',
      'Only returns can be escalated; a dispute is already with KOMORIKO support.',
      'Your store is suspended: you can read messages but not reply.',
    ]) {
      test(e, () => expect(translateServerError(e, fr), isNot(e)));
    }
  });
}
