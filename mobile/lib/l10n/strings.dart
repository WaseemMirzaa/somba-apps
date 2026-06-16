class Strings {
  final String lang;
  Strings(this.lang);
  bool get isFr => lang == 'fr';

  // Brand
  String get brand => 'Somba';
  String get tagline => isFr ? 'Votre marketplace, réinventée' : 'Your marketplace, reimagined';

  // Navigation
  String get home => isFr ? 'Accueil' : 'Home';
  String get categories => isFr ? 'Catégories' : 'Categories';
  String get deals => isFr ? 'Offres' : 'Deals';
  String get account => isFr ? 'Compte' : 'Account';

  // Home
  String get search => isFr ? 'Rechercher des produits...' : 'Search products...';
  String get flashSale => isFr ? 'Vente flash' : 'Flash Sale';
  String get trending => isFr ? 'Tendances' : 'Trending';
  String get shopNow => isFr ? 'Acheter' : 'Shop Now';
  String get prototype => isFr ? 'Mode prototype' : 'Prototype';
  String get shopByCategory => isFr ? 'Par catégorie' : 'Shop by Category';
  String get recentlyViewed => isFr ? 'Vu récemment' : 'Recently Viewed';
  String get seeAll => isFr ? 'Tout voir' : 'See all';
  String get endsIn => isFr ? 'Se termine dans' : 'Ends in';
  String get freeDelivery => isFr ? 'Livraison gratuite' : 'Free delivery';
  String get securePayment => isFr ? 'Paiement sécurisé' : 'Secure payment';

  // Product
  String get reviews => isFr ? 'avis' : 'reviews';
  String get addToCart => isFr ? 'Ajouter' : 'Add to Cart';
  String get buyNow => isFr ? 'Acheter' : 'Buy Now';
  String get deliveryInDays => isFr ? 'Livraison en 2 jours' : 'Delivery in 2 days';
  String get description => isFr ? 'Description' : 'Description';
  String get productBlurb => isFr
      ? 'Produit authentique avec garantie vendeur. Retours sous 7 jours et support client dédié.'
      : 'Authentic product with seller warranty. 7-day returns and dedicated customer support.';
  String get addedToCart => isFr ? 'Ajouté au panier' : 'Added to cart';
  String get linkCopied => isFr ? 'Lien copié (démo)' : 'Link copied (mock)';

  // Cart
  String get cart => isFr ? 'Panier' : 'Cart';
  String get cartEmpty => isFr ? 'Votre panier est vide' : 'Your cart is empty';
  String get cartEmptyHint =>
      isFr ? 'Parcourez les offres et ajoutez vos articles favoris.' : 'Browse deals and add your favourite items.';
  String get startShopping => isFr ? 'Commencer mes achats' : 'Start shopping';
  String get subtotal => isFr ? 'Sous-total' : 'Subtotal';
  String get delivery => isFr ? 'Livraison' : 'Delivery';
  String get total => isFr ? 'Total' : 'Total';
  String get checkout => isFr ? 'Passer à la caisse' : 'Checkout';
  String get items => isFr ? 'articles' : 'items';

  // Checkout
  String get checkoutTitle => isFr ? 'Caisse' : 'Checkout';
  String get deliveryAddress => isFr ? 'Adresse de livraison' : 'Delivery Address';
  String get paymentMethod => isFr ? 'Mode de paiement' : 'Payment Method';
  String get orderSummary => isFr ? 'Récapitulatif' : 'Order Summary';
  String get placeOrder => isFr ? 'Confirmer la commande' : 'Place Order';
  String get payCard => isFr ? 'Carte bancaire' : 'Credit / Debit Card';
  String get payCod => isFr ? 'Paiement à la livraison' : 'Cash on Delivery';
  String get payMobile => isFr ? 'Airtel Money' : 'Airtel Money';
  String get payWallet => isFr ? 'Portefeuille Somba' : 'Somba Wallet';
  String get change => isFr ? 'Modifier' : 'Change';

  // Orders
  String get orders => isFr ? 'Commandes' : 'Orders';
  String get myOrders => isFr ? 'Mes commandes' : 'My Orders';
  String get noOrders => isFr ? 'Aucune commande pour le moment' : 'No orders yet';
  String get trackOrder => isFr ? 'Suivre la commande' : 'Track Order';
  String get orderConfirmed => isFr ? 'Commande confirmée !' : 'Order Confirmed!';
  String get orderConfirmedHint => isFr
      ? 'Merci ! Nous préparons votre commande pour la livraison.'
      : 'Thank you! We are preparing your order for delivery.';
  String get continueShopping => isFr ? 'Continuer mes achats' : 'Continue Shopping';

  // Order statuses
  String statusLabel(String status) {
    switch (status) {
      case 'delivered':
        return isFr ? 'Livré' : 'Delivered';
      case 'shipped':
        return isFr ? 'Expédié' : 'Shipped';
      case 'processing':
        return isFr ? 'En préparation' : 'Processing';
      default:
        return status;
    }
  }

  // Account
  String get wishlist => isFr ? 'Favoris' : 'Wishlist';
  String get wallet => isFr ? 'Portefeuille' : 'Wallet';
  String get addresses => isFr ? 'Adresses' : 'Addresses';
  String get payments => isFr ? 'Paiements' : 'Payments';
  String get settings => isFr ? 'Paramètres' : 'Settings';
  String get support => isFr ? 'Aide & support' : 'Help & Support';
  String get language => isFr ? 'Langue' : 'Language';
  String get member => isFr ? 'Membre Somba' : 'Somba Member';
  String get mockNotice => isFr ? 'Données simulées — sans backend' : 'Mock data — no backend';
  String get comingSoon => isFr ? 'Bientôt disponible (démo)' : 'Coming soon (mock)';
}
