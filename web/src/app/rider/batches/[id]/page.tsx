import { redirect } from "next/navigation";

/** Riders get individual deliveries (no batch concept on the server for them); the retired batch page now opens the task list. */
export default function RiderBatchRedirect() {
  redirect("/rider/tasks");
}
