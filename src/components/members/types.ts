import type { MemberRow } from "@/db/queries/members";
import type { Weekday } from "@/lib/dates/calendar";

export type { MemberRow };

export interface LocationOption {
  id: string;
  key: string;
  name: string;
  slots: { id: string; weekday: Weekday; startTime: string; endTime: string }[];
}

export type Limits = Record<"publisher" | "auxiliary_pioneer" | "regular_pioneer", number>;
