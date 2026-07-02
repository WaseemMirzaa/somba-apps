import 'package:flutter/widgets.dart';
import 'fr_map.dart';

/// Central translation helper for the many per-screen labels that aren't part
/// of the [Strings] bundle. Returns the French entry when [lang] is `fr` and a
/// mapping exists; otherwise returns the English source unchanged (so a missing
/// key degrades gracefully to English rather than a blank).
String trl(String lang, String en) => lang == 'fr' ? (kFr[en] ?? en) : en;

/// Context-based variant — reads the active locale from [Localizations].
String tr(BuildContext context, String en) => trl(Localizations.localeOf(context).languageCode, en);

class Strings {
  final String lang;
  Strings(this.lang);
  bool get isFr => lang == 'fr';

  String get brand => 'Somba&Teka';
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

  String get seeAll => isFr ? 'Tout voir' : 'See all';
  String get recentlyViewed => isFr ? 'Vu récemment' : 'Recently Viewed';
  String get recommended => isFr ? 'Recommandé pour vous' : 'Recommended for you';
  String get freeDelivery => isFr ? 'Livraison gratuite' : 'Free delivery';
  String get heroTitle => isFr ? 'Votre marché,\nréinventé' : 'Your marketplace,\nreimagined';
  String get heroSubtitle => isFr ? 'Des milliers de produits livrés à votre porte.' : 'Thousands of products, delivered to your door.';
  String get deliverTo => isFr ? 'Livrer à' : 'Deliver to';
  String get cart => isFr ? 'Panier' : 'Cart';
  String get cartEmpty => isFr ? 'Votre panier est vide' : 'Your cart is empty';
  String get cartEmptyHint => isFr ? 'Ajoutez des articles pour commencer' : 'Add items to get started';
  String get startShopping => isFr ? 'Commencer mes achats' : 'Start shopping';
  String get checkout => isFr ? 'Passer à la caisse' : 'Checkout';
  String get subtotal => isFr ? 'Sous-total' : 'Subtotal';
  String get delivery => isFr ? 'Livraison' : 'Delivery';
  String get total => isFr ? 'Total' : 'Total';
  String get free => isFr ? 'Gratuit' : 'Free';
  String get promoHint => isFr ? 'Code promo' : 'Promo code';
  String get apply => isFr ? 'Appliquer' : 'Apply';
  String get placeOrder => isFr ? 'Confirmer la commande' : 'Place order';
  String get payment => isFr ? 'Paiement' : 'Payment';
  String get deliveryAddress => isFr ? 'Adresse de livraison' : 'Delivery address';
  String get orderSummary => isFr ? 'Résumé de la commande' : 'Order summary';
  String get description => isFr ? 'Description' : 'Description';
  String get selectVariant => isFr ? 'Choisir une option' : 'Select option';
  String get quantity => isFr ? 'Quantité' : 'Quantity';
  String get reviewsLabel => isFr ? 'avis' : 'reviews';
  String get inStock => isFr ? 'En stock' : 'In stock';
  String get addedToCart => isFr ? 'Ajouté au panier' : 'Added to cart';
  String get myOrders => isFr ? 'Mes commandes' : 'My Orders';
  String get help => isFr ? 'Aide & support' : 'Help & support';
  String get addresses => isFr ? 'Adresses' : 'Addresses';
  String get payments => isFr ? 'Moyens de paiement' : 'Payment methods';
  String get orderConfirmed => isFr ? 'Commande confirmée !' : 'Order Confirmed!';
  String get orderConfirmedHint => isFr ? 'Merci ! Votre commande est en préparation.' : 'Thank you! Your order is being prepared.';
  String get continueShopping => isFr ? 'Continuer les achats' : 'Continue shopping';
  String get trackOrder => isFr ? 'Suivre la commande' : 'Track order';
  String get topCategories => isFr ? 'Catégories populaires' : 'Top categories';
  String get items => isFr ? 'articles' : 'items';
  String itemsCount(int n) => isFr
      ? '$n article${n > 1 ? 's' : ''}'
      : '$n item${n == 1 ? '' : 's'}';

  String orderStatus(String status) {
    switch (status) {
      case 'pending':
        return isFr ? 'En attente' : 'Pending';
      case 'confirmed':
        return isFr ? 'Confirmé' : 'Confirmed';
      case 'processing':
        return isFr ? 'En préparation' : 'Processing';
      case 'shipped':
        return isFr ? 'Expédié' : 'Shipped';
      case 'out_for_delivery':
        return isFr ? 'En livraison' : 'Out for delivery';
      case 'delivered':
        return isFr ? 'Livré' : 'Delivered';
      case 'cancelled':
        return isFr ? 'Annulé' : 'Cancelled';
      case 'returned':
        return isFr ? 'Retourné' : 'Returned';
      default:
        return status;
    }
  }

  String paymentLabel(String m) {
    switch (m) {
      case 'stripe_card':
        return isFr ? 'Carte bancaire' : 'Credit / Debit Card';
      case 'cod':
        return isFr ? 'Paiement à la livraison' : 'Cash on Delivery';
      case 'airtel_money':
        return 'Airtel Money';
      case 'orange_money':
        return 'Orange Money';
      case 'vodacom_mpesa':
        return 'Vodacom M-Pesa';
      default:
        return m;
    }
  }
}
