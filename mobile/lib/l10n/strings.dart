class Strings {
  final String lang;
  Strings(this.lang);
  bool get isFr => lang == 'fr';

  String get brand => 'LipCart';
  String get home => isFr ? 'Accueil' : 'Home';
  String get categories => isFr ? 'Catégories' : 'Categories';
  String get deals => isFr ? 'Offres' : 'Deals';
  String get account => isFr ? 'Compte' : 'Account';
  String get search => isFr ? 'Rechercher...' : 'Search products...';
  String get flashSale => isFr ? 'Vente flash' : 'Flash Sale';
  String get trending => isFr ? 'Tendances' : 'Trending';
  String get shopNow => isFr ? 'Acheter' : 'Shop Now';
  String get prototype => isFr ? 'Mode prototype' : 'Prototype Mode';
  String get orders => isFr ? 'Commandes' : 'Orders';
  String get wishlist => isFr ? 'Favoris' : 'Wishlist';
  String get wallet => isFr ? 'Portefeuille' : 'Wallet';
  String get settings => isFr ? 'Paramètres' : 'Settings';
  String get language => isFr ? 'Langue' : 'Language';
  String get addToCart => isFr ? 'Ajouter' : 'Add to Cart';
  String get buyNow => isFr ? 'Acheter' : 'Buy Now';
  String get endsIn => isFr ? 'Se termine dans' : 'Ends in';
}
