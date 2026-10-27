// Server error messages for delivery areas, warehouse coverage, routing and transfers (docs/contracts/areas.md, "Errors").
// Exact English text -> French; a message with a name inside goes to the pattern list. A message may be listed in one
// map only (the ones shared with other features are in server_errors.dart: "Not allowed.", "Staff only.", "Riders
// only.", "Choose an active rider.", "Pin your delivery address on the map.", ...).

const Map<String, String> kServerErrorsAreas = {
  // geography and coverage
  'Choose where this warehouse is.': 'Choisissez l’emplacement de cet entrepôt.',
  'Area not found.': 'Zone introuvable.',
  'Hub not found.': 'Entrepôt introuvable.',
  'Choose at least one area.': 'Choisissez au moins une zone.',
  'Flat delivery fee must be a number between 0 and 500.': 'Les frais de livraison forfaitaires doivent être un nombre compris entre 0 et 500.',
  'An area with this name already exists here.': 'Une zone portant ce nom existe déjà ici.',
  'An area with this code already exists.': 'Une zone portant ce code existe déjà.',
  'Level must be one of: country, province, city, district, commune, quartier.':
      'Le niveau doit être l’un des suivants : pays, province, ville, district, commune, quartier.',
  'Active must be true or false.': 'La valeur « actif » doit être vraie ou fausse.',
  'A warehouse cannot cover an area it is not allowed to serve.': 'Un entrepôt ne peut pas couvrir une zone qu’il n’est pas autorisé à desservir.',
  // routing and checkout
  'Address not found.': 'Adresse introuvable.', // `delivery:quote` with an address id the account does not have (not listed in the contract)
  'Delivery between cities is not available right now.': 'La livraison entre villes n’est pas disponible pour le moment.',
  'One seller in your cart cannot ship from their area yet.': 'Un vendeur de votre panier ne peut pas encore expédier depuis sa zone.',
  'Your pickup area is not served yet. You can prepare your store; sales open when we deliver there.':
      'Votre zone de ramassage n’est pas encore desservie. Vous pouvez préparer votre boutique ; les ventes ouvriront dès que nous livrerons dans cette zone.',
  // transfers between warehouses (lanes and transfer runs)
  'These warehouses are not connected by any lane.': 'Ces entrepôts ne sont reliés par aucune ligne.',
  'A lane connects two different warehouses.': 'Une ligne relie deux entrepôts différents.',
  'Lane not found.': 'Ligne introuvable.',
  'Transit time (hours) must be a number between 0 and 720.': 'Le temps de transit (en heures) doit être un nombre compris entre 0 et 720.',
  'Lane cost must be a number between 0 and 1000.': 'Le coût de la ligne doit être un nombre compris entre 0 et 1000.',
  'Bidirectional must be true or false.': 'La valeur « bidirectionnelle » doit être vraie ou fausse.',
  'This run has already left.': 'Cette tournée est déjà partie.',
  'This run has not left yet.': 'Cette tournée n’est pas encore partie.',
  'This run is already closed.': 'Cette tournée est déjà clôturée.',
  'Run not found.': 'Tournée introuvable.',
  // staff:setActive (admin only; listed by the contract, so every client knows them)
  'Super admin only.': 'Réservé au super administrateur.',
  'Only riders and warehouse staff can be switched on or off here.': 'Seuls les livreurs et le personnel d’entrepôt peuvent être activés ou désactivés ici.',
  'Only parcels waiting at this warehouse can join this run.': 'Seuls les colis en attente dans cet entrepôt peuvent rejoindre cette tournée.',
  'Choose at least one parcel.': 'Choisissez au moins un colis.',
  'Choose parcels of this run.': 'Choisissez des colis de cette tournée.',
  'Choose some of the parcels of this run, not all of them.': 'Choisissez une partie des colis de cette tournée, pas tous.',
  'That parcel is not in this run.': 'Ce colis ne fait pas partie de cette tournée.',
  'Choose a driver for this run first.': 'Choisissez d’abord un livreur pour cette tournée.',
  'This run has no parcels left to send.': 'Cette tournée n’a plus de colis à envoyer.',
  'This rider works at another warehouse.': 'Ce livreur travaille dans un autre entrepôt.',
  'This parcel is part of a transfer run. Manage it from the run.': 'Ce colis fait partie d’une tournée de transfert. Gérez-le depuis la tournée.',
  'Status must be in_transit.': 'Le statut doit être « en transit ».',
  // desk errors reused by the transfer screens
  'Only supervisors and managers can assign riders.': 'Seuls les superviseurs et les responsables peuvent attribuer des livreurs.',
  'This task belongs to another warehouse.': 'Cette tâche appartient à un autre entrepôt.',
  'This parcel is not due at your warehouse.': 'Ce colis n’est pas attendu dans votre entrepôt.',
  'Your account is not linked to a warehouse. Ask an administrator.': 'Votre compte n’est lié à aucun entrepôt. Demandez à un administrateur.',
  'Choose a warehouse.': 'Choisissez un entrepôt.',
};

/// `We don't deliver to {area} yet.` (the server writes the straight apostrophe); group 1 is the area.
final RegExp kNotServedPattern = RegExp(r"^We don['’]t deliver to (.+) yet\.$");

/// What the server writes for {area} when nothing at all could be matched.
const String kNotServedUnnamed = 'this area';

/// The levels of the geography in French, for "A {level} cannot be added under a {level}." (unknown levels pass through).
String _levelFr(String level) => switch (level) {
      'country' => 'pays',
      'province' => 'province',
      'city' => 'ville',
      'district' => 'district',
      'commune' => 'commune',
      'quartier' => 'quartier',
      _ => level,
    };

final List<(RegExp, String Function(RegExpMatch))> kServerPatternsAreas = [
  // "We don't deliver to this area yet." (nothing matched) before the one that names an area
  (RegExp("^We don['’]t deliver to $kNotServedUnnamed yet\\.\$"), (m) => 'Nous ne livrons pas encore à cette zone.'),
  (kNotServedPattern, (m) => 'Nous ne livrons pas encore à ${m[1]}.'),
  (RegExp(r'^Parcel missing from run (.+)\.$'), (m) => 'Colis manquant dans la tournée ${m[1]}.'),
  (RegExp(r'^This area is already covered by (.+)\.$'), (m) => 'Cette zone est déjà couverte par ${m[1]}.'),
  (RegExp(r'^An? (\w+) cannot be added under an? (\w+)\.$'),
      (m) => 'Un niveau « ${_levelFr(m[1]!)} » ne peut pas être ajouté sous un niveau « ${_levelFr(m[2]!)} ».'),
];
