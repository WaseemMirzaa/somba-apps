import { products, orders, sellers, warehouseParcels, sellerProducts } from "./mock-data";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SellerEntity = {
  id: number;
  storeName: string;
  owner: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  address: string;
  status: "pending" | "approved" | "suspended";
  category: string;
  date: string;
  orders: number;
  revenue: number;
  returns: number;
  cancellations: number;
  rating: number;
  healthScore: number;
  availableBalance: number;
  pendingBalance: number;
  paidBalance: number;
  commission: number;
  timeline: { time: string; label: string; detail?: string }[];
};

export type OrderEntity = {
  id: string;
  customerId: number;
  customer: string;
  customerPhone: string;
  customerAddress: string;
  customerCity: string;
  sellerId: number;
  seller: string;
  amount: number;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  transactionId: string;
  date: string;
  itemsCount: number;
  items: {
    productId: number;
    name: string;
    sku: string;
    variant: string;
    qty: number;
    price: number;
    image: string;
  }[];
  warehouse: string;
  rider: string;
  trackingNumber: string;
  commission: number;
  sellerEarnings: number;
  refunds: number;
  timeline: { time: string; label: string; detail?: string; done?: boolean }[];
};

export type ProductModerationEntity = {
  id: number;
  name: string;
  sellerId: number;
  seller: string;
  sellerRating: number;
  category: string;
  brand: string;
  price: number;
  discount: number;
  description: string;
  status: "pending" | "approved" | "rejected";
  submittedDate: string;
  image: string;
  images: string[];
};

export type CustomerEntity = {
  id: number;
  name: string;
  email: string;
  phone: string;
  city: string;
  orders: number;
  totalSpent: number;
  status: "active" | "suspended";
  joined: string;
};

export type ParcelEntity = {
  id: string;
  barcode: string;
  orderId: string;
  sellerId: number;
  seller: string;
  sellerPhone: string;
  customerId: number;
  customer: string;
  customerAddress: string;
  zone: string;
  weight: string;
  status: string;
  arrival: string;
  priority: string;
  rider: string;
  items: { sku: string; product: string; variant: string; qty: number }[];
  inspection: { condition: string; photos: number; exceptions: string };
  timeline: { time: string; label: string; detail?: string; done?: boolean }[];
};

export type BatchEntity = {
  id: string;
  zone: string;
  parcelCount: number;
  riderId: number;
  rider: string;
  riderPhone: string;
  vehicle: string;
  status: string;
  dispatchTime: string;
  distance: string;
  eta: string;
  stops: number;
  parcels: { parcelId: string; orderId: string; customer: string }[];
  timeline: { time: string; label: string; detail?: string; done?: boolean }[];
};

export type ProductDetailEntity = {
  id: number;
  sku: string;
  name: string;
  nameFr: string;
  brand: string;
  category: string;
  subcategory: string;
  price: number;
  originalPrice: number;
  discount: number;
  tax: number;
  walletCashback: number;
  rating: number;
  reviews: number;
  stock: number;
  inStock: boolean;
  deliveryDays: number;
  codAvailable: boolean;
  openBoxAvailable: boolean;
  returnWindow: number;
  sellerId: number;
  seller: string;
  sellerRating: number;
  sellerFollowers: number;
  sellerHealthScore: number;
  description: string;
  features: string[];
  specifications: Record<string, string>;
  warranty: string;
  image: string;
  images: string[];
  variants: { name: string; options: string[] }[];
  reviews_list: { author: string; rating: number; text: string; date: string }[];
  questions: { q: string; a: string; author: string }[];
};

// ─── Seller entities ─────────────────────────────────────────────────────────

export const sellerEntities: SellerEntity[] = [
  {
    id: 1, storeName: "NewTech Solutions", owner: "Jean Dupont", email: "jean@newtech.com",
    phone: "+33 6 12 34 56 78", city: "Paris", country: "France", address: "12 Rue de Rivoli",
    status: "pending", category: "Electronics", date: "2024-06-05", orders: 0, revenue: 0,
    returns: 0, cancellations: 0, rating: 0, healthScore: 0, availableBalance: 0,
    pendingBalance: 0, paidBalance: 0, commission: 12,
    timeline: [
      { time: "2024-06-05 10:00", label: "Registered", detail: "Application submitted" },
    ],
  },
  {
    id: 2, storeName: "Belle Mode", owner: "Claire Bernard", email: "claire@bellemode.fr",
    phone: "+33 6 98 76 54 32", city: "Lyon", country: "France", address: "8 Avenue Victor Hugo",
    status: "pending", category: "Fashion", date: "2024-06-04", orders: 0, revenue: 0,
    returns: 0, cancellations: 0, rating: 0, healthScore: 0, availableBalance: 0,
    pendingBalance: 0, paidBalance: 0, commission: 15,
    timeline: [
      { time: "2024-06-04 14:30", label: "Registered", detail: "Application submitted" },
    ],
  },
  {
    id: 3, storeName: "TechZone Store", owner: "Mike Johnson", email: "mike@gadgetworld.com",
    phone: "+1 555 123 4567", city: "Kinshasa", country: "DRC", address: "Gombe, Blvd du 30 Juin",
    status: "approved", category: "Electronics", date: "2024-01-15", orders: 1240, revenue: 894320,
    returns: 34, cancellations: 12, rating: 4.8, healthScore: 92, availableBalance: 12450,
    pendingBalance: 3200, paidBalance: 156000, commission: 12,
    timeline: [
      { time: "2024-01-15", label: "Registered" },
      { time: "2024-01-18", label: "Approved", detail: "By Admin Sarah" },
      { time: "2024-02-01", label: "First Product Added" },
      { time: "2024-02-15", label: "First Order Received" },
      { time: "2024-05-01", label: "Payout Processed", detail: "$12,000" },
    ],
  },
  {
    id: 4, storeName: "HomeEssentials", owner: "Sarah Lee", email: "sarah@organic.com",
    phone: "+1 555 987 6543", city: "Brazzaville", country: "Congo", address: "Centre Ville",
    status: "approved", category: "Home & Living", date: "2024-02-20", orders: 567, revenue: 234500,
    returns: 18, cancellations: 8, rating: 4.7, healthScore: 88, availableBalance: 8900,
    pendingBalance: 1500, paidBalance: 89000, commission: 10,
    timeline: [
      { time: "2024-02-20", label: "Registered" },
      { time: "2024-02-22", label: "Approved" },
      { time: "2024-03-01", label: "Products Added", detail: "45 products" },
    ],
  },
];

// ─── Customer entities ───────────────────────────────────────────────────────

export const customerEntities: CustomerEntity[] = [
  { id: 1, name: "Marie Dubois", email: "marie@email.com", phone: "+33 6 11 22 33 44", city: "Paris", orders: 12, totalSpent: 4521, status: "active", joined: "2023-08-15" },
  { id: 2, name: "John Smith", email: "john@email.com", phone: "+1 555 111 2222", city: "New York", orders: 8, totalSpent: 2340, status: "active", joined: "2023-11-02" },
  { id: 3, name: "Sophie Martin", email: "sophie@email.com", phone: "+33 6 55 66 77 88", city: "Lyon", orders: 5, totalSpent: 890, status: "active", joined: "2024-01-20" },
  { id: 4, name: "Ahmed Hassan", email: "ahmed@email.com", phone: "+243 99 123 4567", city: "Kinshasa", orders: 23, totalSpent: 12450, status: "active", joined: "2023-05-10" },
];

// ─── Order entities ──────────────────────────────────────────────────────────

export const orderEntities: OrderEntity[] = orders.map((o, i) => {
  const product = products[i % products.length];
  const seller = sellerEntities.find((s) => s.storeName === o.seller) ?? sellerEntities[2];
  const customer = customerEntities[i % customerEntities.length];
  return {
    id: o.id,
    customerId: customer.id,
    customer: o.customer,
    customerPhone: customer.phone,
    customerAddress: "123 Main Street, Apt 4B",
    customerCity: customer.city,
    sellerId: seller.id,
    seller: o.seller,
    amount: o.amount,
    status: o.status,
    paymentMethod: i % 2 === 0 ? "COD" : "Card",
    paymentStatus: o.status === "cancelled" ? "refunded" : "paid",
    transactionId: `TXN-${o.id.replace("ORD-", "")}`,
    date: o.date,
    itemsCount: 1,
    items: [{
      productId: product.id,
      name: product.name,
      sku: `SKU-${product.id}`,
      variant: "Default",
      qty: 1,
      price: product.price,
      image: product.image,
    }],
    warehouse: "Kinshasa Hub",
    rider: "Jean-Pierre M.",
    trackingNumber: `TRK-${o.id.replace("ORD-", "")}`,
    commission: Math.round(o.amount * 0.12),
    sellerEarnings: Math.round(o.amount * 0.88),
    refunds: o.status === "cancelled" ? o.amount : 0,
    timeline: [
      { time: `${o.date} 09:00`, label: "Placed", done: true },
      { time: `${o.date} 09:05`, label: "Paid", done: o.status !== "pending" },
      { time: `${o.date} 11:00`, label: "Packed", done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 14:00`, label: "Picked", done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 16:00`, label: "Warehouse", done: ["processing", "delivered"].includes(o.status) },
      { time: `${o.date} 18:00`, label: "Dispatched", done: o.status === "delivered" },
      { time: `${o.date} 20:00`, label: "Delivered", done: o.status === "delivered" },
    ],
  };
});

// ─── Product moderation ───────────────────────────────────────────────────────

export const moderationQueue: ProductModerationEntity[] = [
  {
    id: 101, name: "New Phone Model X", sellerId: 3, seller: "TechZone Store", sellerRating: 4.8,
    category: "Electronics", brand: "Samsung", price: 899, discount: 10,
    description: "Latest flagship smartphone with advanced camera system.",
    status: "pending", submittedDate: "2024-06-05",
    image: products[0].image, images: [products[0].image],
  },
  {
    id: 102, name: "Wireless Earbuds Pro", sellerId: 4, seller: "HomeEssentials", sellerRating: 4.7,
    category: "Electronics", brand: "Sony", price: 149, discount: 20,
    description: "Premium noise-cancelling wireless earbuds.",
    status: "pending", submittedDate: "2024-06-04",
    image: products[2].image, images: [products[2].image],
  },
  {
    id: 103, name: "Summer Dress Collection", sellerId: 2, seller: "Belle Mode", sellerRating: 0,
    category: "Fashion", brand: "Zara", price: 59, discount: 30,
    description: "Elegant summer dresses in various colors.",
    status: "pending", submittedDate: "2024-06-03",
    image: products[3].image, images: [products[3].image],
  },
];

// ─── Parcel entities ──────────────────────────────────────────────────────────

export const parcelEntities: ParcelEntity[] = warehouseParcels.map((p, i) => {
  const order = orderEntities.find((o) => o.id === p.orderId);
  const seller = sellerEntities.find((s) => s.storeName.includes(p.seller.split(" ")[0])) ?? sellerEntities[2];
  return {
    id: p.id,
    barcode: `BC-${p.id}`,
    orderId: p.orderId,
    sellerId: seller.id,
    seller: p.seller,
    sellerPhone: seller.phone,
    customerId: order?.customerId ?? 1,
    customer: order?.customer ?? "Unknown",
    customerAddress: order?.customerAddress ?? "N/A",
    zone: p.zone,
    weight: `${(1.2 + i * 0.3).toFixed(1)} kg`,
    status: p.status,
    arrival: p.arrival,
    priority: p.priority,
    rider: order?.rider ?? "Unassigned",
    items: order?.items.map((item) => ({
      sku: item.sku,
      product: item.name,
      variant: item.variant,
      qty: item.qty,
    })) ?? [],
    inspection: {
      condition: p.status === "received" ? "Good" : "Pending",
      photos: p.status === "received" ? 2 : 0,
      exceptions: "None",
    },
    timeline: [
      { time: "07:00", label: "Collected", done: true },
      { time: p.arrival, label: "Arrived", done: ["received", "sorting", "ready", "dispatched"].includes(p.status) },
      { time: "—", label: "Received", done: ["received", "sorting", "ready", "dispatched"].includes(p.status) },
      { time: "—", label: "Sorted", done: ["sorting", "ready", "dispatched"].includes(p.status) },
    ],
  };
});

// ─── Batch entities ───────────────────────────────────────────────────────────

export const batchEntities: BatchEntity[] = [
  {
    id: "BATCH-001", zone: "Zone A", parcelCount: 12, riderId: 1, rider: "Jean-Pierre M.",
    riderPhone: "+243 99 111 2233", vehicle: "Motorcycle", status: "dispatched",
    dispatchTime: "08:30", distance: "24 km", eta: "12:00", stops: 12,
    parcels: parcelEntities.slice(0, 3).map((p) => ({
      parcelId: p.id, orderId: p.orderId, customer: p.customer,
    })),
    timeline: [
      { time: "07:45", label: "Batch Created", done: true },
      { time: "08:00", label: "Rider Assigned", done: true },
      { time: "08:30", label: "Dispatched", done: true },
      { time: "—", label: "In Transit", done: false },
    ],
  },
  {
    id: "BATCH-002", zone: "Zone B", parcelCount: 8, riderId: 2, rider: "Paul Kabongo",
    riderPhone: "+243 99 444 5566", vehicle: "Van", status: "ready",
    dispatchTime: "—", distance: "18 km", eta: "—", stops: 8,
    parcels: parcelEntities.slice(3, 5).map((p) => ({
      parcelId: p.id, orderId: p.orderId, customer: p.customer,
    })),
    timeline: [
      { time: "09:00", label: "Batch Created", done: true },
      { time: "09:15", label: "Rider Assigned", done: true },
      { time: "—", label: "Dispatched", done: false },
    ],
  },
];

// ─── Product detail entities ──────────────────────────────────────────────────

export const productDetailEntities: ProductDetailEntity[] = products.map((p) => {
  const store = sellerEntities.find((s) => s.storeName === p.seller) ?? sellerEntities[2];
  return {
    id: p.id,
    sku: `SKU-${p.id}-001`,
    name: p.name,
    nameFr: p.nameFr,
    brand: p.name.split(" ")[0],
    category: p.category,
    subcategory: p.category,
    price: p.price,
    originalPrice: p.originalPrice,
    discount: p.discount,
    tax: Math.round(p.price * 0.1),
    walletCashback: Math.round(p.price * 0.02),
    rating: p.rating,
    reviews: p.reviews,
    stock: p.stock,
    inStock: p.stock > 0,
    deliveryDays: p.deliveryDays,
    codAvailable: true,
    openBoxAvailable: p.price > 200,
    returnWindow: 7,
    sellerId: store.id,
    seller: p.seller,
    sellerRating: store.rating,
    sellerFollowers: 45000,
    sellerHealthScore: store.healthScore,
    description: `Premium ${p.name} with excellent build quality and performance. Ideal for everyday use.`,
    features: ["Premium build", "Warranty included", "Fast delivery", "Easy returns"],
    specifications: {
      Weight: "250g",
      Dimensions: "15 x 8 x 2 cm",
      Material: "Premium",
      Color: "Black",
      Warranty: "1 Year",
    },
    warranty: "1 Year Manufacturer Warranty",
    image: p.image,
    images: [p.image, p.image],
    variants: [
      { name: "Color", options: ["Black", "Blue", "Silver"] },
      { name: "Storage", options: ["128GB", "256GB", "512GB"] },
    ],
    reviews_list: [
      { author: "Marie D.", rating: 5, text: "Excellent product, fast delivery!", date: "2024-05-20" },
      { author: "John S.", rating: 4, text: "Good value for money.", date: "2024-05-15" },
    ],
    questions: [
      { q: "Is this original?", a: "Yes, 100% authentic with warranty.", author: "Seller" },
      { q: "Pay at delivery available?", a: "Yes, pay at delivery is available on eligible items.", author: "Seller" },
    ],
  };
});

// ─── Seller product detail (extended) ─────────────────────────────────────────

export const sellerProductDetails = sellerProducts.map((sp) => ({
  ...sp,
  brand: "Samsung",
  category: "Electronics",
  description: `High-quality ${sp.name} from official distributor.`,
  image: products[0].image,
  views: 12400,
  wishlist: 340,
  addToCart: 890,
  orders: sp.sold,
  revenue: sp.sold * sp.price,
  variants: [
    { name: "256GB Black", sku: sp.sku, stock: sp.stock, price: sp.price },
    { name: "512GB Black", sku: `${sp.sku}-512`, stock: Math.max(0, sp.stock - 2), price: sp.price + 100 },
  ],
  timeline: [
    { time: "2024-01-20", label: "Created" },
    { time: "2024-01-22", label: "Approved", detail: "Moderation passed" },
    { time: "2024-02-01", label: "First Sale" },
  ],
}));

// ─── Lookup helpers ───────────────────────────────────────────────────────────

export function getSeller(id: number) {
  return sellerEntities.find((s) => s.id === id);
}

export function getOrder(id: string) {
  return orderEntities.find((o) => o.id === id);
}

export function getCustomer(id: number) {
  return customerEntities.find((c) => c.id === id);
}

export function getModerationProduct(id: number) {
  return moderationQueue.find((p) => p.id === id);
}

export function getParcel(id: string) {
  return parcelEntities.find((p) => p.id === id);
}

export function getBatch(id: string) {
  return batchEntities.find((b) => b.id === id);
}

export function getProductDetail(id: number) {
  return productDetailEntities.find((p) => p.id === id);
}

export function getSellerProduct(id: number) {
  return sellerProductDetails.find((p) => p.id === id);
}
