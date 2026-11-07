// UI texts for: the cart, checkout and order summaries grouped by store, and the search box on a store page.
// key -> (English, French); placeholders are written {name}.
// ignore_for_file: prefer_single_quote_strings

const Map<String, (String, String)> kMessagesCartStore = {
  'store_subtotal': ('Store subtotal', 'Sous-total boutique'),
  'store_items_one': ('1 item', '1 article'),
  'store_items_many': ('{n} items', '{n} articles'),
  'store_other_items': ('Other items', 'Autres articles'),
  'store_group_open': ('Open {store}', 'Ouvrir {store}'),
  'order_split_note': (
    'Your order is packed in {n} packages, one per store. You pay once and get one delivery.',
    'Votre commande est préparée en {n} colis, un par boutique. Vous payez une fois et recevez une seule livraison.'
  ),
  'store_search_hint': ('Search in this store…', 'Rechercher dans cette boutique…'),
  'store_search_none': ('No product in this store matches “{q}”.', 'Aucun produit de cette boutique ne correspond à « {q} ».'),
};
