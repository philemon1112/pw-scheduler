import { CalendarDays, History, MapPin, MessageCircle, Printer, Settings, Users, type LucideIcon } from "lucide-react";

/**
 * The destinations, in one place (§10's order). The sidebar and the phone's
 * tab bar are different components but must never disagree about what the
 * app contains, so both read this list. `tab` marks the four that fit the tab
 * bar; the rest live behind its "More" button.
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  tab: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/schedule", label: "Schedule", icon: CalendarDays, tab: true },
  { href: "/sheet", label: "Sheet & print", icon: Printer, tab: false },
  { href: "/members", label: "Members", icon: Users, tab: true },
  { href: "/messages", label: "Messages", icon: MessageCircle, tab: true },
  { href: "/locations", label: "Locations", icon: MapPin, tab: false },
  { href: "/history", label: "History", icon: History, tab: false },
  { href: "/settings", label: "Settings", icon: Settings, tab: false },
];

export function isActive(item: Pick<NavItem, "href">, pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
