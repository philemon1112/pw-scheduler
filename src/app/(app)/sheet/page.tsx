import { redirect } from "next/navigation";

import { monthOf, todayInAccra } from "@/lib/dates/calendar";

/** The sheet opens on this month in Accra. */
export default function SheetPage() {
  redirect(`/sheet/${monthOf(todayInAccra())}`);
}
