import { z } from "zod";

import { WEEKDAYS, type Weekday } from "@/lib/dates/calendar";
import { minutesOf } from "@/lib/dates/time";

const Time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Enter a time like 06:30.");

export const SlotInput = z
  .object({
    id: z.string().uuid().nullable(),
    weekday: z.enum(WEEKDAYS as [Weekday, ...Weekday[]]),
    startTime: Time,
    endTime: Time,
    pdfDayLabel: z.string().trim().min(1, "Give each slot a day label for the sheet.").max(40),
    pdfTimeLabel: z.string().trim().max(40),
    active: z.boolean(),
  })
  .refine((slot) => minutesOf(slot.endTime) > minutesOf(slot.startTime), { message: "A slot has to end after it starts.", path: ["endTime"] });

export const LocationInput = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1, "Give the location a name.").max(80),
  messageName: z.string().trim().min(1, "Give the name used in messages.").max(80),
  pdfTitle: z.string().trim().min(1, "Give the title used on the sheet.").max(120),
  pdfColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Pick a colour."),
  active: z.boolean(),
  slots: z.array(SlotInput).max(40),
});

export type LocationInput = z.infer<typeof LocationInput>;
export type SlotInput = z.infer<typeof SlotInput>;
