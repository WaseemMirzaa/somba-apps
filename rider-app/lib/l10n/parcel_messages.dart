// The texts of parcel scanning (the rider scans every box at pickup and drop-off): key -> (English, French). Spread into
// `kMessages` (messages.dart), typed accessors in parcel_strings.dart.

const Map<String, (String, String)> kParcelMessages = {
  'parcel_scan_title': ('Scan parcels', 'Scanner les colis'),
  'parcel_scan_btn': ('Scan parcels ({done} of {total})', 'Scanner les colis ({done} sur {total})'),
  'parcel_stage_pickup': ('Pickup scan', 'Scan au ramassage'),
  'parcel_stage_dropoff': ('Drop-off scan', 'Scan à la remise'),
  'parcel_counter': ('{done} of {total} scanned', '{done} sur {total} scannés'),
  'parcel_counter_one': ('{done} of {total} scanned', '{done} sur {total} scanné'),
  'parcel_all_done': ('All parcels scanned', 'Tous les colis sont scannés'),
  'parcel_list_title': ('Parcels', 'Colis'),
  'parcel_box': ('Box {n}/{count}', 'Boîte {n}/{count}'),
  'parcel_single': ('Parcel', 'Colis'),
  'parcel_done': ('scanned', 'scanné'),
  'parcel_todo': ('to scan', 'à scanner'),
  'parcel_need_pickup': ('Scan every parcel before you mark it picked up.', 'Scannez chaque colis avant de le marquer comme récupéré.'),
  'parcel_need_dropoff': ('Scan every parcel before you hand it over.', 'Scannez chaque colis avant la remise.'),
  'parcel_need_road': ('Scan every parcel before you set off.', 'Scannez chaque colis avant de partir.'),
  'parcel_aim': ('Point the camera at the QR code on the KOMORIKO label.', 'Visez le code QR de l’étiquette KOMORIKO avec la caméra.'),
  'parcel_type_label': ('Type the code', 'Saisir le code'),
  'parcel_type_hint': ('Example: PKG-7KQ2M9XA', 'Exemple : PKG-7KQ2M9XA'),
  'parcel_type_submit': ('Check code', 'Valider le code'),
  'parcel_finish': ('Done', 'Terminer'),
  'parcel_scanned_ok': ('{code} scanned ({done} of {total}).', '{code} scanné ({done} sur {total}).'),
  'parcel_already': ('{code} is already scanned.', '{code} est déjà scanné.'),
  'parcel_complete_msg': ('All parcels scanned. You can continue.', 'Tous les colis sont scannés. Vous pouvez continuer.'),
  'parcel_cam_denied_title': ('Camera access is off', 'L’accès à la caméra est désactivé'),
  'parcel_cam_denied_body': ('Allow the camera in your phone settings to scan labels, or type the code below.', 'Autorisez la caméra dans les réglages du téléphone pour scanner les étiquettes, ou saisissez le code ci-dessous.'),
  'parcel_cam_unavailable': ('The camera could not start. Type the code below instead.', 'La caméra n’a pas pu démarrer. Saisissez le code ci-dessous à la place.'),
  'parcel_open_settings': ('Open settings', 'Ouvrir les réglages'),
  'parcel_torch': ('Flashlight', 'Lampe torche'),
  // contents of the box set, sibling legs (one stop), and what a scanned box is (`parcels:resolve`)
  'parcel_contents_title': ('In the parcels', 'Dans les colis'),
  'stop_orders_pill': ('{n} orders', '{n} commandes'),
  'stop_orders_line': ('Same address: {refs}', 'Même adresse : {refs}'),
  'stop_one_scan': ('One scan ticks the box for every order.', 'Un seul scan valide la boîte pour toutes les commandes.'),
  'stop_one_code': ('One delivery code for all {n} orders.', 'Un seul code de livraison pour les {n} commandes.'),
  'stop_all_ok': ('{text} ({n} orders)', '{text} ({n} commandes)'),
  'stop_partial': ('Done for {ok} of {total} orders. Not done: {failed}', 'Fait pour {ok} sur {total} commandes. Non fait : {failed}'),
  'parcel_res_loading': ('Looking up the box…', 'Recherche de la boîte…'),
  'parcel_res_store': ('Store: {name}', 'Boutique : {name}'),
  'parcel_res_area': ('To: {area}', 'Vers : {area}'),
  'parcel_res_voided': ('This label was cancelled. Use the new one.', 'Cette étiquette a été annulée. Utilisez la nouvelle.'),
  'parcel_res_orders': ('Orders', 'Commandes'),
  'parcel_res_legs': ('Legs', 'Étapes'),
  'parcel_settings_failed': ('Could not open the settings. Open them from your phone.', 'Impossible d’ouvrir les réglages. Ouvrez-les depuis votre téléphone.'),
};

/// The server's own messages for parcel scanning (always English), in French. The ones that carry a code or a leg are patterns
/// in server_errors.dart.
const Map<String, String> kParcelServerErrorsFr = {
  'That is not a KOMORIKO parcel code. Codes look like PKG-7KQ2M9XA.': 'Ce n’est pas un code colis KOMORIKO. Les codes ressemblent à PKG-7KQ2M9XA.',
  'This leg is already closed.': 'Cette étape est déjà clôturée.',
  'Stage must be pickup or dropoff.': 'L’étape doit être le ramassage ou la remise.',
  'Parcel not found.': 'Colis introuvable.',
  // same-day parcel groups (docs/contracts/logistics.md section 19): the seller-side refusals, in case a rider also holds a seller role
  'Choose at least one order to pack.': 'Choisissez au moins une commande à préparer.',
  'These orders cannot share a label: they differ in customer, day, delivery address or delivery mode.':
      'Ces commandes ne peuvent pas partager une étiquette : le client, le jour, l’adresse de livraison ou le mode de livraison diffèrent.',
  'A rider already collected these boxes. The orders in them cannot change; pack the other orders in a new set.':
      'Un livreur a déjà récupéré ces boîtes. Les commandes qu’elles contiennent ne peuvent plus changer ; préparez les autres commandes dans un nouvel ensemble.',
  'Orders with several sellers keep their own labels: they cannot be packed together.':
      'Les commandes de plusieurs vendeurs gardent leurs propres étiquettes : elles ne peuvent pas être préparées ensemble.',
  'A label set needs at least one order.': 'Un ensemble d’étiquettes doit contenir au moins une commande.',
};
