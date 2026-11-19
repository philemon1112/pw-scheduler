import type { Metadata } from "next";

import { LocationsView } from "@/components/locations/locations-view";
import { SpecialDaysSection } from "@/components/special-days/special-days-section";
import { listLocations } from "@/db/queries/locations";
import { getSettings } from "@/db/queries/settings";
import { listSpecialDays } from "@/db/queries/special-days";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { todayInAccra } from "@/lib/dates/calendar";

export const metadata: Metadata = { title: "Locations & slots" };

export default async function LocationsPage() {
  const user = await requireUser();
  const [places, rules, settings] = await Promise.all([listLocations(), listSpecialDays(), getSettings()]);
  const canEdit = hasRole(user, "editor");

  return (
    <LocationsView
      locations={places.map((place) => ({
        id: place.id,
        key: place.key,
        name: place.name,
        messageName: place.messageName,
        pdfTitle: place.pdfTitle,
        pdfColor: place.pdfColor,
        active: place.active,
        slots: place.slots.map((slot) => ({
          id: slot.id,
          weekday: slot.weekday,
          startTime: slot.startTime.slice(0, 5),
          endTime: slot.endTime.slice(0, 5),
          pdfDayLabel: slot.pdfDayLabel,
          pdfTimeLabel: slot.pdfTimeLabel,
          active: slot.active,
        })),
      }))}
      canEdit={canEdit}
    >
      <SpecialDaysSection
        rules={rules}
        locations={places
          .filter((place) => place.active)
          .map((place) => ({
            id: place.id,
            key: place.key,
            name: place.name,
            slots: place.slots.map((slot) => ({
              id: slot.id,
              locationId: place.id,
              weekday: slot.weekday,
              startTime: slot.startTime.slice(0, 5),
              endTime: slot.endTime.slice(0, 5),
              active: slot.active,
              sortOrder: slot.sortOrder,
            })),
          }))}
        settings={{ weekRule: settings.weekRule, includeFifthWeek: settings.includeFifthWeek }}
        today={todayInAccra()}
        canEdit={canEdit}
      />
    </LocationsView>
  );
}
