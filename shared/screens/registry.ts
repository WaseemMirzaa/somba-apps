/** Screen ID registry — maps CF/SF/AF/WF/RF IDs to web + Flutter routes. */

export type PortalPrefix = "CF" | "SF" | "AF" | "WF" | "RF";

export type ScreenEntry = {
  id: string;
  name: string;
  webRoute: string;
  flutterRoute?: string;
  portal: PortalPrefix;
};

export const SCREEN_REGISTRY: ScreenEntry[] = [
  // CF Customer (31 + extensions)
  { id: "CF-01", name: "Splash / Bootstrap", webRoute: "/", flutterRoute: "/", portal: "CF" },
  { id: "CF-02", name: "Home Feed", webRoute: "/shop/products", flutterRoute: "/home", portal: "CF" },
  { id: "CF-03", name: "Category Tree", webRoute: "/shop/categories", flutterRoute: "/categories", portal: "CF" },
  { id: "CF-04", name: "Product List", webRoute: "/shop/products", flutterRoute: "/products", portal: "CF" },
  { id: "CF-05", name: "Search Entry", webRoute: "/shop/search", flutterRoute: "/search", portal: "CF" },
  { id: "CF-06", name: "Search Results", webRoute: "/shop/search", flutterRoute: "/search/results", portal: "CF" },
  { id: "CF-07", name: "Store Front", webRoute: "/shop/stores/:id", flutterRoute: "/stores/:slug", portal: "CF" },
  { id: "CF-08", name: "Product Detail", webRoute: "/shop/products/:id", flutterRoute: "/products/:id", portal: "CF" },
  { id: "CF-09", name: "Cart", webRoute: "/shop/cart", flutterRoute: "/cart", portal: "CF" },
  { id: "CF-10", name: "Checkout", webRoute: "/shop/checkout", flutterRoute: "/checkout", portal: "CF" },
  { id: "CF-11", name: "Payment", webRoute: "/shop/checkout/payment", flutterRoute: "/checkout/payment", portal: "CF" },
  { id: "CF-12", name: "Order Confirmation", webRoute: "/shop/orders/:id/confirmed", flutterRoute: "/orders/:id/confirmed", portal: "CF" },
  { id: "CF-13", name: "Register", webRoute: "/shop/register", flutterRoute: "/register", portal: "CF" },
  { id: "CF-14", name: "Login", webRoute: "/shop/login", flutterRoute: "/login", portal: "CF" },
  { id: "CF-15", name: "OTP Verification", webRoute: "/shop/otp", flutterRoute: "/otp", portal: "CF" },
  { id: "CF-16", name: "Email Verification", webRoute: "/shop/verify-email", flutterRoute: "/verify-email", portal: "CF" },
  { id: "CF-17", name: "Forgot Password", webRoute: "/shop/forgot", flutterRoute: "/forgot", portal: "CF" },
  { id: "CF-18", name: "Reset Password", webRoute: "/shop/reset", flutterRoute: "/reset", portal: "CF" },
  { id: "CF-19", name: "Profile & Settings", webRoute: "/shop/account", flutterRoute: "/account", portal: "CF" },
  { id: "CF-20", name: "Address Book", webRoute: "/shop/account/addresses", flutterRoute: "/account/addresses", portal: "CF" },
  { id: "CF-21", name: "Address Form", webRoute: "/shop/account/addresses/new", flutterRoute: "/account/addresses/new", portal: "CF" },
  { id: "CF-22", name: "Order History", webRoute: "/shop/orders", flutterRoute: "/orders", portal: "CF" },
  { id: "CF-23", name: "Order Detail", webRoute: "/shop/orders/:id", flutterRoute: "/orders/:id", portal: "CF" },
  { id: "CF-24", name: "Order Tracking", webRoute: "/shop/orders/:id/tracking", flutterRoute: "/orders/:id/tracking", portal: "CF" },
  { id: "CF-25", name: "Return Request", webRoute: "/shop/orders/:id/return", flutterRoute: "/returns/new", portal: "CF" },
  { id: "CF-26", name: "Return Status", webRoute: "/shop/returns/:id", flutterRoute: "/returns/:id", portal: "CF" },
  { id: "CF-27", name: "Review Compose", webRoute: "/shop/products/:id/reviews", flutterRoute: "/reviews/compose", portal: "CF" },
  { id: "CF-28", name: "Wishlist", webRoute: "/shop/wishlist", flutterRoute: "/wishlist", portal: "CF" },
  { id: "CF-29", name: "Notification Centre", webRoute: "/shop/notifications", flutterRoute: "/notifications", portal: "CF" },
  { id: "CF-30", name: "Dispute Detail", webRoute: "/shop/disputes/:id", flutterRoute: "/disputes/:id", portal: "CF" },
  { id: "CF-31", name: "Help / Account Deletion", webRoute: "/shop/help", flutterRoute: "/help", portal: "CF" },
  { id: "CF-32", name: "Somba Wallet", webRoute: "/shop/wallet", flutterRoute: "/wallet", portal: "CF" },
  { id: "CF-33", name: "Refer & Earn", webRoute: "/shop/refer", flutterRoute: "/refer", portal: "CF" },
  { id: "CF-34", name: "Exchange Request", webRoute: "/shop/exchange", flutterRoute: "/exchange", portal: "CF" },
  { id: "CF-35", name: "Support Ticket", webRoute: "/shop/support", flutterRoute: "/support", portal: "CF" },
  { id: "CF-36", name: "Flash Deals Hub", webRoute: "/shop/deals", flutterRoute: "/deals", portal: "CF" },
  // SF Seller
  { id: "SF-01", name: "Seller Register", webRoute: "/seller/register", portal: "SF" },
  { id: "SF-02", name: "Pending Approval", webRoute: "/seller/pending", portal: "SF" },
  { id: "SF-03", name: "Login", webRoute: "/login", portal: "SF" },
  { id: "SF-04", name: "Dashboard Home", webRoute: "/seller", portal: "SF" },
  { id: "SF-05", name: "Storefront Settings", webRoute: "/seller/storefront", portal: "SF" },
  { id: "SF-06", name: "Storefront Preview", webRoute: "/seller/storefront/preview", portal: "SF" },
  { id: "SF-18", name: "Notification Centre", webRoute: "/seller/notifications", portal: "SF" },
  { id: "SF-19", name: "Dispute List", webRoute: "/seller/disputes", portal: "SF" },
  { id: "SF-20", name: "Dispute Detail", webRoute: "/seller/disputes/:id", portal: "SF" },
  { id: "SF-21", name: "Resubmit Registration", webRoute: "/seller/resubmit", portal: "SF" },
  // AF Admin
  { id: "AF-13", name: "Disputes Queue", webRoute: "/admin/disputes", portal: "AF" },
  { id: "AF-14", name: "Dispute Resolution", webRoute: "/admin/disputes/:id", portal: "AF" },
  { id: "AF-15", name: "Refund Authorisation", webRoute: "/admin/refunds", portal: "AF" },
  { id: "AF-16", name: "Payout Approval", webRoute: "/admin/payouts", portal: "AF" },
  { id: "AF-18", name: "Category Management", webRoute: "/admin/categories", portal: "AF" },
  // WF Warehouse
  { id: "WF-11", name: "Aged/Stuck Parcels", webRoute: "/warehouse/aged", portal: "WF" },
  { id: "WF-12", name: "Shift Reconciliation", webRoute: "/warehouse/reconciliation", portal: "WF" },
  // RF Rider
  { id: "RF-02", name: "First Password Set", webRoute: "/rider/first-password", flutterRoute: "/first-password", portal: "RF" },
  { id: "RF-07", name: "Batch Overview", webRoute: "/rider/batches/:id", flutterRoute: "/batches/:id", portal: "RF" },
  { id: "RF-09", name: "Proof of Delivery", webRoute: "/rider/tasks/:id/pod", flutterRoute: "/tasks/:id/pod", portal: "RF" },
  { id: "RF-10", name: "Failed Delivery", webRoute: "/rider/tasks/:id/fail", flutterRoute: "/tasks/:id/fail", portal: "RF" },
  { id: "RF-11", name: "COD Shift Summary", webRoute: "/rider/cod/summary", flutterRoute: "/cod/summary", portal: "RF" },
  { id: "RF-13", name: "Task History", webRoute: "/rider/history", flutterRoute: "/history", portal: "RF" },
  { id: "RF-14", name: "Notification Centre", webRoute: "/rider/notifications", flutterRoute: "/notifications", portal: "RF" },
];

export function getScreen(id: string): ScreenEntry | undefined {
  return SCREEN_REGISTRY.find((s) => s.id === id);
}
