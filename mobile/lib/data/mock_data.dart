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
  Category(id: 1, name: 'Electronics', nameFr: 'Électronique', image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=200&h=200&fit=crop'),
  Category(id: 2, name: 'Fashion', nameFr: 'Mode', image: 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=200&h=200&fit=crop'),
  Category(id: 3, name: 'Home', nameFr: 'Maison', image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=200&h=200&fit=crop'),
  Category(id: 4, name: 'Beauty', nameFr: 'Beauté', image: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=200&h=200&fit=crop'),
  Category(id: 5, name: 'Sports', nameFr: 'Sport', image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba9681?w=200&h=200&fit=crop'),
  Category(id: 6, name: 'Books', nameFr: 'Livres', image: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?w=200&h=200&fit=crop'),
];

const products = [
  Product(id: 1, name: 'Samsung Galaxy S24 Ultra', nameFr: 'Samsung Galaxy S24 Ultra', price: 1199, originalPrice: 1399, discount: 14, rating: 4.8, reviews: 2341, image: 'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400&h=400&fit=crop', category: 'Electronics'),
  Product(id: 2, name: 'MacBook Air M3', nameFr: 'MacBook Air M3', price: 1099, originalPrice: 1299, discount: 15, rating: 4.9, reviews: 1823, image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&h=400&fit=crop', category: 'Electronics'),
  Product(id: 3, name: 'Sony WH-1000XM5', nameFr: 'Casque Sony WH-1000XM5', price: 349, originalPrice: 399, discount: 13, rating: 4.7, reviews: 5621, image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop', category: 'Electronics'),
  Product(id: 4, name: 'Nike Air Max 270', nameFr: 'Nike Air Max 270', price: 129, originalPrice: 160, discount: 19, rating: 4.5, reviews: 3421, image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=400&fit=crop', category: 'Fashion'),
  Product(id: 5, name: 'PlayStation 5', nameFr: 'PlayStation 5', price: 499, originalPrice: 549, discount: 9, rating: 4.9, reviews: 8932, image: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?w=400&h=400&fit=crop', category: 'Electronics'),
  Product(id: 6, name: 'Instant Pot Duo', nameFr: 'Instant Pot Duo', price: 89, originalPrice: 119, discount: 25, rating: 4.7, reviews: 15234, image: 'https://images.unsplash.com/photo-1585515320310-259814833e62?w=400&h=400&fit=crop', category: 'Home'),
];
