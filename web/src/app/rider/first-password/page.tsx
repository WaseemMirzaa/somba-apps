import { redirect } from "next/navigation";

/** The server has no first-password step for riders yet; this retired page just sends people to their account. */
export default function RiderFirstPasswordRedirect() {
  redirect("/rider/profile");
}
