export const products = [
  { id: 1, name: 'Samsung Galaxy S24 Ultra', price: 1199, originalPrice: 1399, discount: 14, rating: 4.8, reviews: 2341, category: 'Electronics', seller: 'TechZone Store', stock: 45 },
  { id: 2, name: 'Apple MacBook Air M3', price: 1099, originalPrice: 1299, discount: 15, rating: 4.9, reviews: 1823, category: 'Electronics', seller: 'Apple Official', stock: 23 },
  { id: 3, name: 'Sony WH-1000XM5', price: 349, originalPrice: 399, discount: 13, rating: 4.7, reviews: 5621, category: 'Electronics', seller: 'AudioHub', stock: 120 },
];

export const orders = [
  { id: 'ORD-2024-001', customer: 'Marie Dubois', amount: 1199, status: 'delivered', date: '2024-06-01' },
  { id: 'ORD-2024-002', customer: 'John Smith', amount: 349, status: 'processing', date: '2024-06-02' },
];

export const sellers = [
  { id: 1, name: 'NewTech Solutions', owner: 'Jean Dupont', status: 'pending' },
  { id: 2, name: 'Belle Mode', owner: 'Claire Bernard', status: 'pending' },
];

export const adminStats = { todayOrders: 1247, revenue: 89432, pendingApprovals: 12, activeSellers: 3421 };
