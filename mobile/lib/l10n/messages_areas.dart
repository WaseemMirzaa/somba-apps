// UI texts for: delivery areas (the address form's pickers, the not-served notices). key -> (English, French);
// placeholders are written {name}.
// ignore_for_file: prefer_single_quote_strings

const Map<String, (String, String)> kMessagesAreas = {
  'area_title': ('Delivery area', 'Zone de livraison'),
  'area_province': ('Province', 'Province'),
  'area_city': ('City', 'Ville'),
  'area_commune': ('Commune', 'Commune'),
  'area_quartier': ('Neighbourhood (optional)', 'Quartier (facultatif)'),
  'area_choose': ('Choose', 'Choisir'),
  'area_sheet_province': ('Choose a province', 'Choisissez une province'),
  'area_sheet_city': ('Choose a city', 'Choisissez une ville'),
  'area_sheet_commune': ('Choose a commune', 'Choisissez une commune'),
  'area_sheet_quartier': ('Choose a neighbourhood', 'Choisissez un quartier'),
  'area_coming_soon': ('Coming soon', 'Bientôt'),
  'area_search': ('Search', 'Rechercher'),
  'area_none_found': ('No match.', 'Aucun résultat.'),
  'area_load_failed': ('The areas could not be loaded. Try again.', 'Impossible de charger les zones. Réessayez.'),
  'area_from_pin': ('Filled in from your pin. Change it if it is wrong.', 'Rempli d’après la position épinglée. Corrigez-le si besoin.'),
  'area_no_match': ('We could not tell your area from the pin. Choose it below.', 'Nous n’avons pas pu déterminer votre zone d’après le repère. Choisissez-la ci-dessous.'),
  'area_not_served': ('We don’t deliver to {area} yet.', 'Nous ne livrons pas encore à {area}.'),
  'area_not_served_generic': ('We don’t deliver to this address yet.', 'Nous ne livrons pas encore à cette adresse.'),
  'area_deliver_in': ('We currently deliver in: {cities}', 'Nous livrons actuellement à : {cities}'),
  'area_partial_hint': ('Only part of {area} is served. Choose a more precise area below.', 'Seule une partie de {area} est desservie. Choisissez une zone plus précise ci-dessous.'),
  'area_not_served_save': ('You can still save this address.', 'Vous pouvez quand même enregistrer cette adresse.'),
  'area_not_served_badge': ('Not served yet', 'Pas encore desservie'),
  'area_change_address': ('Change address', 'Changer d’adresse'),
  'coverage_title': ('Areas we cover', 'Zones couvertes'),
  'coverage_more': ('+{n} more', '+{n} autres'),
  'coverage_none': ('No area assigned yet.', 'Aucune zone attribuée pour le moment.'),
};
