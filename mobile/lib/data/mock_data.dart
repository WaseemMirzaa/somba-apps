class Product {
  final int id;
  final String name;
  final String nameFr;
  final double price;
  final double originalPrice;
  final int discount;
  final double rating;
  final int reviews;
  final String image;
  final String category;

  const Product({
    required this.id,
    required this.name,
    required this.nameFr,
    required this.price,
    required this.originalPrice,
    required this.discount,
    required this.rating,
    required this.reviews,
    required this.image,
    required this.category,
  });

  String displayName(String lang) => lang == 'fr' ? nameFr : name;
}

class Category {
  final int id;
  final String name;
  final String nameFr;
  final String image;

  const Category({required this.id, required this.name, required this.nameFr, required this.image});

  String displayName(String lang) => lang == 'fr' ? nameFr : name;
}

const categories = [
  Category(id: 1, name: 'Electronics', nameFr: 'Électronique', image: ''),
  Category(id: 2, name: 'Fashion', nameFr: 'Mode', image: ''),
  Category(id: 3, name: 'Jewelery', nameFr: 'Bijoux', image: ''),
];

// Real professional catalogue photos are bundled in assets/products/<id>.jpg.
// The `image` URLs are the same photos, used as an online fallback on device.
const _img = 'https://raw.githubusercontent.com/keikaavousi/fake-store-api/master/public/img';

const products = [
  Product(id: 1, name: 'Fjällräven Foldsack No.1 Backpack', nameFr: 'Sac à dos Fjällräven Foldsack N°1', price: 110, originalPrice: 140, discount: 21, rating: 3.9, reviews: 120, image: '$_img/81fPKd-2AYL._AC_SL1500_.jpg', category: 'Fashion'),
  Product(id: 2, name: 'Mens Casual Premium Slim Fit T-Shirt', nameFr: 'T-shirt slim premium homme', price: 22, originalPrice: 30, discount: 26, rating: 4.1, reviews: 259, image: '$_img/71-3HjGNDUL._AC_SY879._SX._UX._SY._UY_.jpg', category: 'Fashion'),
  Product(id: 3, name: 'Mens Cotton Jacket', nameFr: 'Veste en coton homme', price: 56, originalPrice: 70, discount: 20, rating: 4.7, reviews: 500, image: '$_img/71li-ujtlUL._AC_UX679_.jpg', category: 'Fashion'),
  Product(id: 4, name: 'Mens Casual Slim Fit Shirt', nameFr: 'Chemise slim casual homme', price: 16, originalPrice: 25, discount: 36, rating: 4.0, reviews: 430, image: '$_img/71YXzeOuslL._AC_UY879_.jpg', category: 'Fashion'),
  Product(id: 5, name: 'John Hardy Gold & Silver Dragon Bracelet', nameFr: 'Bracelet Dragon or & argent John Hardy', price: 695, originalPrice: 780, discount: 11, rating: 4.6, reviews: 400, image: '$_img/71pWzhdJNwL._AC_UL640_QL65_ML3_.jpg', category: 'Jewelery'),
  Product(id: 6, name: 'Solid Gold Petite Micropavé Ring', nameFr: 'Bague micropavé en or', price: 168, originalPrice: 199, discount: 16, rating: 3.9, reviews: 70, image: '$_img/61sbMiUnoGL._AC_UL640_QL65_ML3_.jpg', category: 'Jewelery'),
  Product(id: 7, name: 'White Gold Plated Princess Earrings', nameFr: 'Boucles d\'oreilles plaqué or blanc', price: 10, originalPrice: 15, discount: 33, rating: 3.5, reviews: 400, image: '$_img/71YAIFU48IL._AC_UL640_QL65_ML3_.jpg', category: 'Jewelery'),
  Product(id: 8, name: 'Pierced Owl Rose Gold Earrings', nameFr: 'Boucles d\'oreilles hibou or rose', price: 11, originalPrice: 18, discount: 39, rating: 4.2, reviews: 100, image: '$_img/51UDEzMJVpL._AC_UL640_QL65_ML3_.jpg', category: 'Jewelery'),
  Product(id: 9, name: 'WD 2TB Elements Portable Hard Drive', nameFr: 'Disque dur portable WD 2 To', price: 64, originalPrice: 79, discount: 19, rating: 3.3, reviews: 203, image: '$_img/61IBBVJvSDL._AC_SY879_.jpg', category: 'Electronics'),
  Product(id: 10, name: 'SanDisk SSD PLUS 1TB Internal SSD', nameFr: 'SSD interne SanDisk PLUS 1 To', price: 109, originalPrice: 139, discount: 22, rating: 4.5, reviews: 470, image: '$_img/61U7T1koQqL._AC_SX679_.jpg', category: 'Electronics'),
  Product(id: 11, name: 'Silicon Power 256GB SSD 3D NAND', nameFr: 'SSD Silicon Power 256 Go', price: 109, originalPrice: 129, discount: 16, rating: 4.8, reviews: 319, image: '$_img/71kWymZ+c+L._AC_SX679_.jpg', category: 'Electronics'),
  Product(id: 12, name: 'Acer 21.5" Full HD IPS Monitor', nameFr: 'Écran Acer 21,5" Full HD IPS', price: 599, originalPrice: 699, discount: 14, rating: 4.3, reviews: 250, image: '$_img/81QpkIctqPL._AC_SX679_.jpg', category: 'Electronics'),
];

/// Number of catalogue products in a given category.
int categoryCount(String name) =>
    products.where((p) => p.category == name).length;
