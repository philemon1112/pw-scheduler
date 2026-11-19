import { redirect } from "next/navigation";

import { monthOf, todayInAccra } from "@/lib/dates/calendar";

/** The schedule opens on this month in Accra. */
export default function SchedulePage() {
  redirect(`/schedule/${monthOf(todayInAccra())}`);
}
