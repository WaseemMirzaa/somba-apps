import { redirect } from "next/navigation";

/** Riders are salaried: this page used to show pay per task. It is now "My work"; old links and bookmarks land there. */
export default function RiderEarningsRedirect() {
  redirect("/rider/work");
}
