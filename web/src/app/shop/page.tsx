import { redirect } from "next/navigation";

/** The storefront has no index of its own — send /shop to the product listing. */
export default function ShopIndexPage() {
  redirect("/shop/products");
}
