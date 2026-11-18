import type { Metadata } from "next";

import { LocationsView } from "@/components/locations/locations-view";
import { listLocations } from "@/db/queries/locations";
import { hasRole } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Locations & slots" };

export default async function LocationsPage() {
  const user = await requireUser();
  const places = await listLocations();
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
      canEdit={hasRole(user, "editor")}
    />
  );
}
