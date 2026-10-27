import 'strings.dart';

/// Server errors reach the app in English. The common ones are shown in the
/// user's language; any other message is displayed as received.
String translateServerError(String raw, Strings s) {
  if (!s.isFr) return raw;
  final text = raw.trim();
  final exact = _exactFr[text];
  if (exact != null) return exact;
  for (final p in _patternsFr) {
    final m = p.$1.firstMatch(text);
    if (m != null) return p.$2(m);
  }
  return raw;
}

/// Exposed for tests: every English message the client knows how to translate.
Iterable<String> get knownServerErrors => _exactFr.keys;

final Map<String, String> _exactFr = {
  // delivery areas and warehouse coverage (docs/contracts/areas.md, "Errors": geography and coverage)
  'Choose where this warehouse is.': 'Choisissez l’emplacement de cet entrepôt.',
  'Area not found.': 'Zone introuvable.',
  'Hub not found.': 'Entrepôt introuvable.',
  'Choose at least one area.': 'Choisissez au moins une zone.',
  'Flat delivery fee must be a number between 0 and 500.': 'Le tarif de livraison forfaitaire doit être un nombre compris entre 0 et 500.',
  'An area with this name already exists here.': 'Une zone portant ce nom existe déjà ici.',
  'An area with this code already exists.': 'Une zone avec ce code existe déjà.',
  'Level must be one of: country, province, city, district, commune, quartier.':
      'Le niveau doit être l’un des suivants : pays, province, ville, district, commune, quartier.',
  'Active must be true or false.': 'La valeur « actif » doit être vrai ou faux.',
  'A warehouse cannot cover an area it is not allowed to serve.': 'Un entrepôt ne peut pas couvrir une zone qu’il n’est pas autorisé à desservir.',
  // routing and checkout
  'Delivery between cities is not available right now.': 'La livraison entre villes n’est pas disponible pour le moment.',
  'One seller in your cart cannot ship from their area yet.': 'Un vendeur de votre panier ne peut pas encore expédier depuis sa zone.',
  'Your pickup area is not served yet. You can prepare your store; sales open when we deliver there.':
      'Votre zone de ramassage n’est pas encore desservie. Vous pouvez préparer votre boutique ; les ventes ouvriront dès que nous livrerons dans cette zone.',
  // transfers between warehouses (lanes and transfer runs)
  'These warehouses are not connected by any lane.': 'Ces entrepôts ne sont reliés par aucune ligne.',
  'A lane connects two different warehouses.': 'Une ligne relie deux entrepôts différents.',
  'Lane not found.': 'Ligne introuvable.',
  'Transit time (hours) must be a number between 0 and 720.': 'La durée de transit (en heures) doit être un nombre compris entre 0 et 720.',
  'Lane cost must be a number between 0 and 1000.': 'Le coût de la ligne doit être un nombre compris entre 0 et 1000.',
  'Bidirectional must be true or false.': 'L’option « dans les deux sens » doit être vrai ou faux.',
  'This run has already left.': 'Cette tournée est déjà partie.',
  'This run has not left yet.': 'Cette tournée n’est pas encore partie.',
  'This run is already closed.': 'Cette tournée est déjà clôturée.',
  'Run not found.': 'Tournée introuvable.',
  'Only parcels waiting at this warehouse can join this run.': 'Seuls les colis en attente dans cet entrepôt peuvent rejoindre cette tournée.',
  'Choose at least one parcel.': 'Choisissez au moins un colis.',
  'Choose parcels of this run.': 'Choisissez des colis de cette tournée.',
  'Choose some of the parcels of this run, not all of them.': 'Choisissez une partie des colis de cette tournée, pas tous.',
  'That parcel is not in this run.': 'Ce colis ne fait pas partie de cette tournée.',
  'Choose a driver for this run first.': 'Choisissez d’abord un livreur pour cette tournée.',
  'This run has no parcels left to send.': 'Cette tournée n’a plus aucun colis à envoyer.',
  'This parcel is part of a transfer run. Manage it from the run.': 'Ce colis fait partie d’une tournée de transfert. Gérez-le depuis la tournée.',
  'Status must be in_transit.': 'Le statut doit être « en route ».',
  // areas contract, second pass (docs/contracts/areas.md, "Errors"): validation, warehouse directory, addresses and desk sentences the first list omitted
  "Flatten must be 'commune'.": 'Le paramètre « flatten » doit être « commune ».',
  'Aliases must be a list of names.': 'Les alias doivent être une liste de noms.',
  'Alias must be 1-100 characters.': 'Un alias doit contenir entre 1 et 100 caractères.',
  'Name must be 2-150 characters.': 'Le nom doit contenir entre 2 et 150 caractères.',
  'English name must be 2-150 characters.': 'Le nom anglais doit contenir entre 2 et 150 caractères.',
  'Google name must be 1-150 characters.': 'Le nom Google doit contenir entre 1 et 150 caractères.',
  'Google name (English) must be 1-150 characters.': 'Le nom Google (anglais) doit contenir entre 1 et 150 caractères.',
  'Code must be 2-64 characters.': 'Le code doit contenir entre 2 et 64 caractères.',
  'Code may only contain letters, digits and hyphens.': 'Le code ne peut contenir que des lettres, des chiffres et des tirets.',
  'Order must be a whole number between 0 and 100000.': 'L’ordre d’affichage doit être un nombre entier compris entre 0 et 100000.',
  'A hub with this name already exists.': 'Un entrepôt portant ce nom existe déjà.',
  'You cannot deactivate the last active hub.': 'Vous ne pouvez pas désactiver le dernier entrepôt actif.',
  'Hub must be 1-64 characters.': 'L’identifiant de l’entrepôt doit contenir entre 1 et 64 caractères.',
  'Hub name must be 2-100 characters.': 'Le nom de l’entrepôt doit contenir entre 2 et 100 caractères.',
  'City must be 2-100 characters.': 'La ville doit contenir entre 2 et 100 caractères.',
  'Country must be 1-100 characters.': 'Le pays doit contenir entre 1 et 100 caractères.',
  'Address must be 3-200 characters.': 'L’adresse doit contenir entre 3 et 200 caractères.',
  'Capacity must be a whole number between 1 and 1000000.': 'La capacité doit être un nombre entier compris entre 1 et 1000000.',
  'Tier must be one of: operator, supervisor, manager.': 'Le niveau doit être l’un des suivants : opérateur, superviseur, responsable.',
  'Address not found.': 'Adresse introuvable.',
  'Street address and city are required.': 'La rue et la ville sont obligatoires.',
  'This parcel is not due at a warehouse.': 'Ce colis n’est attendu dans aucun entrepôt.',
  'This parcel does not leave from a warehouse.': 'Ce colis ne part d’aucun entrepôt.',
  'A rider must collect this parcel before it can be scanned in.': 'Un livreur doit d’abord récupérer ce colis avant qu’il puisse être scanné.',
  'Case must be 1-64 characters.': 'Le numéro de dossier doit contenir entre 1 et 64 caractères.',
  'A replacement or an exchange is required.': 'Un remplacement ou un échange est requis.',
  'Replacement not found.': 'Remplacement introuvable.',
  // sign-in / account
  'Invalid email or password.': 'E-mail ou mot de passe incorrect.',
  'Invalid or expired refresh token.': 'Votre session a expiré. Reconnectez-vous.',
  'Session has been revoked.': 'Votre session a été fermée. Reconnectez-vous.',
  'Sign in to continue.': 'Connectez-vous pour continuer.',
  'Signed out.': 'Vous avez été déconnecté.',
  'This account has been suspended. Contact support.': 'Ce compte est suspendu. Contactez l’assistance.',
  'Account no longer exists.': 'Ce compte n’existe plus.',
  'Account not found.': 'Compte introuvable.',
  'User not found.': 'Utilisateur introuvable.',
  'An account with this email already exists.': 'Un compte existe déjà avec cet e-mail.',
  'That account type cannot be created by self-registration.': 'Ce type de compte ne peut pas être créé par inscription libre.',
  'Password is incorrect.': 'Mot de passe incorrect.',
  'Current password is incorrect.': 'Le mot de passe actuel est incorrect.',
  'Password must be at least 8 characters.': 'Le mot de passe doit contenir au moins 8 caractères.',
  'New password must be at least 8 characters.': 'Le nouveau mot de passe doit contenir au moins 8 caractères.',
  'Enter a valid email.': 'Saisissez un e-mail valide.',
  'Enter a valid phone number.': 'Saisissez un numéro de téléphone valide.',
  'Enter a valid mobile-money phone number, e.g. +243 81 234 5678.': 'Saisissez un numéro mobile money valide, par ex. +243 81 234 5678.',
  'Add a phone number to your profile first.': 'Ajoutez d’abord un numéro de téléphone à votre profil.',
  'Name must be 2–80 characters.': 'Le nom doit contenir entre 2 et 80 caractères.',
  'Locale must be en or fr.': 'La langue doit être « en » ou « fr ».',
  'Invalid or expired link.': 'Lien invalide ou expiré.',
  'Incorrect code.': 'Code incorrect.',
  'Code expired or too many attempts. Request a new code.': 'Code expiré ou trop de tentatives. Demandez un nouveau code.',
  'Please wait before requesting another code.': 'Patientez avant de demander un nouveau code.',
  'Please wait before requesting another email.': 'Patientez avant de demander un nouvel e-mail.',
  // permissions / generic
  'Not allowed.': 'Action non autorisée.',
  'Customers only.': 'Réservé aux clients.',
  'Riders only.': 'Réservé aux livreurs.',
  'Sellers only.': 'Réservé aux vendeurs.',
  'Staff only.': 'Réservé au personnel.',
  'Admins only.': 'Réservé aux administrateurs.',
  'Ops only.': 'Réservé aux opérations.',
  'Too many requests — slow down.': 'Trop de requêtes. Veuillez ralentir.',
  'Too many attempts. Please wait a minute.': 'Trop de tentatives. Patientez une minute.',
  'Payload too large.': 'Données trop volumineuses.',
  'This request was already handled.': 'Cette demande a déjà été traitée.',
  // delivery (rider)
  'Delivery task not found.': 'Livraison introuvable.',
  'This delivery is no longer available.': 'Cette livraison n’est plus disponible.',
  'This delivery was just updated. Refresh and try again.': 'Cette livraison vient d’être mise à jour. Actualisez et réessayez.',
  'Wrong delivery code. Ask the customer for the 4-digit code shown in their app.':
      'Code de livraison incorrect. Demandez au client le code à 4 chiffres affiché dans son application.',
  'This order has no delivery waiting for pickup.': 'Cette commande n’a aucune livraison en attente de ramassage.',
  'Invalid delivery status.': 'Statut de livraison invalide.',
  'Choose an active rider.': 'Choisissez un livreur actif.',
  // tasks, legs and warehouses (docs/contracts/logistics.md section 10)
  'Your warehouse assigns your tasks. You cannot accept a task yourself.': 'Votre entrepôt vous assigne vos tâches. Vous ne pouvez pas en accepter une vous-même.',
  'Your account is not linked to a warehouse. Ask an administrator.': 'Votre compte n’est pas rattaché à un entrepôt. Contactez un administrateur.',
  'Only supervisors and managers can assign riders.': 'Seuls les superviseurs et les responsables peuvent assigner des livreurs.',
  'Only managers can change staff tiers.': 'Seuls les responsables peuvent modifier les niveaux du personnel.',
  'Only managers can see the staff list.': 'Seuls les responsables peuvent voir la liste du personnel.',
  'Only an administrator can make someone a manager.': 'Seul un administrateur peut nommer un responsable.',
  'You cannot change your own tier.': 'Vous ne pouvez pas modifier votre propre niveau.',
  'This person works at another warehouse.': 'Cette personne travaille dans un autre entrepôt.',
  'Only warehouse staff have a tier.': 'Seul le personnel d’entrepôt a un niveau.',
  'This task belongs to another warehouse.': 'Cette tâche appartient à un autre entrepôt.',
  'This rider works at another warehouse.': 'Ce livreur travaille dans un autre entrepôt.',
  'This parcel is not due at your warehouse.': 'Ce colis n’est pas attendu dans votre entrepôt.',
  'This parcel was already scanned in.': 'Ce colis a déjà été scanné.',
  'A failed task cannot be scanned in.': 'Une tâche échouée ne peut pas être scannée.',
  'This task is finished by the rider, not scanned in.': 'Cette tâche est terminée par le livreur, pas par un scan.',
  'This leg ends at the warehouse: warehouse staff scan the parcel in.': 'Cette étape se termine à l’entrepôt : le personnel de l’entrepôt scanne le colis.',
  'This parcel does not leave from your warehouse.': 'Ce colis ne part pas de votre entrepôt.',
  'Assign a rider before handing the parcel over.': 'Assignez un livreur avant de lui remettre le colis.',
  'Pin your delivery address on the map.': 'Placez votre adresse de livraison sur la carte.',
  'Delivery is not available right now: no warehouse is open.': 'La livraison n’est pas disponible pour le moment : aucun entrepôt n’est ouvert.',
  'Place the warehouse on the map: latitude and longitude are required.': 'Placez l’entrepôt sur la carte : la latitude et la longitude sont obligatoires.',
  'Enter a valid latitude (-90 to 90) and longitude (-180 to 180).': 'Saisissez une latitude (-90 à 90) et une longitude (-180 à 180) valides.',
  'Enter a valid pickup location: latitude -90 to 90 and longitude -180 to 180.': 'Saisissez un lieu de collecte valide : latitude de -90 à 90 et longitude de -180 à 180.',
  'Pin your pickup location on the map (Store settings) before listing products.': 'Placez votre lieu de collecte sur la carte (paramètres de la boutique) avant de publier des produits.',
  'Riders and warehouse staff must belong to a warehouse. Pick one from the list.': 'Les livreurs et le personnel d’entrepôt doivent être rattachés à un entrepôt. Choisissez-en un dans la liste.',
  'Pick an active warehouse from the list.': 'Choisissez un entrepôt actif dans la liste.',
  'Choose a warehouse.': 'Choisissez un entrepôt.',
  'This order has no destination warehouse.': 'Cette commande n’a pas d’entrepôt de destination.',
  'One of the returned items is not on this order.': 'Un des articles retournés ne figure pas sur cette commande.',
  // support (docs/contracts/after-sale.md sections 6 and 11) and photo uploads
  'Subject and message are required.': 'Le sujet et le message sont obligatoires.',
  'Write a message first.': 'Écrivez d’abord un message.',
  'Ticket not found.': 'Ticket introuvable.',
  'Order not found.': 'Commande introuvable.',
  'Photos must be a list of uploaded images.': 'Les photos doivent être des images envoyées depuis l’application.',
  'Photos must be images uploaded through the app.': 'Les photos doivent être des images envoyées depuis l’application.',
  'Only JPEG, PNG or WebP images are allowed.': 'Seules les images JPEG, PNG ou WebP sont acceptées.',
  'Only JPEG, PNG, WebP or HEIC images are allowed.': 'Seules les images JPEG, PNG, WebP ou HEIC sont acceptées.',
  'No file uploaded (field name "file").': 'Aucun fichier envoyé.',
  'File too large': 'Fichier trop volumineux (5 Mo maximum).',
  'A valid device token is required.': 'Un jeton d’appareil valide est requis.',
  // network (generated on the device)
  'Socket not connected.': 'Pas de connexion au serveur.',
};

final List<(RegExp, String Function(RegExpMatch))> _patternsFr = [
  (RegExp(r'^Parcel missing from run (.+)\.$'), (m) => 'Colis manquant dans la tournée ${m[1]}.'),
  // `{area}` is the area's official name, or `this area` when nothing could be matched
  (RegExp(r"^We don['’]t deliver to (.+) yet\.$"), (m) => m[1] == 'this area' ? 'Nous ne livrons pas encore dans cette zone.' : 'Nous ne livrons pas encore à ${m[1]}.'),
  (RegExp(r'^An? (\w+) cannot be added under an? (\w+)\.$'), (m) => 'Le niveau « ${_areaLevel(m[1]!)} » ne peut pas être ajouté sous le niveau « ${_areaLevel(m[2]!)} ».'),
  (RegExp(r'^This area is already covered by (.+)\.$'), (m) => 'Cette zone est déjà couverte par ${m[1]}.'),
  (RegExp(r'^A (.+) delivery cannot become (.+)\.$'), (m) => 'Une livraison « ${_taskStatus(m[1]!)} » ne peut pas passer à « ${_taskStatus(m[2]!)} ».'),
  (RegExp(r'^You can attach up to (\d+) photos\.$'), (m) => 'Vous pouvez joindre jusqu’à ${m[1]} photos.'),
  (RegExp(r'^Request failed \((\d+)\)\.$'), (m) => 'La requête a échoué (${m[1]}).'),
  (RegExp(r'^email must be an email$'), (m) => 'Saisissez un e-mail valide.'),
  (RegExp(r'^password must be longer than or equal to (\d+) characters$'), (m) => 'Le mot de passe doit contenir au moins ${m[1]} caractères.'),
  (RegExp(r'^(\w+) should not be empty$'), (m) => 'Un champ obligatoire est vide.'),
];

String _areaLevel(String s) => switch (s) {
      'country' => 'pays',
      'province' => 'province',
      'city' => 'ville',
      'district' => 'district',
      'commune' => 'commune',
      'quartier' => 'quartier',
      _ => s,
    };

String _taskStatus(String s) => switch (s) {
      'unassigned' => 'disponible',
      'assigned' => 'assignée',
      'picked up' => 'récupérée',
      'in transit' => 'en route',
      'delivered' => 'livrée',
      'failed' => 'échouée',
      _ => s,
    };
