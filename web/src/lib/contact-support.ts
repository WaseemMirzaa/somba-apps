/**
 * "Contact support": customers no longer message sellers (docs/contracts/admin-controls.md §3); every contact entry opens a new
 * support ticket with the order or the product already filled in. The link carries the context, the ticket form reads it.
 */

export interface ContactSupportContext {
  /** An order id or reference: the ticket is linked to it. */
  orderId?: string | null;
  /** A product: the ticket subject and the first line of the message name it. */
  productId?: string | null;
  productName?: string | null;
  /** A store page: the ticket names the store. */
  storeName?: string | null;
}

export function contactSupportHref(ctx: ContactSupportContext = {}): string {
  const q = new URLSearchParams();
  if (ctx.orderId) q.set("order", ctx.orderId);
  if (ctx.productId) q.set("product", ctx.productId);
  if (ctx.productName) q.set("productName", ctx.productName);
  if (ctx.storeName) q.set("store", ctx.storeName);
  const s = q.toString();
  return s ? `/shop/support?${s}` : "/shop/support";
}

/** The subject and message the new-ticket form starts with for a given context (empty when there is no context). */
export function contactSupportPrefill(
  params: { get(name: string): string | null },
  fr: boolean,
  origin = "",
): { subject: string; message: string; orderParam: string | null } {
  const orderParam = params.get("order");
  const productId = params.get("product");
  const productName = params.get("productName");
  const store = params.get("store");
  let subject = params.get("subject") ?? "";
  let message = "";
  if (productId) {
    const name = productName || productId;
    subject = subject || (fr ? `Question sur le produit ${name}` : `Question about ${name}`);
    message = `${fr ? "Produit" : "Product"}: ${name}\n${origin}/shop/products/${productId}\n\n`;
  } else if (store) {
    subject = subject || (fr ? `Question sur la boutique ${store}` : `Question about the store ${store}`);
    message = `${fr ? "Boutique" : "Store"}: ${store}\n\n`;
  }
  return { subject, message, orderParam };
}
