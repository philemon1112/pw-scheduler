import { redirect } from "next/navigation";

/** The app opens on the schedule; the proxy has already sent anyone signed out to /login. */
export default function Home() {
  redirect("/schedule");
}
